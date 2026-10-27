// Informe mensual nuevo por cliente (conjunto de locales de un grupo): P&L, indicadores,
// cash flow, deuda y resumen.
//
// Lee de BigQuery lo que viene de gestión y guarda lo que se carga a mano en la base
// propia (im_*, reporte_hojas, rv_valor; ver infra/00i_informe_mensual_nuevo.sql).
// Nunca escribe en la base de gestión. El armado de los números vive en el frontend;
// acá solo se juntan las piezas y se persiste.

import { Storage } from '@google-cloud/storage'
import { crearLogosLocales } from '../lib/logosLocales.js'
import { okMes, esInterno, mesCerrable, snapshotOk, obsOk, paginaOk, OBS_MAX } from '../lib/reporteVentas.js'
import { rangoInforme, lineaOk, hojasOk, indicadoresOk, textoOk, datoIm } from '../lib/informeMensual.js'

const txt = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function plain (v) {
  if (v === null || v === undefined) return v
  if (typeof v !== 'object') return v
  if (v instanceof Date) return v.toISOString()
  if ('value' in v) return v.value
  return Number(v.toString())
}
const plainRows = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, plain(v)])))
// numeric de pg llega como string; los NULL se respetan.
const numOrNull = (v) => (v === null || v === undefined ? null : Number(v))
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const numOk = (v) => typeof v === 'number' && Number.isFinite(v)
const numONull = (v) => v === null || numOk(v)

const MSG_INTERNO = 'Solo el equipo DC puede editar el informe.'
const MSG_CERRADO = 'El mes está cerrado. Reabrilo para hacer cambios.'
const MSG_EN_CIERRE = 'Ese dato quedó guardado en el cierre del mes. Reabrilo para cambiarlo.'
const MSG_NO_CLIENTE = 'Cliente no encontrado'
const COLS_CLIENTE = 'id, grupo, nombre, locales, nombres, logos, razon_social'

// Meses 'YYYY-MM' desde `desde` (YYYY-MM-DD) hasta `hasta` (YYYY-MM-DD), ambos incluidos.
function mesesDe (desde, hasta) {
  const out = []
  let [y, m] = desde.slice(0, 7).split('-').map(Number)
  const fin = hasta.slice(0, 7)
  for (;;) {
    const k = `${y}-${String(m).padStart(2, '0')}`
    out.push(k)
    if (k >= fin) break
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

const lineaPlana = (r) => ({ ...r, monto: numOrNull(r.monto), monto2: numOrNull(r.monto2) })

export default async function (fastify) {
  const DS = fastify.bqDataset
  const db = fastify.analyticsDb

  // Logo que cada local tiene en gestión: el de respaldo cuando el cliente no subió uno propio.
  const storage = new Storage()
  const logosDe = crearLogosLocales({
    consultar: async (grupo, locales) => (await fastify.dcsmartRo.query(
      `SELECT l.nombre, l.logo_url FROM locales l JOIN apps a ON a.id = l.id_app
        WHERE a.nombre = $1 AND l.nombre = ANY($2) AND l.logo_url IS NOT NULL`, [grupo, locales])).rows,
    descargar: async ({ bucket, archivo }) => (await storage.bucket(bucket).file(archivo).download())[0],
    log: fastify.log,
  })
  const conLogosLocal = async (cli) => (cli ? { ...cli, logosLocal: await logosDe(cli.grupo, cli.locales) } : cli)

  // GET /api/informe-mensual/clientes?grupo= — los clientes definidos.
  fastify.get('/clientes', { preHandler: [fastify.authenticate] }, async (req) => {
    const grupo = txt(req.query.grupo)
    const { rows } = await db.query(
      `SELECT ${COLS_CLIENTE} FROM rv_cliente WHERE ($1 = '' OR grupo = $1) ORDER BY grupo, nombre`, [grupo])
    return Promise.all(rows.map(conLogosLocal))
  })

  // GET /api/informe-mensual/:id?mes=YYYY-MM — todo lo que la pantalla necesita,
  // desde enero del año anterior hasta `mes`.
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const id = Number(req.params.id)
    const mes = req.query.mes
    if (!Number.isInteger(id) || id <= 0 || !okMes(mes)) return reply.code(400).send({ error: 'id y mes (YYYY-MM) requeridos' })

    const cli = (await db.query(`SELECT ${COLS_CLIENTE} FROM rv_cliente WHERE id = $1`, [id])).rows[0]
    if (!cli) return reply.code(404).send({ error: MSG_NO_CLIENTE })

    const { desde, hasta } = rangoInforme(mes)
    const mDesde = desde.slice(0, 7)
    const params = { grupo: cli.grupo, locales: cli.locales, desde, hasta }
    const where = 'grupo = @grupo AND local IN UNNEST(@locales)'

    // BigQuery no acepta un arreglo vacío como parámetro: sin locales no hay nada que consultar.
    const bq = cli.locales.length ? (q) => fastify.bq.query(q) : async () => [[]]
    const [[ventasRows], [gastosRows], [cajaRows], hojas, lineas, textos, valores, observaciones, cierres, reglas] = await Promise.all([
      // Efectivo (columna 2 del P&L), PAX y días con venta por local y mes.
      bq({
        query: `SELECT local, FORMAT_DATE('%Y-%m', fecha_dia) mes,
                       CAST(ROUND(SUM(efectivo)) AS INT64) efectivo, SUM(comensales) pax,
                       COUNT(DISTINCT IF(total > 0, fecha_dia, NULL)) dias
                  FROM ${DS}.vw_cajas WHERE ${where} AND fecha_dia BETWEEN @desde AND @hasta GROUP BY 1, 2`,
        params
      }),
      // Gastos por PERÍODO (el mes al que se imputa la factura), no por fecha de factura.
      // Las notas de crédito restan (el agregado es NETO, igual que en gestión).
      bq({
        query: `SELECT local, FORMAT_DATE('%Y-%m', COALESCE(periodo_dia, fecha_dia)) mes, rubro, categoria, tipo,
                       CAST(ROUND(SUM(CASE WHEN ingresa_egreso = 'EGRESO' THEN importe
                                           WHEN STARTS_WITH(tipo, 'NC') THEN -importe ELSE 0 END)) AS INT64) total
                  FROM ${DS}.vw_pagos
                 WHERE ${where} AND COALESCE(periodo_dia, fecha_dia) BETWEEN @desde AND @hasta
                 GROUP BY 1, 2, 3, 4, 5
                HAVING total != 0
                 ORDER BY total DESC`,
        params
      }),
      // Gastos pagados con plata de la caja: gestión no trae su detalle, se muestran como un total.
      bq({
        query: `SELECT local, FORMAT_DATE('%Y-%m', fecha_dia) mes, CAST(ROUND(SUM(monto)) AS INT64) total
                  FROM ${DS}.vw_caja_detalles
                 WHERE ${where} AND tipo = 'gasto' AND fecha_dia BETWEEN @desde AND @hasta GROUP BY 1, 2`,
        params
      }),
      db.query(`SELECT hojas, indicadores FROM reporte_hojas WHERE cliente_id = $1 AND reporte = 'informe'`, [id]),
      db.query(`SELECT id, local, mes, hoja, seccion, concepto, monto, monto2, corrige, oculta, sub, orden, actualizado_por, actualizado_at
                  FROM im_linea WHERE cliente_id = $1 AND mes >= $2 AND mes <= $3 ORDER BY mes, hoja, seccion, orden, id`,
      [id, mDesde, mes]),
      db.query(`SELECT local, mes, clave, texto FROM im_texto WHERE cliente_id = $1 AND mes >= $2 AND mes <= $3
                 ORDER BY mes, local, clave`, [id, mDesde, mes]),
      db.query(`SELECT local, mes, dato, valor, original, actualizado_por, actualizado_at
                  FROM rv_valor WHERE cliente_id = $1 AND mes >= $2 AND mes <= $3
                   AND (dato IN ('pax', 'dias') OR dato LIKE 'ind:%')
                 ORDER BY local, mes, dato`, [id, mDesde, mes]),
      db.query(`SELECT pagina, texto, actualizado_por, actualizado_at FROM rv_observacion
                 WHERE cliente_id = $1 AND mes = $2 AND reporte = 'informe'`, [id, mes]),
      // Solo meses cerrados: son los que reemplazan al cálculo.
      db.query(`SELECT mes, origen, snapshot, cerrado, cerrado_por, cerrado_at
                  FROM im_cierre WHERE cliente_id = $1 AND cerrado AND mes >= $2 AND mes <= $3 ORDER BY mes`, [id, mDesde, mes]),
      db.query('SELECT rubro, categoria, seccion, concepto FROM informe_reglas WHERE grupo = $1', [cli.grupo]),
    ])

    // Razón social por defecto: la del proveedor vinculado al primer local en gestión.
    let razonSocialGestion = null
    try {
      const { rows } = await fastify.dcsmartRo.query(
        `SELECT p.razon_social FROM locales l JOIN apps a ON a.id = l.id_app
           LEFT JOIN proveedores p ON p.id = l.id_proveedor
          WHERE l.nombre = ANY($1) AND a.nombre = $2 AND p.razon_social IS NOT NULL
          ORDER BY array_position($1::text[], l.nombre) LIMIT 1`, [cli.locales, cli.grupo])
      razonSocialGestion = rows[0]?.razon_social || null
    } catch (err) {
      req.log.warn({ err }, 'informe-mensual: sin acceso a la razón social de gestión')
    }

    // auto[local][mes] para todos los meses del rango, aunque no tengan datos.
    const meses = mesesDe(desde, hasta)
    const auto = Object.fromEntries(cli.locales.map((l) => [l, Object.fromEntries(
      meses.map((m) => [m, { efectivo: 0, dias: 0, pax: 0, gastos: [], cajaGastos: 0 }]))]))
    for (const r of plainRows(ventasRows)) {
      const a = auto[r.local]?.[r.mes]
      if (!a) continue
      a.efectivo = num(r.efectivo); a.dias = num(r.dias); a.pax = num(r.pax)
    }
    for (const r of plainRows(gastosRows)) {
      const a = auto[r.local]?.[r.mes]
      if (!a) continue
      a.gastos.push({ rubro: r.rubro || '(sin rubro)', categoria: r.categoria || '(sin categoría)', tipo: r.tipo || '', total: num(r.total) })
    }
    for (const r of plainRows(cajaRows)) {
      const a = auto[r.local]?.[r.mes]
      if (a) a.cajaGastos = num(r.total)
    }

    const h = hojas.rows[0]
    return {
      cliente: await conLogosLocal(cli), mes, razonSocialGestion,
      hojas: h ? { hojas: h.hojas, indicadores: h.indicadores } : null,
      auto,
      lineas: lineas.rows.map(lineaPlana),
      textos: textos.rows,
      valores: valores.rows.map((v) => ({ ...v, valor: numOrNull(v.valor), original: numOrNull(v.original) })),
      observaciones: Object.fromEntries(observaciones.rows.map((o) => [o.pagina, o])),
      cierres: cierres.rows,
      reglas: reglas.rows,
    }
  })

  // ---- Escritura: solo el equipo DC ----
  const interno = async (req, reply) => {
    if (!esInterno(req.user)) return reply.code(403).send({ error: MSG_INTERNO })
  }
  const pre = { preHandler: [fastify.authenticate, interno] }
  const quien = (req) => req.user.email || req.user.nombre || String(req.user.id)
  const idDe = (req) => { const n = Number(req.params.id); return Number.isInteger(n) && n > 0 ? n : null }
  const getCli = async (id) => (await db.query(`SELECT ${COLS_CLIENTE} FROM rv_cliente WHERE id = $1`, [id])).rows[0]
  // Foto del mes si está cerrado (null si está abierto), bloqueada hasta el fin de la transacción.
  const cierreDe = async (c, id, mes) =>
    (await c.query('SELECT snapshot FROM im_cierre WHERE cliente_id = $1 AND mes = $2 AND cerrado FOR UPDATE', [id, mes])).rows[0] || null
  const historial = (c, lineaId, id, mes, accion, antes, despues, por) => c.query(
    `INSERT INTO im_linea_historial (linea_id, cliente_id, mes, accion, antes, despues, por) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [lineaId, id, mes, accion, antes ? JSON.stringify(antes) : null, despues ? JSON.stringify(despues) : null, por])

  // Alta o cambio de una línea (agregada al P&L, corrección de una automática, renglón de cash flow
  // o deuda). Con `id` es un cambio. En un mes cerrado no se toca ninguna hoja con números.
  fastify.put('/:id/linea', pre, async (req, reply) => {
    const id = idDe(req)
    if (!id) return reply.code(400).send({ error: 'El cliente no es válido.' })
    const v = lineaOk(req.body)
    if (!v.ok) return reply.code(400).send({ error: v.error })
    const l = v.linea
    const cli = await getCli(id)
    if (!cli) return reply.code(404).send({ error: MSG_NO_CLIENTE })
    if (l.local !== null && !cli.locales.includes(l.local)) return reply.code(400).send({ error: 'El local no pertenece al cliente.' })

    const c = await db.connect()
    try {
      await c.query('BEGIN')
      let antes = null
      if (l.id) {
        antes = (await c.query('SELECT * FROM im_linea WHERE id = $1 AND cliente_id = $2 FOR UPDATE', [l.id, id])).rows[0]
        if (!antes) { await c.query('ROLLBACK'); return reply.code(404).send({ error: 'La línea no existe.' }) }
        if (await cierreDe(c, id, antes.mes)) { await c.query('ROLLBACK'); return reply.code(409).send({ error: MSG_CERRADO }) }
      }
      if (await cierreDe(c, id, l.mes)) { await c.query('ROLLBACK'); return reply.code(409).send({ error: MSG_CERRADO }) }

      const campos = [l.local, l.mes, l.hoja, l.seccion, l.concepto, l.monto, l.monto2, l.corrige, l.oculta, l.orden, quien(req), l.sub]
      let fila
      if (l.id) {
        fila = (await c.query(
          `UPDATE im_linea SET local = $3, mes = $4, hoja = $5, seccion = $6, concepto = $7, monto = $8, monto2 = $9,
                  corrige = $10, oculta = $11, orden = $12, actualizado_por = $13, sub = $14, actualizado_at = now()
            WHERE id = $1 AND cliente_id = $2 RETURNING *`, [l.id, id, ...campos])).rows[0]
      } else {
        fila = (await c.query(
          `INSERT INTO im_linea (cliente_id, local, mes, hoja, seccion, concepto, monto, monto2, corrige, oculta, orden, actualizado_por, sub)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [id, ...campos])).rows[0]
      }
      await historial(c, fila.id, id, fila.mes, antes ? 'cambio' : 'alta', antes ? lineaPlana(antes) : null, lineaPlana(fila), quien(req))
      await c.query('COMMIT')
      return { ok: true, id: Number(fila.id) }
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {})
      throw e
    } finally { c.release() }
  })

  fastify.delete('/:id/linea/:lineaId', pre, async (req, reply) => {
    const id = idDe(req)
    const lineaId = Number(req.params.lineaId)
    if (!id || !Number.isInteger(lineaId) || lineaId <= 0) return reply.code(400).send({ error: 'La línea no es válida.' })
    const c = await db.connect()
    try {
      await c.query('BEGIN')
      const antes = (await c.query('SELECT * FROM im_linea WHERE id = $1 AND cliente_id = $2 FOR UPDATE', [lineaId, id])).rows[0]
      if (!antes) { await c.query('ROLLBACK'); return reply.code(404).send({ error: 'La línea no existe.' }) }
      if (await cierreDe(c, id, antes.mes)) { await c.query('ROLLBACK'); return reply.code(409).send({ error: MSG_CERRADO }) }
      await c.query('DELETE FROM im_linea WHERE id = $1 AND cliente_id = $2', [lineaId, id])
      await historial(c, lineaId, id, antes.mes, 'baja', lineaPlana(antes), null, quien(req))
      await c.query('COMMIT')
      return { ok: true }
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {})
      throw e
    } finally { c.release() }
  })

  // Dato cargado a mano (pax, días o indicador propio). valor null = restaurar.
  fastify.put('/:id/valor', pre, async (req, reply) => {
    const id = idDe(req)
    const b = req.body || {}
    const dato = datoIm(b.dato)
    const local = typeof b.local === 'string' ? b.local.trim() : ''
    if (!id || !okMes(b.mes) || !dato || !local) return reply.code(400).send({ error: 'Faltan datos o son inválidos (local, mes, dato).' })
    if (!numONull(b.valor) || b.valor === undefined || !numONull(b.original) || b.original === undefined) {
      return reply.code(400).send({ error: 'valor y original deben ser números o null.' })
    }
    const cli = await getCli(id)
    if (!cli) return reply.code(404).send({ error: MSG_NO_CLIENTE })
    if (!cli.locales.includes(local)) return reply.code(400).send({ error: 'El local no pertenece al cliente.' })

    const c = await db.connect()
    try {
      await c.query('BEGIN')
      if (await cierreDe(c, id, b.mes)) { await c.query('ROLLBACK'); return reply.code(409).send({ error: MSG_EN_CIERRE }) }
      const prev = (await c.query(
        'SELECT valor FROM rv_valor WHERE cliente_id = $1 AND local = $2 AND mes = $3 AND dato = $4 FOR UPDATE',
        [id, local, b.mes, dato])).rows[0]
      const antes = prev ? Number(prev.valor) : b.original
      if (b.valor === null) {
        await c.query('DELETE FROM rv_valor WHERE cliente_id = $1 AND local = $2 AND mes = $3 AND dato = $4', [id, local, b.mes, dato])
      } else {
        await c.query(
          `INSERT INTO rv_valor (cliente_id, local, mes, dato, valor, original, actualizado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (cliente_id, local, mes, dato)
           DO UPDATE SET valor = EXCLUDED.valor, actualizado_por = EXCLUDED.actualizado_por, actualizado_at = now()`,
          [id, local, b.mes, dato, b.valor, b.original, quien(req)])
      }
      await c.query(
        `INSERT INTO rv_valor_historial (cliente_id, local, mes, dato, antes, despues, por)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, local, b.mes, dato, antes, b.valor, quien(req)])
      await c.query('COMMIT')
      return { ok: true }
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {})
      throw e
    } finally { c.release() }
  })

  // Texto libre del informe (comentario del resumen, cash flow, fecha de deuda). '' = borrarlo.
  // Se puede escribir aunque el mes esté cerrado: no cambia ningún número.
  fastify.put('/:id/texto', pre, async (req, reply) => {
    const id = idDe(req)
    const b = req.body || {}
    const local = b.local == null ? '' : (typeof b.local === 'string' ? b.local.trim() : null)
    if (!id || !okMes(b.mes) || local === null) return reply.code(400).send({ error: 'Faltan datos o son inválidos (mes, local).' })
    const texto = textoOk(b.clave, b.texto)
    if (texto === null) return reply.code(400).send({ error: 'El texto no es válido o es demasiado largo.' })
    const cli = await getCli(id)
    if (!cli) return reply.code(404).send({ error: MSG_NO_CLIENTE })
    if (local && !cli.locales.includes(local)) return reply.code(400).send({ error: 'El local no pertenece al cliente.' })
    if (!texto) {
      await db.query('DELETE FROM im_texto WHERE cliente_id = $1 AND local = $2 AND mes = $3 AND clave = $4', [id, local, b.mes, b.clave])
    } else {
      await db.query(
        `INSERT INTO im_texto (cliente_id, local, mes, clave, texto, actualizado_por) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (cliente_id, local, mes, clave)
         DO UPDATE SET texto = EXCLUDED.texto, actualizado_por = EXCLUDED.actualizado_por, actualizado_at = now()`,
        [id, local, b.mes, b.clave, texto, quien(req)])
    }
    return { ok: true }
  })

  // Observación opcional de una hoja. texto vacío = borrarla. Siempre permitida (es un comentario).
  fastify.put('/:id/observacion', pre, async (req, reply) => {
    const id = idDe(req)
    const b = req.body || {}
    const texto = obsOk(b.texto)
    if (!id || !okMes(b.mes) || !paginaOk(b.pagina)) return reply.code(400).send({ error: 'Faltan datos o son inválidos (mes, hoja).' })
    if (texto === null) return reply.code(400).send({ error: `La observación puede tener hasta ${OBS_MAX} caracteres.` })
    if (!(await getCli(id))) return reply.code(404).send({ error: MSG_NO_CLIENTE })
    if (!texto) {
      await db.query(`DELETE FROM rv_observacion WHERE cliente_id = $1 AND mes = $2 AND pagina = $3 AND reporte = 'informe'`, [id, b.mes, b.pagina])
    } else {
      await db.query(
        `INSERT INTO rv_observacion (cliente_id, mes, pagina, reporte, texto, actualizado_por) VALUES ($1,$2,$3,'informe',$4,$5)
         ON CONFLICT (cliente_id, mes, pagina, reporte)
         DO UPDATE SET texto = EXCLUDED.texto, actualizado_por = EXCLUDED.actualizado_por, actualizado_at = now()`,
        [id, b.mes, b.pagina, texto, quien(req)])
    }
    return { ok: true }
  })

  // Qué hojas muestra el cliente, en qué orden, y sus indicadores propios por local.
  fastify.put('/:id/hojas', pre, async (req, reply) => {
    const id = idDe(req)
    if (!id) return reply.code(400).send({ error: 'El cliente no es válido.' })
    const cli = await getCli(id)
    if (!cli) return reply.code(404).send({ error: MSG_NO_CLIENTE })
    const hojas = hojasOk(req.body?.hojas)
    if (!hojas) return reply.code(400).send({ error: 'La lista de hojas no es válida.' })
    const indicadores = indicadoresOk(req.body?.indicadores ?? {}, cli.locales)
    if (!indicadores) return reply.code(400).send({ error: 'Los indicadores no son válidos (hasta 8 por local, con nombre y formato).' })
    await db.query(
      `INSERT INTO reporte_hojas (cliente_id, reporte, hojas, indicadores, actualizado_por) VALUES ($1,'informe',$2,$3,$4)
       ON CONFLICT (cliente_id, reporte)
       DO UPDATE SET hojas = EXCLUDED.hojas, indicadores = EXCLUDED.indicadores,
                     actualizado_por = EXCLUDED.actualizado_por, actualizado_at = now()`,
      [id, JSON.stringify(hojas), JSON.stringify(indicadores), quien(req)])
    return { ok: true }
  })

  // A qué sección va una categoría de gestión, para todo el grupo. seccion null la borra.
  fastify.put('/regla', pre, async (req, reply) => {
    const grupo = txt(req.body?.grupo)
    const rubro = txt(req.body?.rubro)
    const categoria = txt(req.body?.categoria)
    const seccion = req.body?.seccion == null ? null : txt(req.body.seccion, 40)
    const concepto = txt(req.body?.concepto) || null
    if (!grupo || !rubro || !categoria) return reply.code(400).send({ error: 'grupo, rubro y categoria requeridos' })
    if (!seccion) {
      await db.query('DELETE FROM informe_reglas WHERE grupo = $1 AND rubro = $2 AND categoria = $3', [grupo, rubro, categoria])
      return { ok: true }
    }
    await db.query(
      `INSERT INTO informe_reglas (grupo, rubro, categoria, seccion, concepto, actualizado_por)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (grupo, rubro, categoria) DO UPDATE
         SET seccion = EXCLUDED.seccion, concepto = EXCLUDED.concepto, actualizado_por = EXCLUDED.actualizado_por, actualizado_at = now()`,
      [grupo, rubro, categoria, seccion, concepto, quien(req)])
    return { ok: true }
  })

  // Razón social del cliente para la portada. null o vacía = volver a la de gestión.
  fastify.put('/clientes/:id/razon-social', pre, async (req, reply) => {
    const id = idDe(req)
    const rs = req.body?.razon_social
    if (!id || (rs != null && typeof rs !== 'string')) return reply.code(400).send({ error: 'Falta la razón social (texto o null).' })
    const razon = rs == null ? null : (rs.trim() || null)
    if (razon && razon.length > 120) return reply.code(400).send({ error: 'La razón social puede tener hasta 120 caracteres.' })
    const { rowCount } = await db.query('UPDATE rv_cliente SET razon_social = $2 WHERE id = $1', [id, razon])
    if (!rowCount) return reply.code(404).send({ error: MSG_NO_CLIENTE })
    return { ok: true }
  })

  // ---- Cierre del mes ----
  fastify.post('/:id/cerrar', { ...pre, bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const id = idDe(req)
    const { mes, snapshot } = req.body || {}
    if (!id || !okMes(mes)) return reply.code(400).send({ error: 'mes (YYYY-MM) requerido' })
    if (!mesCerrable(mes)) return reply.code(400).send({ error: 'Solo se cierran meses terminados.' })
    if (!snapshotOk(snapshot)) return reply.code(400).send({ error: 'Falta la foto del mes (snapshot con sus locales).' })
    if (!(await getCli(id))) return reply.code(404).send({ error: MSG_NO_CLIENTE })
    // Inserta, o vuelve a cerrar si había quedado abierto (la foto que se reemplaza
    // queda en snapshot_anterior); si ya estaba cerrado no toca nada.
    const { rowCount } = await db.query(
      `INSERT INTO im_cierre (cliente_id, mes, origen, snapshot, cerrado, cerrado_por)
       VALUES ($1,$2,'informe',$3,true,$4)
       ON CONFLICT (cliente_id, mes) DO UPDATE
         SET origen = 'informe', snapshot_anterior = im_cierre.snapshot, snapshot = EXCLUDED.snapshot, cerrado = true,
             cerrado_por = EXCLUDED.cerrado_por, cerrado_at = now()
       WHERE NOT im_cierre.cerrado`, [id, mes, JSON.stringify(snapshot), quien(req)])
    if (!rowCount) return reply.code(409).send({ error: 'El mes ya estaba cerrado.' })
    return { ok: true }
  })

  // El snapshot queda como referencia; el mes vuelve a calcularse.
  fastify.post('/:id/reabrir', pre, async (req, reply) => {
    const id = idDe(req)
    const mes = req.body?.mes
    if (!id || !okMes(mes)) return reply.code(400).send({ error: 'mes (YYYY-MM) requerido' })
    const { rowCount } = await db.query(
      'UPDATE im_cierre SET cerrado = false WHERE cliente_id = $1 AND mes = $2 AND cerrado', [id, mes])
    if (!rowCount) return reply.code(404).send({ error: 'El mes no estaba cerrado.' })
    return { ok: true }
  })
}
