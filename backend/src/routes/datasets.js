// Consulta las vistas de BigQuery con filtros PARAMETRIZADOS.
// Los filtros del UI se traducen acá con whitelist (nunca SQL armado afuera).
// Todas las consultas filtran por fecha → escanean solo particiones necesarias (FinOps).

// Vistas que alimentan los desplegables (locales, rubros, etc.) de las pantallas.
// Las pantallas Pagos, Ventas y Cashflow, que traían las filas crudas de estas
// vistas, se sacaron el 26/10: queda solo /options.
const DATASETS = {
  pagos: { view: 'vw_pagos', dateCol: 'fecha_dia', dims: ['local', 'rubro', 'proveedor', 'metodo', 'estado'] },
  cajas: { view: 'vw_cajas', dateCol: 'fecha_dia', dims: ['local', 'cajero', 'origin'] },
  flujo: { view: 'vw_flujo_caja', dateCol: 'fecha_dia', dims: ['local'] },
  caja_detalles: { view: 'vw_caja_detalles', dateCol: 'fecha_dia', dims: ['metodo', 'local', 'cajero'] }
}

// El cliente de BigQuery envuelve DATE/TIMESTAMP en objetos {value} y NUMERIC en Big —
// se aplanan a primitivos para que el frontend reciba JSON simple (string/number).
function plain (v) {
  if (v === null || typeof v !== 'object') return v
  if ('value' in v) return v.value
  return v.toString()
}
function plainRows (rows) {
  return rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, plain(v)])))
}

export default async function (fastify) {
  const DS = fastify.bqDataset

  // GET /api/data/grupos — lista de grupos (apps) para la pantalla de selección
  //
  // Sale de la réplica en vivo (Datastream), la MISMA de la que las vistas
  // vw_* sacan la columna grupo. ${DS}.dim_apps la llenaba el ETL casero, que
  // dejó de correr el 2026-08-07: cuando gestión renombró "GRUPO 3MONOS" a
  // "GRUPO MONOS", el selector siguió ofreciendo el nombre viejo, todas las
  // consultas filtraban por un grupo que ya no existía y el Informe Mensual
  // quedaba en "Cargando…" sin locales (Trello #273). Los grupos creados
  // después de esa fecha directamente no aparecían.
  fastify.get('/grupos', { preHandler: [fastify.authenticate] }, async () => {
    const [rows] = await fastify.bq.query({
      query: `SELECT nombre FROM dcsmart_analytics_cdc.dim_apps WHERE activo IS NOT FALSE ORDER BY nombre`
    })
    return rows.map(r => r.nombre)
  })

  // GET /api/data/dashboard?grupo=&desde=&hasta= — KPIs + serie semanal + proyección 60 días.
  // Pagos por fecha factura (fecha_dia de vw_pagos), Ventas por fecha inicio (fecha_dia de vw_cajas).
  fastify.get('/dashboard', { preHandler: [fastify.authenticate] }, async (req) => {
    const hoy = new Date().toISOString().slice(0, 10)
    const desde = req.query.desde || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
    const hasta = req.query.hasta || hoy
    const grupo = req.query.grupo ? String(req.query.grupo) : null
    const gCond = grupo ? ' AND grupo = @grupo' : ''
    // lookback fijo de 26 semanas para ajustar el modelo de proyección
    const desdeLb = new Date(Math.min(Date.parse(desde), Date.parse(hasta) - 182 * 864e5))
      .toISOString().slice(0, 10)
    const base = { desde, hasta, desdeLb, ...(grupo ? { grupo } : {}) }

    const [[kpiVentas], [kpiPagos], [semVentas], [semPagos]] = await Promise.all([
      fastify.bq.query({
        query: `SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total FROM ${DS}.vw_cajas
                WHERE fecha_dia BETWEEN @desde AND @hasta${gCond}`,
        params: base
      }),
      fastify.bq.query({
        query: `SELECT COUNT(*) AS n, COALESCE(SUM(importe),0) AS total,
                       COALESCE(SUM(IF(STARTS_WITH(UPPER(rubro),'CMV'), importe, 0)),0) AS cmv
                FROM ${DS}.vw_pagos
                WHERE ingresa_egreso = 'EGRESO' AND fecha_dia BETWEEN @desde AND @hasta${gCond}`,
        params: base
      }),
      fastify.bq.query({
        query: `SELECT DATE_TRUNC(fecha_dia, WEEK(MONDAY)) AS semana, SUM(total) AS ventas
                FROM ${DS}.vw_cajas
                WHERE fecha_dia BETWEEN @desdeLb AND @hasta${gCond} GROUP BY 1 ORDER BY 1`,
        params: base
      }),
      fastify.bq.query({
        query: `SELECT DATE_TRUNC(fecha_dia, WEEK(MONDAY)) AS semana, SUM(importe) AS pagos,
                       SUM(IF(STARTS_WITH(UPPER(rubro),'CMV'), importe, 0)) AS cmv
                FROM ${DS}.vw_pagos
                WHERE ingresa_egreso = 'EGRESO' AND fecha_dia BETWEEN @desdeLb AND @hasta${gCond}
                GROUP BY 1 ORDER BY 1`,
        params: base
      })
    ])

    // Eje semanal continuo del lookback (lunes a lunes), 0 donde no hubo actividad
    const monday = (iso) => {
      const d = new Date(iso + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
      return d
    }
    const vMap = new Map(plainRows(semVentas).map(r => [r.semana, Number(r.ventas)]))
    const pRows = plainRows(semPagos)
    const pMap = new Map(pRows.map(r => [r.semana, Number(r.pagos)]))
    const cMap = new Map(pRows.map(r => [r.semana, Number(r.cmv)]))

    const weeks = []
    for (let d = monday(desdeLb); d <= monday(hasta); d.setUTCDate(d.getUTCDate() + 7)) {
      weeks.push(new Date(d))
    }
    const iso = (d) => d.toISOString().slice(0, 10)
    const serie = (map) => weeks.map(w => map.get(iso(w)) || 0)
    const ventasArr = serie(vMap), pagosArr = serie(pMap), cmvArr = serie(cMap)

    // Proyección: tendencia lineal (mínimos cuadrados) × índice estacional por semana-del-mes
    const womOf = (d) => Math.min(4, Math.floor((d.getUTCDate() - 1) / 7))
    function project (values, futureWeeks) {
      const pts = values.map((v, i) => [i, v])
      const n = pts.length
      if (n < 4) return futureWeeks.map(() => null)
      const sx = pts.reduce((s, [x]) => s + x, 0)
      const sy = pts.reduce((s, [, y]) => s + y, 0)
      const sxx = pts.reduce((s, [x]) => s + x * x, 0)
      const sxy = pts.reduce((s, [x, y]) => s + x * y, 0)
      const b = (n * sxy - sx * sy) / Math.max(1e-9, n * sxx - sx * sx)
      const a = (sy - b * sx) / n
      const mean = sy / n || 1
      const buckets = [[], [], [], [], []]
      pts.forEach(([i, v]) => buckets[womOf(weeks[i])].push(v))
      const idx = buckets.map(arr => arr.length ? (arr.reduce((s, v) => s + v, 0) / arr.length) / mean : 1)
      return futureWeeks.map((d, k) =>
        Math.max(0, Math.round((a + b * (n + k)) * (idx[womOf(d)] || 1))))
    }

    const futureWeeks = []
    {
      const start = monday(hasta)
      start.setUTCDate(start.getUTCDate() + 7)
      const end = new Date(Date.parse(hasta) + 60 * 864e5)
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
        futureWeeks.push(new Date(d))
      }
    }
    const proyV = project(ventasArr, futureWeeks)
    const proyP = project(pagosArr, futureWeeks)
    const proyC = project(cmvArr, futureWeeks)

    // Al frontend solo van las semanas del rango filtrado (el lookback es para el modelo)
    const desdeMonday = monday(desde)
    const semanal = weeks
      .map((w, i) => ({ semana: iso(w), ventas: ventasArr[i], pagos: pagosArr[i], cmv: cmvArr[i] }))
      .filter(r => r.semana >= iso(desdeMonday))
    const proyeccion = futureWeeks.map((w, k) => ({
      semana: iso(w), ventas: proyV[k], pagos: proyP[k], cmv: proyC[k]
    }))

    const kv = plainRows(kpiVentas)[0] || {}
    const kp = plainRows(kpiPagos)[0] || {}
    const ventasTot = Number(kv.total || 0)
    const cmvTot = Number(kp.cmv || 0)
    return {
      rango: { desde, hasta },
      kpis: {
        ventas: ventasTot, n_turnos: Number(kv.n || 0),
        pagos: Number(kp.total || 0), n_pagos: Number(kp.n || 0),
        cmv: cmvTot, cmv_pct: ventasTot ? +(cmvTot / ventasTot * 100).toFixed(1) : null
      },
      semanal, proyeccion
    }
  })

  // GET /api/data/pyl?mes=YYYY-MM&grupo=&local= — Estado de Resultados (P&L) mensual.
  // Ventas de vw_cajas (con split efectivo/fiscal nativo). Gastos = pagos EGRESO por
  // rubro+categoria, split fiscal (metodo != Efectivo) vs efectivo. El frontend arma
  // la estructura de secciones del P&L; el backend devuelve los agregados.
  fastify.get('/pyl', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : null
    if (!mes) return reply.code(400).send({ error: 'mes (YYYY-MM) requerido' })
    const [y, m] = mes.split('-').map(Number)
    const desde = `${mes}-01`
    const hasta = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) // último día del mes
    const local = req.query.local ? String(req.query.local) : null
    const grupo = req.query.grupo ? String(req.query.grupo) : null
    const scopeCond = local ? ' AND local = @local' : (grupo ? ' AND grupo = @grupo' : '')
    const params = { desde, hasta }
    if (local) params.local = local
    else if (grupo) params.grupo = grupo

    const [[ventasRows], [origenRows], [gastosRows]] = await Promise.all([
      fastify.bq.query({
        query: `SELECT CAST(ROUND(SUM(total)) AS INT64) total,
                       CAST(ROUND(SUM(efectivo)) AS INT64) efectivo,
                       CAST(ROUND(SUM(fiscal)) AS INT64) fiscal,
                       SUM(comensales) AS comensales, SUM(tickets) AS tickets
                FROM ${DS}.vw_cajas WHERE fecha_dia BETWEEN @desde AND @hasta${scopeCond}`,
        params
      }),
      fastify.bq.query({
        query: `SELECT origin AS origen, CAST(ROUND(SUM(total)) AS INT64) total,
                       CAST(ROUND(SUM(efectivo)) AS INT64) efectivo, CAST(ROUND(SUM(fiscal)) AS INT64) fiscal
                FROM ${DS}.vw_cajas WHERE fecha_dia BETWEEN @desde AND @hasta${scopeCond}
                GROUP BY 1 ORDER BY total DESC`,
        params
      }),
      fastify.bq.query({
        query: `SELECT rubro, categoria,
                       CAST(ROUND(SUM(importe)) AS INT64) total,
                       CAST(ROUND(SUM(IF(metodo != 'Efectivo' OR metodo IS NULL, importe, 0))) AS INT64) fiscal,
                       CAST(ROUND(SUM(IF(metodo = 'Efectivo', importe, 0))) AS INT64) efectivo
                FROM ${DS}.vw_pagos
                WHERE ingresa_egreso = 'EGRESO' AND fecha_dia BETWEEN @desde AND @hasta${scopeCond}
                GROUP BY 1, 2 ORDER BY total DESC`,
        params
      })
    ])

    const v = plainRows(ventasRows)[0] || {}
    return {
      mes, scope: { grupo, local },
      ventas: {
        total: Number(v.total || 0), fiscal: Number(v.fiscal || 0), efectivo: Number(v.efectivo || 0),
        comensales: Number(v.comensales || 0), tickets: Number(v.tickets || 0),
        por_origen: plainRows(origenRows).map(r => ({
          origen: r.origen || '(sin origen)', total: Number(r.total || 0),
          fiscal: Number(r.fiscal || 0), efectivo: Number(r.efectivo || 0)
        }))
      },
      gastos: plainRows(gastosRows).map(r => ({
        rubro: r.rubro || '(sin rubro)', categoria: r.categoria || '(sin categoría)',
        total: Number(r.total || 0), fiscal: Number(r.fiscal || 0), efectivo: Number(r.efectivo || 0)
      }))
    }
  })

  // GET /api/data/reporte-mensual?mes=YYYY-MM&grupo=&local= — Reporte de Ventas Mensuales.
  // Ventas de vw_cajas (total/comensales/tickets + split por origen). Gastos = pagos EGRESO
  // agregados por rubro+categoria+tipo de comprobante (vw_pagos.tipo = id_tipo), para que el
  // frontend reparta cada línea en columnas por tipo de comprobante.
  fastify.get('/reporte-mensual', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : null
    if (!mes) return reply.code(400).send({ error: 'mes (YYYY-MM) requerido' })
    const [y, m] = mes.split('-').map(Number)
    const desde = `${mes}-01`
    const hasta = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) // último día del mes
    const local = req.query.local ? String(req.query.local) : null
    const grupo = req.query.grupo ? String(req.query.grupo) : null
    const scopeCond = local ? ' AND local = @local' : (grupo ? ' AND grupo = @grupo' : '')
    const params = { desde, hasta }
    if (local) params.local = local
    else if (grupo) params.grupo = grupo

    const [[ventasRows], [origenRows], [gastosRows]] = await Promise.all([
      fastify.bq.query({
        query: `SELECT CAST(ROUND(SUM(total)) AS INT64) total,
                       SUM(comensales) AS comensales, SUM(tickets) AS tickets
                FROM ${DS}.vw_cajas WHERE fecha_dia BETWEEN @desde AND @hasta${scopeCond}`,
        params
      }),
      fastify.bq.query({
        query: `SELECT origin, CAST(ROUND(SUM(total)) AS INT64) total
                FROM ${DS}.vw_cajas WHERE fecha_dia BETWEEN @desde AND @hasta${scopeCond}
                GROUP BY 1 ORDER BY total DESC`,
        params
      }),
      fastify.bq.query({
        query: `SELECT rubro, categoria, tipo,
                       CAST(ROUND(SUM(importe)) AS INT64) total
                FROM ${DS}.vw_pagos
                WHERE ingresa_egreso = 'EGRESO' AND fecha_dia BETWEEN @desde AND @hasta${scopeCond}
                GROUP BY 1, 2, 3 ORDER BY total DESC`,
        params
      })
    ])

    const v = plainRows(ventasRows)[0] || {}
    return {
      mes, scope: { grupo, local },
      ventas: {
        total: Number(v.total || 0), comensales: Number(v.comensales || 0), tickets: Number(v.tickets || 0),
        por_origen: plainRows(origenRows).map(r => ({
          origin: r.origin || '(sin origen)', total: Number(r.total || 0)
        }))
      },
      gastos: plainRows(gastosRows).map(r => ({
        rubro: r.rubro || '(sin rubro)', categoria: r.categoria || '(sin categoría)',
        tipo: r.tipo || '(sin tipo)', total: Number(r.total || 0)
      }))
    }
  })

  // GET /api/data/:dataset/options — valores para poblar los dropdowns (acotados por grupo)
  fastify.get('/:dataset/options', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const def = DATASETS[req.params.dataset]
    if (!def) return reply.code(404).send({ error: 'Dataset inválido' })
    const grupo = req.query.grupo
    const grupoCond = grupo ? ' AND grupo = @grupo' : ''
    const params = grupo ? { grupo: String(grupo) } : {}
    // Una consulta por dimensión, todas en paralelo (en serie multiplicaba la latencia)
    const results = await Promise.all(def.dims.map(dim =>
      fastify.bq.query({
        query: `SELECT DISTINCT ${dim} AS v FROM ${DS}.${def.view}
                WHERE ${dim} IS NOT NULL${grupoCond} AND ${def.dateCol} >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
                ORDER BY 1 LIMIT 300`,
        params
      })
    ))
    const out = {}
    def.dims.forEach((dim, i) => { out[dim] = results[i][0].map(r => r.v) })
    return out
  })

  // GET /api/data/etl/status — último corte y cuadratura para el header
  fastify.get('/etl/status', { preHandler: [fastify.authenticate] }, async () => {
    const [rows] = await fastify.bq.query({
      query: `SELECT corte, MAX(finished_at) AS ultimo,
                     COUNTIF(estado='MISMATCH') AS mismatches,
                     COUNTIF(estado='ERROR') AS errores
              FROM ${fastify.bqDataset}.etl_runs
              WHERE started_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
              GROUP BY corte ORDER BY ultimo DESC LIMIT 1`
    })
    return plainRows(rows)[0] || { corte: null }
  })
}
