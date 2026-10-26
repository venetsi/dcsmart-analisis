// Pools: dcsmartRo (base de producción, SOLO LECTURA), analyticsDb (base propia) y
// gestionLectura (ver abajo)
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

  // Lectura de gestión para los reportes que necesitan datos al día (Costo
  // impositivo). En prod es el mismo dcsmartRo. En dev, si GESTION_RO_HOST está
  // configurado, apunta a la base de PRODUCCIÓN con el usuario de solo lectura y
  // la sesión en read-only: la copia de dev no tiene los meses recientes
  // (pedido del usuario, 26/10/2026).
  const gestionLectura = process.env.GESTION_RO_HOST
    ? new pg.Pool({
      host: process.env.GESTION_RO_HOST, database: process.env.GESTION_RO_DB || 'postgres',
      user: process.env.GESTION_RO_USER || 'analytics_ro', password: process.env.GESTION_RO_PASSWORD,
      options: '-c default_transaction_read_only=on',
      max: 3, statement_timeout: 15000
    })
    : dcsmartRo

  fastify.decorate('dcsmartRo', dcsmartRo)
  fastify.decorate('gestionLectura', gestionLectura)
  fastify.decorate('analyticsDb', analyticsDb)
  fastify.addHook('onClose', async () => {
    await dcsmartRo.end(); await analyticsDb.end()
    if (gestionLectura !== dcsmartRo) await gestionLectura.end()
  })
})
