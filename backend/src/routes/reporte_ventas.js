// Reporte de Ventas mensual por cliente (conjunto de locales de un grupo).
//
// Lee de BigQuery lo que viene de gestión y guarda lo que se corrige a mano en
// la base propia (rv_*; ver infra/00e_reporte_ventas.sql). Nunca escribe en la
// base de gestión. El armado de los números vive en el frontend
// (lib/reporteVentas.js); acá solo se juntan las piezas.

import { okMes, rangoReporte } from '../lib/reporteVentas.js'

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

export default async function (fastify) {
  const DS = fastify.bqDataset
  const db = fastify.analyticsDb

  // GET /api/reporte-ventas/clientes?grupo= — los clientes definidos.
  fastify.get('/clientes', { preHandler: [fastify.authenticate] }, async (req) => {
    const grupo = txt(req.query.grupo)
    const { rows } = await db.query(
      `SELECT id, grupo, nombre, locales FROM rv_cliente
        WHERE ($1 = '' OR grupo = $1) ORDER BY grupo, nombre`, [grupo])
    return rows
  })

  // GET /api/reporte-ventas/:id?mes=YYYY-MM — todo lo que la pantalla necesita,
  // desde enero del año anterior hasta `mes`.
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const id = Number(req.params.id)
    const mes = req.query.mes
    if (!Number.isInteger(id) || id <= 0 || !okMes(mes)) return reply.code(400).send({ error: 'id y mes (YYYY-MM) requeridos' })

    const cli = (await db.query('SELECT id, grupo, nombre, locales FROM rv_cliente WHERE id = $1', [id])).rows[0]
    if (!cli) return reply.code(404).send({ error: 'Cliente no encontrado' })

    const { desde, hasta } = rangoReporte(mes)
    const params = { grupo: cli.grupo, locales: cli.locales, desde, hasta }
    const where = 'grupo = @grupo AND local IN UNNEST(@locales) AND fecha_dia BETWEEN @desde AND @hasta'

    const [[ventasRows], [detRows], [origRows], valores, cierres, reglas, historial] = await Promise.all([
      // SUM sin COALESCE: si todo es NULL el dato no existe (null, no 0).
      fastify.bq.query({
        query: `SELECT local, FORMAT_DATE('%Y-%m', fecha_dia) mes,
                       CAST(ROUND(SUM(total)) AS INT64) venta, SUM(comensales) cubiertos, SUM(tickets) ordenes
                  FROM ${DS}.vw_cajas WHERE ${where} GROUP BY 1, 2`,
        params
      }),
      // Cobros por método de pago (los gastos y otros tipos no son venta).
      fastify.bq.query({
        query: `SELECT local, FORMAT_DATE('%Y-%m', fecha_dia) mes, metodo, SUM(monto) monto
                  FROM ${DS}.vw_caja_detalles WHERE ${where} AND tipo = 'cobro' GROUP BY 1, 2, 3`,
        params
      }),
      fastify.bq.query({
        query: `SELECT local, FORMAT_DATE('%Y-%m', fecha_dia) mes, origin, SUM(total) total
                  FROM ${DS}.vw_cajas WHERE ${where} GROUP BY 1, 2, 3`,
        params
      }),
      db.query(`SELECT local, mes, dato, valor, original, actualizado_por, actualizado_at
                  FROM rv_valor WHERE cliente_id = $1 AND mes >= $2 AND mes <= $3
                 ORDER BY local, mes, dato`, [id, desde.slice(0, 7), mes]),
      // Solo meses cerrados: son los que reemplazan al cálculo.
      db.query(`SELECT mes, origen, snapshot, cerrado, cerrado_por, cerrado_at
                  FROM rv_cierre WHERE cliente_id = $1 AND cerrado AND mes >= $2 AND mes <= $3
                 ORDER BY mes`, [id, desde.slice(0, 7), mes]),
      db.query(`SELECT local, match, valor, canal, delivery FROM rv_regla_canal
                 WHERE cliente_id = $1 ORDER BY local, match, valor`, [id]),
      db.query(`SELECT local, mes, dato, antes, despues, por, at FROM rv_valor_historial
                 WHERE cliente_id = $1 AND mes = $2 ORDER BY at DESC, id DESC LIMIT 200`, [id, mes]),
    ])

    const auto = Object.fromEntries(cli.locales.map((l) => [l, { meses: {}, detalles: {}, cajasOrigen: {} }]))
    for (const r of plainRows(ventasRows)) {
      if (!auto[r.local]) continue
      auto[r.local].meses[r.mes] = { venta: numOrNull(r.venta), cubiertos: numOrNull(r.cubiertos), ordenes: numOrNull(r.ordenes) }
    }
    for (const r of plainRows(detRows)) {
      if (!auto[r.local]) continue
      ;(auto[r.local].detalles[r.mes] ||= []).push({ metodo: r.metodo, monto: numOrNull(r.monto) })
    }
    for (const r of plainRows(origRows)) {
      if (!auto[r.local]) continue
      ;(auto[r.local].cajasOrigen[r.mes] ||= []).push({ origin: r.origin, total: numOrNull(r.total) })
    }

    return {
      cliente: cli, mes, auto,
      valores: valores.rows.map((v) => ({ ...v, valor: numOrNull(v.valor), original: numOrNull(v.original) })),
      cierres: cierres.rows,
      reglas: reglas.rows,
      historial: historial.rows.map((h) => ({ ...h, antes: numOrNull(h.antes), despues: numOrNull(h.despues) })),
    }
  })
}
