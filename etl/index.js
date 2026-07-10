// ============================================================
// dcsmart-etl — Cloud Run Job
// Extracción incremental Cloud SQL → BigQuery (micro-batch)
// Disparado por Cloud Scheduler: 0 6,12,20 * * * (America/Argentina/Buenos_Aires)
// Solo LEE la base de producción (usuario analytics_ro, statement_timeout 15s)
// ============================================================
import pg from 'pg'
import { BigQuery } from '@google-cloud/bigquery'
import crypto from 'node:crypto'

const {
  PGHOST, PGDATABASE = 'postgres', PGUSER = 'analytics_ro', PGPASSWORD,
  BQ_PROJECT, BQ_DATASET = 'dcsmart_analytics'
} = process.env

const bq = new BigQuery({ projectId: BQ_PROJECT })
const ds = bq.dataset(BQ_DATASET)
const runId = crypto.randomUUID()
const corte = corteActual()

function corteActual () {
  const h = new Date().toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })
  return { '06': '06:00', '12': '12:00', '20': '20:00' }[h] || 'manual'
}

// ------- Definición de tablas a sincronizar -------
// incremental: MERGE por id con filtro updated_at > watermark
// full: TRUNCATE + carga completa (dimensiones chicas)
const SYNC = [
  {
    name: 'pagos', mode: 'incremental', bqTable: 'raw_pagos',
    sql: (wm) => ({
      text: `SELECT id, nro_ord, fecha, id_proveedor, id_rubcat,
                    id_tipo::text AS id_tipo, importe_neto, descuento, importe,
                    id_metodo, cashflow, observaciones, pagado, fecha_pago,
                    estado_op::text AS estado_op, periodo, ingresa_egreso,
                    id_local, created_at, updated_at
             FROM pagos WHERE updated_at > $1 ORDER BY updated_at LIMIT 50000`,
      values: [wm]
    }),
    map: r => ({ ...tsFields(r, ['fecha','cashflow','fecha_pago','periodo','created_at','updated_at']),
                 fecha_dia: r.fecha ? r.fecha.toISOString().slice(0,10) : null }),
    valSql: 'SELECT COUNT(*)::int AS c, COALESCE(SUM(importe),0) AS s FROM pagos',
    valBq:  `SELECT COUNT(*) AS c, COALESCE(SUM(importe),0) AS s FROM ${BQ_DATASET}.raw_pagos`
  },
  {
    name: 'cajas', mode: 'incremental', bqTable: 'raw_cajas',
    sql: (wm) => ({
      text: `SELECT id, nro_turno, fecha_inicio, fecha_cierre, id_local, cajero,
                    total, efectivo, fiscal, comensales, tickets,
                    origin::text AS origin, created_at, updated_at
             FROM cajas WHERE updated_at > $1 ORDER BY updated_at LIMIT 50000`,
      values: [wm]
    }),
    map: r => ({ ...tsFields(r, ['fecha_inicio','fecha_cierre','created_at','updated_at']),
                 fecha_dia: r.fecha_inicio ? r.fecha_inicio.toISOString().slice(0,10) : null }),
    valSql: 'SELECT COUNT(*)::int AS c, COALESCE(SUM(total),0) AS s FROM cajas',
    valBq:  `SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS s FROM ${BQ_DATASET}.raw_cajas`
  },
  {
    name: 'caja_movimientos', mode: 'full', bqTable: 'raw_caja_movimientos',
    sql: () => ({ text: `SELECT id, tipo::text AS tipo, id_metodo, monto, id_caja, cantidad FROM caja_movimientos` }),
    map: r => r
  },
  {
    name: 'caja_detalles', mode: 'full', bqTable: 'raw_caja_detalles',
    sql: () => ({ text: `SELECT id, id_caja, tipo, id_tipo, nombre, monto, observaciones, created_at FROM caja_detalles` }),
    map: r => tsFields(r, ['created_at'])
  },
  { name: 'locales', mode: 'full', bqTable: 'dim_locales',
    sql: () => ({ text: 'SELECT id, nombre, activo, id_app FROM locales' }), map: r => r },
  { name: 'proveedores', mode: 'full', bqTable: 'dim_proveedores',
    sql: () => ({ text: 'SELECT id, nombre, razon_social, cuit, id_rubcat FROM proveedores' }), map: r => r },
  { name: 'rubcat', mode: 'full', bqTable: 'dim_rubcat',
    sql: () => ({ text: `SELECT rc.id, r.nombre AS rubro, c.nombre AS categoria, rc.cuenta
                         FROM rubcat rc LEFT JOIN rubros r ON r.id = rc.id_rub
                         LEFT JOIN categorias c ON c.id = rc.id_cat` }), map: r => r },
  { name: 'metodos_pago', mode: 'full', bqTable: 'dim_metodos_pago',
    sql: () => ({ text: 'SELECT id, nombre FROM metodos_pago' }), map: r => r },
  { name: 'apps', mode: 'full', bqTable: 'dim_apps',
    sql: () => ({ text: 'SELECT id, nombre, slug, activo FROM apps' }), map: r => r }
]

function tsFields (row, fields) {
  const out = { ...row }
  for (const f of fields) if (out[f] instanceof Date) out[f] = out[f].toISOString()
  for (const k in out) if (typeof out[k] === 'object' && out[k] !== null && out[k].constructor?.name === 'Decimal') out[k] = Number(out[k])
  return out
}

async function getWatermark (tabla) {
  const [rows] = await bq.query({
    query: `SELECT watermark FROM ${BQ_DATASET}.etl_watermarks WHERE tabla = @t`,
    params: { t: tabla }
  })
  return rows[0]?.watermark?.value || '1970-01-01T00:00:00Z'
}

async function setWatermark (tabla, wm) {
  await bq.query({
    query: `MERGE ${BQ_DATASET}.etl_watermarks w
            USING (SELECT @t AS tabla, TIMESTAMP(@wm) AS watermark) s ON w.tabla = s.tabla
            WHEN MATCHED THEN UPDATE SET watermark = s.watermark, updated_at = CURRENT_TIMESTAMP()
            WHEN NOT MATCHED THEN INSERT (tabla, watermark, updated_at) VALUES (s.tabla, s.watermark, CURRENT_TIMESTAMP())`,
    params: { t: tabla, wm }
  })
}

async function loadRows (bqTable, rows, mode, mergeKeys = ['id']) {
  if (!rows.length && mode === 'incremental') return 0
  const loadedAt = new Date().toISOString()
  rows = rows.map(r => ({ ...r, _etl_loaded_at: bqTable.startsWith('raw_') ? loadedAt : undefined }))

  if (mode === 'full') {
    // dims: truncado + insert (chicas, sin partición)
    await bq.query(`TRUNCATE TABLE ${BQ_DATASET}.${bqTable}`)
    if (rows.length) await ds.table(bqTable).insert(rows, { ignoreUnknownValues: true })
    return rows.length
  }

  // incremental: staging + MERGE por id (idempotente, soporta updates)
  const staging = `${bqTable}_stg_${runId.slice(0, 8)}`
  const [table] = await ds.table(bqTable).get()
  const schema = table.metadata.schema
  await ds.createTable(staging, { schema, expirationTime: Date.now() + 3600_000 })
  await ds.table(staging).insert(rows, { ignoreUnknownValues: true })

  const cols = schema.fields.map(f => f.name)
  const on = mergeKeys.map(k => `T.${k} = S.${k}`).join(' AND ')
  const upd = cols.filter(c => !mergeKeys.includes(c)).map(c => `T.${c} = S.${c}`).join(', ')
  await bq.query(`
    MERGE ${BQ_DATASET}.${bqTable} T
    USING ${BQ_DATASET}.${staging} S ON ${on}
    WHEN MATCHED THEN UPDATE SET ${upd}
    WHEN NOT MATCHED THEN INSERT (${cols.join(',')}) VALUES (${cols.map(c => 'S.' + c).join(',')})`)
  await ds.table(staging).delete()
  return rows.length
}

async function logRun (pgClient, def, filas) {
  let pgc = null, bqc = null, pgs = null, bqs = null, estado = 'OK'
  if (def.valSql && def.valBq) {
    const { rows: [pgr] } = await pgClient.query(def.valSql)
    const [[bqr]] = await bq.query(def.valBq)
    pgc = Number(pgr.c); bqc = Number(bqr.c)
    pgs = Number(pgr.s); bqs = Number(bqr.s)
    // tolerancia de centavos por redondeo NUMERIC
    if (pgc !== bqc || Math.abs(pgs - bqs) > 0.01) estado = 'MISMATCH'
  }
  await ds.table('etl_runs').insert([{
    run_id: runId, started_at: START.toISOString(), finished_at: new Date().toISOString(),
    corte, tabla: def.name, filas_procesadas: filas,
    pg_count: pgc, bq_count: bqc, pg_sum: pgs, bq_sum: bqs, estado
  }])
  return estado
}

const START = new Date()
async function main () {
  const pgClient = new pg.Client({ host: PGHOST, database: PGDATABASE, user: PGUSER, password: PGPASSWORD })
  await pgClient.connect()
  console.log(`[dcsmart-etl] run=${runId} corte=${corte}`)
  let mismatches = 0

  for (const def of SYNC) {
    try {
      let rows, newWm = null
      if (def.mode === 'incremental') {
        const wm = await getWatermark(def.name)
        const res = await pgClient.query(def.sql(wm))
        rows = res.rows
        if (rows.length) newWm = rows[rows.length - 1].updated_at.toISOString()
      } else {
        const res = await pgClient.query(def.sql())
        rows = res.rows
      }
      const mapped = rows.map(def.map)
      const n = await loadRows(def.bqTable, mapped, def.mode)
      if (newWm) await setWatermark(def.name, newWm)
      const estado = await logRun(pgClient, def, n)
      if (estado === 'MISMATCH') mismatches++
      console.log(`  ✓ ${def.name}: ${n} filas (${def.mode}) — ${estado}`)
    } catch (err) {
      console.error(`  ✗ ${def.name}:`, err.message)
      await ds.table('etl_runs').insert([{
        run_id: runId, started_at: START.toISOString(), finished_at: new Date().toISOString(),
        corte, tabla: def.name, filas_procesadas: 0, estado: 'ERROR'
      }]).catch(() => {})
    }
  }

  await pgClient.end()
  console.log(`[dcsmart-etl] fin — mismatches=${mismatches}`)
  if (mismatches) process.exitCode = 0 // no reintentar; queda visible en etl_runs
}

main().catch(err => { console.error(err); process.exit(1) })
