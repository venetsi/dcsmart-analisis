// Dos pools: dcsmartRo (base de producción, SOLO LECTURA) y analyticsDb (base propia)
import fp from 'fastify-plugin'
import pg from 'pg'

export default fp(async (fastify) => {
  const host = process.env.PGHOST // /cloudsql/... en Cloud Run, 127.0.0.1 en local

  const dcsmartRo = new pg.Pool({
    host, database: process.env.DCSMART_DB || 'postgres',
    user: process.env.PGUSER_RO || 'analytics_ro',
    password: process.env.PGPASSWORD_RO,
    max: 3, statement_timeout: 15000
  })

  const analyticsDb = new pg.Pool({
    host, database: process.env.ANALYTICS_DB || 'dcsmart_analytics',
    user: process.env.PGUSER_APP || 'analytics_app',
    password: process.env.PGPASSWORD_APP,
    max: 5
  })

  fastify.decorate('dcsmartRo', dcsmartRo)
  fastify.decorate('analyticsDb', analyticsDb)
  fastify.addHook('onClose', async () => { await dcsmartRo.end(); await analyticsDb.end() })
})
