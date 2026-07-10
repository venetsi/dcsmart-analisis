// dcsmart-analytics-api — servicio SEPARADO del backend de producción.
// Lee la tabla users original (solo lectura) para autenticar,
// guarda accesos/presets/log en su propia base, consulta BigQuery y proxya la IA.
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import 'dotenv/config'

import dbPlugin from './plugins/db.js'
import bqPlugin from './plugins/bigquery.js'
import authRoutes from './routes/auth.js'
import accessRoutes from './routes/access.js'
import presetsRoutes from './routes/presets.js'
import datasetsRoutes from './routes/datasets.js'
import aiRoutes from './routes/ai.js'

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: (origin, cb) => {
    const allowed = [process.env.FRONTEND_ORIGIN || 'https://analisis.dcsmart.app', 'http://localhost:5173']
    if (!origin || allowed.includes(origin) || /\.web\.app$/.test(origin)) cb(null, true)
    else cb(new Error('Not allowed by CORS'))
  },
  credentials: true
})

await app.register(jwt, { secret: process.env.ANALYTICS_JWT_SECRET })
await app.register(dbPlugin)
await app.register(bqPlugin)

app.decorate('authenticate', async (req, reply) => {
  try { await req.jwtVerify() } catch { reply.code(401).send({ error: 'No autorizado' }) }
})
app.decorate('requireAdmin', async (req, reply) => {
  try { await req.jwtVerify() } catch { return reply.code(401).send({ error: 'No autorizado' }) }
  if (!req.user.admin) reply.code(403).send({ error: 'Requiere perfil administrador' })
})

app.get('/api/health', async () => ({ ok: true, service: 'dcsmart-analytics-api' }))

await app.register(authRoutes,     { prefix: '/api/auth' })
await app.register(accessRoutes,   { prefix: '/api/access' })
await app.register(presetsRoutes,  { prefix: '/api/presets' })
await app.register(datasetsRoutes, { prefix: '/api/data' })
await app.register(aiRoutes,       { prefix: '/api/ai' })

const port = process.env.PORT || 8080
app.listen({ port, host: '0.0.0.0' })
