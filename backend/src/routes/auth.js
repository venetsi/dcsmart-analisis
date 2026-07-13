// Login reutilizando la tabla users ORIGINAL (solo SELECT).
// Regla de acceso: (rol en ANALYTICS_ALLOWED_ROLES  O  grant explícito habilitado)
//                  Y usuario activo Y grant no deshabilitado.
// Emite JWT propio de la plataforma (secreto distinto al de producción).
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'

const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null

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

// Arma el JWT propio de la plataforma + el objeto user que devuelve el frontend.
// Compartido por /login, /google y /sso.
function issueSession (fastify, user, access) {
  const token = fastify.jwt.sign(
    { id: user.id, email: user.email, nombre: user.nombre, admin: access.admin, roles: access.roles },
    { expiresIn: '12h' })
  return { token, user: { id: user.id, email: user.email, nombre: user.nombre, avatar_url: user.avatar_url, admin: access.admin } }
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

    return issueSession(fastify, user, access)
  })

  // POST /api/auth/google  { credential }
  // Login con Google (Identity Services / One Tap). A diferencia de la app de
  // gestión, NUNCA crea usuarios: esta plataforma solo tiene acceso de LECTURA
  // a la tabla `users` de producción (usuario analytics_ro). Si el email de
  // Google no coincide con un usuario existente y activo, se rechaza.
  fastify.post('/google', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    if (!googleClient) return reply.code(500).send({ error: 'Login con Google no configurado' })

    const { credential } = req.body || {}
    if (!credential) return reply.code(400).send({ error: 'Falta credential de Google' })

    let payload
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID })
      payload = ticket.getPayload()
    } catch {
      return reply.code(401).send({ error: 'Token de Google inválido' })
    }

    const email = payload.email?.trim().toLowerCase()
    const { rows } = await fastify.dcsmartRo.query(
      'SELECT id, email, nombre, avatar_url, activo FROM users WHERE email = $1', [email])
    const user = rows[0]
    if (!user || !user.activo) {
      return reply.code(401).send({ error: 'Tu cuenta de Google no coincide con ningún usuario activo de DCSMART.' })
    }

    const access = await resolveAccess(fastify, user)
    if (!access.ok) {
      return reply.code(403).send({ error: 'Tu usuario no tiene acceso a la plataforma de análisis. Pedile a un administrador que te habilite.' })
    }

    return issueSession(fastify, user, access)
  })

  // POST /api/auth/sso  { ticket }
  // Login sin repetir credenciales para usuarios que ya están logueados en
  // la app de gestión: gestión firma un ticket cortísimo (60s, un solo viaje)
  // con el email del usuario usando INTERNAL_SHARED_SECRET; acá se verifica
  // y, si el usuario existe/está activo/tiene acceso, se emite el JWT propio
  // de esta plataforma. Nunca se comparten cookies ni JWT_SECRET entre apps.
  fastify.post('/sso', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    if (!process.env.INTERNAL_SHARED_SECRET) return reply.code(500).send({ error: 'SSO no configurado' })

    const { ticket } = req.body || {}
    if (!ticket) return reply.code(400).send({ error: 'Falta ticket' })

    let payload
    try {
      payload = jwt.verify(ticket, process.env.INTERNAL_SHARED_SECRET, {
        issuer: 'dcsmart-gestion', audience: 'dcsmart-analytics'
      })
    } catch {
      return reply.code(401).send({ error: 'Ticket inválido o expirado. Volvé a hacer clic en el link desde gestión.' })
    }

    const email = payload.email?.trim().toLowerCase()
    const { rows } = await fastify.dcsmartRo.query(
      'SELECT id, email, nombre, avatar_url, activo FROM users WHERE email = $1', [email])
    const user = rows[0]
    if (!user || !user.activo) return reply.code(401).send({ error: 'Usuario no encontrado o inactivo' })

    const access = await resolveAccess(fastify, user)
    if (!access.ok) {
      return reply.code(403).send({ error: 'Tu usuario no tiene acceso a la plataforma de análisis. Pedile a un administrador que te habilite.' })
    }

    return issueSession(fastify, user, access)
  })

  // GET /api/auth/me
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (req) => ({ user: req.user }))
}
