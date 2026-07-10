// Login reutilizando la tabla users ORIGINAL (solo SELECT).
// Regla de acceso: (rol en ANALYTICS_ALLOWED_ROLES  O  grant explícito habilitado)
//                  Y usuario activo Y grant no deshabilitado.
// Emite JWT propio de la plataforma (secreto distinto al de producción).
import bcrypt from 'bcryptjs'

const ALLOWED_ROLES = (process.env.ANALYTICS_ALLOWED_ROLES || 'super_admin;dcsmart')
  .split(/[;,]/).map(s => s.trim()).filter(Boolean)

// Roles de la tabla original del usuario (via user_app_roles → roles)
async function getUserRoles (fastify, userId) {
  const { rows } = await fastify.dcsmartRo.query(
    `SELECT DISTINCT r.nombre
       FROM user_app_roles uar JOIN roles r ON r.id = uar.id_role
      WHERE uar.id_user = $1`, [userId])
  return rows.map(r => r.nombre)
}

async function getGrant (fastify, userId) {
  const { rows } = await fastify.analyticsDb.query(
    'SELECT enabled, is_admin FROM access_grants WHERE user_id = $1', [userId])
  return rows[0] || null
}

export async function resolveAccess (fastify, user) {
  const roles = await getUserRoles(fastify, user.id)
  const grant = await getGrant(fastify, user.id)
  const rolePermitido = roles.some(r => ALLOWED_ROLES.includes(r))

  if (grant && grant.enabled === false) return { ok: false }           // revocado explícito
  if (!rolePermitido && !(grant && grant.enabled)) return { ok: false } // ni rol ni grant

  const admin = roles.includes('super_admin') || roles.includes('dcsmart') || Boolean(grant?.is_admin)
  return { ok: true, roles, admin }
}

export default async function (fastify) {
  // POST /api/auth/login  { email, password }
  // Rate limit por IP para frenar fuerza bruta de contraseñas.
  fastify.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { email, password } = req.body || {}
    if (!email || !password) return reply.code(400).send({ error: 'Email y contraseña requeridos' })

    const { rows } = await fastify.dcsmartRo.query(
      'SELECT id, email, nombre, password_hash, avatar_url, activo FROM users WHERE email = $1', [email])
    const user = rows[0]
    if (!user || !user.activo || !user.password_hash) {
      return reply.code(401).send({ error: 'Credenciales inválidas' })
    }
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return reply.code(401).send({ error: 'Credenciales inválidas' })

    const access = await resolveAccess(fastify, user)
    if (!access.ok) {
      return reply.code(403).send({ error: 'Tu usuario no tiene acceso a la plataforma de análisis. Pedile a un administrador que te habilite.' })
    }

    const token = fastify.jwt.sign(
      { id: user.id, email: user.email, nombre: user.nombre, admin: access.admin, roles: access.roles },
      { expiresIn: '12h' })
    return { token, user: { id: user.id, email: user.email, nombre: user.nombre, avatar_url: user.avatar_url, admin: access.admin } }
  })

  // GET /api/auth/me
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (req) => ({ user: req.user }))
}
