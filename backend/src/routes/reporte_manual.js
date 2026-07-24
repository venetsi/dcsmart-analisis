// Capa manual del Reporte de Ventas Mensuales (P&L). Escribe SOLO en la base
// propia dcsmart_analytics (pool fastify.analyticsDb), nunca en la de gestión.
// Cualquier usuario con acceso a analytics puede ver y cargar (sin admin):
// mismo guard fastify.authenticate que el resto de rutas de negocio (ver
// datasets.js). La escritura reemplaza el set completo del mes (DELETE+INSERT
// en una transacción), no hace upsert fila por fila.
const okMes = (m) => /^\d{4}-\d{2}$/.test(m || '')

function mesAnterior (mes) {
  const [y, m] = mes.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

export default async function (fastify) {
  // GET /api/reporte-manual?grupo&local&mes
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { grupo, local, mes } = req.query
    if (!grupo || !local || !okMes(mes)) {
      return reply.code(400).send({ error: 'grupo, local y mes (YYYY-MM) requeridos' })
    }
    const { rows } = await fastify.analyticsDb.query(
      `SELECT seccion, concepto, monto::float8 AS monto, columna
         FROM reporte_mensual_manual
        WHERE grupo = $1 AND local = $2 AND mes = $3
        ORDER BY seccion, concepto`,
      [grupo, local, `${mes}-01`])
    return rows
  })

  // GET /api/reporte-manual/anterior?grupo&local&mes — filas del mes anterior,
  // solo para precargar el formulario en el cliente; esta ruta NO persiste nada.
  fastify.get('/anterior', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { grupo, local, mes } = req.query
    if (!grupo || !local || !okMes(mes)) {
      return reply.code(400).send({ error: 'grupo, local y mes (YYYY-MM) requeridos' })
    }
    const { rows } = await fastify.analyticsDb.query(
      `SELECT seccion, concepto, monto::float8 AS monto, columna
         FROM reporte_mensual_manual
        WHERE grupo = $1 AND local = $2 AND mes = $3
        ORDER BY seccion, concepto`,
      [grupo, local, `${mesAnterior(mes)}-01`])
    return rows
  })

  // PUT /api/reporte-manual  { grupo, local, mes, filas:[{seccion,concepto,monto,columna}] }
  // Reemplaza (DELETE+INSERT en transacción) el set del mes/local/grupo.
  fastify.put('/', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { grupo, local, mes, filas } = req.body || {}
    if (!grupo || !local || !okMes(mes) || !Array.isArray(filas)) {
      return reply.code(400).send({ error: 'grupo, local, mes y filas[] requeridos' })
    }
    const email = req.user.email
    for (const f of filas) {
      if (![1, 2].includes(Number(f.columna))) continue
      if (!f.concepto || !f.seccion) continue
      if (!Number.isFinite(Number(f.monto))) {
        return reply.code(400).send({ error: 'monto invalido en una o mas filas' })
      }
    }
    const client = await fastify.analyticsDb.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        'DELETE FROM reporte_mensual_manual WHERE grupo = $1 AND local = $2 AND mes = $3',
        [grupo, local, `${mes}-01`])
      let count = 0
      for (const f of filas) {
        if (![1, 2].includes(Number(f.columna))) continue
        if (!f.concepto || !f.seccion) continue
        await client.query(
          `INSERT INTO reporte_mensual_manual (grupo, local, mes, seccion, concepto, monto, columna, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [grupo, local, `${mes}-01`, f.seccion, f.concepto, Number(f.monto || 0), Number(f.columna), email])
        count++
      }
      await client.query('COMMIT')
      return { ok: true, count }
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  })
}
