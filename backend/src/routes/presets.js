// Informes preseteados del sidebar (tabla presets de la base propia)
export default async function (fastify) {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async () => {
    const { rows } = await fastify.analyticsDb.query(
      'SELECT * FROM presets WHERE activo = true ORDER BY orden, nombre')
    return rows
  })

  fastify.post('/', { preHandler: [fastify.requireAdmin] }, async (req) => {
    const { slug, nombre, icono, dataset, filtros = {}, layout = {}, ai_prompt, orden = 100 } = req.body || {}
    const { rows } = await fastify.analyticsDb.query(
      `INSERT INTO presets (slug, nombre, icono, dataset, filtros, layout, ai_prompt, orden, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [slug, nombre, icono, dataset, filtros, layout, ai_prompt, orden, req.user.email])
    return rows[0]
  })

  fastify.put('/:id', { preHandler: [fastify.requireAdmin] }, async (req) => {
    const { nombre, icono, filtros, layout, ai_prompt, orden, activo } = req.body || {}
    const { rows } = await fastify.analyticsDb.query(
      `UPDATE presets SET nombre = COALESCE($2,nombre), icono = COALESCE($3,icono),
              filtros = COALESCE($4,filtros), layout = COALESCE($5,layout),
              ai_prompt = COALESCE($6,ai_prompt), orden = COALESCE($7,orden),
              activo = COALESCE($8,activo)
        WHERE id = $1 RETURNING *`,
      [req.params.id, nombre, icono, filtros, layout, ai_prompt, orden, activo])
    return rows[0] || { error: 'No encontrado' }
  })
}
