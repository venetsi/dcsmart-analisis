// Administrador de usuarios de la plataforma (solo perfil admin/DCADMIN).
// Lista usuarios REALES de la tabla original (RO) + estado de grant local.
// Los grants se escriben SOLO en la base propia dcsmart_analytics.
export default async function (fastify) {
  // GET /api/access/users?search=
  fastify.get('/users', { preHandler: [fastify.requireAdmin] }, async (req) => {
    const search = (req.query.search || '').trim()
    const params = []
    let where = ''
    if (search) { params.push('%' + search + '%'); where = 'WHERE u.email ILIKE $1 OR u.nombre ILIKE $1' }

    const { rows: users } = await fastify.dcsmartRo.query(
      `SELECT u.id, u.email, u.nombre, u.avatar_url, u.activo,
              COALESCE(ARRAY_AGG(DISTINCT r.nombre) FILTER (WHERE r.nombre IS NOT NULL), '{}') AS roles
         FROM users u
         LEFT JOIN user_app_roles uar ON uar.id_user = u.id
         LEFT JOIN roles r ON r.id = uar.id_role
         ${where}
        GROUP BY u.id ORDER BY u.nombre LIMIT 200`, params)

    const { rows: grants } = await fastify.analyticsDb.query(
      'SELECT user_id, enabled, is_admin FROM access_grants')
    const gmap = Object.fromEntries(grants.map(g => [g.user_id, g]))

    const allowedRoles = (process.env.ANALYTICS_ALLOWED_ROLES || 'super_admin;dcsmart').split(/[;,]/)
    return users.map(u => {
      const g = gmap[u.id]
      const byRole = u.roles.some(r => allowedRoles.includes(r))
      const acceso = g ? g.enabled : byRole
      return { ...u, acceso, por_rol: byRole, grant: g || null }
    })
  })

  // PUT /api/access/users/:id  { enabled, is_admin }
  fastify.put('/users/:id', { preHandler: [fastify.requireAdmin] }, async (req) => {
    const { id } = req.params
    const { enabled = true, is_admin = false } = req.body || {}
    const { rows } = await fastify.dcsmartRo.query('SELECT email FROM users WHERE id = $1', [id])
    if (!rows[0]) return { error: 'Usuario no encontrado' }

    await fastify.analyticsDb.query(
      `INSERT INTO access_grants (user_id, email, enabled, is_admin, granted_by)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE
         SET enabled = $3, is_admin = $4, granted_by = $5, updated_at = now()`,
      [id, rows[0].email, enabled, is_admin, req.user.email])
    return { ok: true }
  })
}
