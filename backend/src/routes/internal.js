// Endpoints server-to-server para la app de gestión (dcsmart), protegidos
// con INTERNAL_SHARED_SECRET (header X-Internal-Secret) en vez de un JWT de
// usuario. No expuestos al frontend de esta plataforma.
export default async function (fastify) {
  fastify.addHook('preHandler', async (req, reply) => {
    const secret = req.headers['x-internal-secret']
    if (!process.env.INTERNAL_SHARED_SECRET || secret !== process.env.INTERNAL_SHARED_SECRET) {
      return reply.code(401).send({ error: 'No autorizado' })
    }
  })

  // GET /api/internal/access/:email
  // Estado actual de acceso: null en `enabled` significa "sin grant explícito"
  // (se deriva del rol, ver ANALYTICS_ALLOWED_ROLES / resolveAccess en auth.js).
  fastify.get('/access/:email', async (req, reply) => {
    const email = req.params.email?.trim().toLowerCase()
    const { rows } = await fastify.dcsmartRo.query('SELECT id FROM users WHERE email = $1', [email])
    const user = rows[0]
    if (!user) return reply.code(404).send({ error: 'Usuario no encontrado' })

    const { rows: grants } = await fastify.analyticsDb.query(
      'SELECT enabled, is_admin FROM access_grants WHERE user_id = $1', [user.id])
    return grants[0] || { enabled: null, is_admin: false }
  })

  // PUT /api/internal/access  { email, enabled, is_admin }
  // Mismo efecto que PUT /api/access/users/:id (access.js), pero identificado
  // por email (gestión no conoce el id interno de esta plataforma) y sin
  // requerir un JWT de admin de esta app.
  fastify.put('/access', async (req, reply) => {
    const email = req.body?.email?.trim().toLowerCase()
    const { enabled = true, is_admin = false } = req.body || {}
    if (!email) return reply.code(400).send({ error: 'email requerido' })

    const { rows } = await fastify.dcsmartRo.query('SELECT id, email FROM users WHERE email = $1', [email])
    const user = rows[0]
    if (!user) return reply.code(404).send({ error: 'Usuario no encontrado' })

    await fastify.analyticsDb.query(
      `INSERT INTO access_grants (user_id, email, enabled, is_admin, granted_by)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE
         SET enabled = $3, is_admin = $4, granted_by = $5, updated_at = now()`,
      [user.id, user.email, enabled, is_admin, 'gestion']
    )
    return { ok: true }
  })
}
