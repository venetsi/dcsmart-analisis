// Dashboard TV "Rendimiento General" (pantalla de oficina, sin interacción,
// refresco horario). La página vive en frontend/public/tv/ y se sirve en /tv/.
//
//   GET  /api/tv/config   el client id de Google para el botón (dato público)
//   POST /api/tv/login    { credential } de Google -> sesión de la TV (30 días)
//   GET  /api/tv/resumen  los datos; exige la sesión de la TV
//
// Acceso: ver lib/tvAcceso.js. Hasta el 2026-10 la ruta aceptaba una clave de
// servicio escrita en el HTML público de dcsmart-rendimiento.web.app; esa clave
// ya no sirve para nada. Esta ruta vivió solo en una copia local sin git y se
// perdió en el deploy del 25/09: por eso ahora está acá, en el repo.
//
// Jerárquico de mayor a menor (a pedido del usuario):
//   total histórico (ops, cajas, locales) → total vs auditadas (histórico,
//   con desauditorías contrapuestas) → heatmap de locales (ops y cajas por
//   separado) → top locales más activos del mes en curso (cadencia de carga
//   de ops por hora, según fecha de creación) → top locales por % de cajas
//   auditadas
//
// "Histórico" = SIN filtro de fecha, a pedido explícito del usuario (antes
// estos totales se acotaban al mes en curso, lo que los hacía ~0 los
// primeros días de cada mes). Solo el ranking de locales más activos usa
// el mes en curso (created_at) — el resto del endpoint sigue siendo
// histórico completo.
//
// Auditoría de pagos Y cajas son reales (ver vw_pagos_auditoria/vw_cajas_auditoria
// en etl/sql/02_views.sql) — cada fila de `audits` es un EVENTO (auditado o
// desauditado), no un estado único, así que "auditorías" y "desauditorías" son
// conteos reales de eventos.
//
// "locales" es una LISTA dinámica para el heatmap (ops y cajas por local,
// separados) — la plataforma es multi-tenant real (33 grupos en producción,
// muchos más locales), no 2 grupos fijos.

// mismo aplanado que datasets.js (BigQuery envuelve DATE/TIMESTAMP en {value}
// y NUMERIC en Big) — duplicado acá porque datasets.js no lo exporta.
function plain (v) {
  if (v === null || typeof v !== 'object') return v
  if ('value' in v) return v.value
  return v.toString()
}
function plainRows (rows) {
  return rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, plain(v)])))
}

function slugCorto (slug) {
  return slug ? String(slug).replace(/^grupo-/, '') : null
}

import crypto from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'
import { listaDeMails, puedeVerTv } from '../lib/tvAcceso.js'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null
// La TV no tiene a nadie al lado: una sesión corta la dejaría pidiendo login
// cada mañana. 30 días, y el acceso se re-chequea en cada pedido de datos.
const SESION_TV = '30d'
const NO_PUEDE = 'Este mail no tiene acceso al dashboard. Pedile a un super admin de DCSMART que te agregue.'

export default async function (fastify) {
  const lista = () => listaDeMails(process.env.TV_EMAILS)

  // Usuario de gestión por mail (activo y roles), o null si no existe ahí.
  async function usuarioGestion (email) {
    const { rows } = await fastify.dcsmartRo.query(
      `SELECT u.activo, COALESCE(array_agg(DISTINCT r.nombre) FILTER (WHERE r.nombre IS NOT NULL), '{}') AS roles
         FROM users u
         LEFT JOIN user_app_roles uar ON uar.id_user = u.id
         LEFT JOIN roles r ON r.id = uar.id_role
        WHERE lower(u.email) = $1
        GROUP BY u.id, u.activo`, [email])
    return rows[0] ?? null
  }

  // La página publicada en dcsmart-rendimiento.web.app manda la clave de
  // servicio en X-Tv-Service-Key: se sigue aceptando para que esa página ande
  // tal cual está. Cuando la página pase a usar el login, se borra el secret
  // TV_DASHBOARD_SERVICE_KEY del servicio y esta vía queda cerrada sola.
  function claveDeServicioValida (req) {
    const key = req.headers['x-tv-service-key']
    const expected = process.env.TV_DASHBOARD_SERVICE_KEY
    return Boolean(key && expected && key.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected)))
  }

  async function autenticarTv (req, reply) {
    if (claveDeServicioValida(req)) return
    try { await req.jwtVerify() } catch { return reply.code(401).send({ error: 'Sesión vencida o inexistente' }) }
    if (!req.user?.tv) return reply.code(401).send({ error: 'Sesión vencida o inexistente' })
    const email = req.user.email
    if (!puedeVerTv(email, lista(), lista().has(email) ? null : await usuarioGestion(email))) {
      return reply.code(403).send({ error: NO_PUEDE })
    }
  }

  fastify.get('/config', async () => ({ google_client_id: GOOGLE_CLIENT_ID ?? null }))

  fastify.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    if (!googleClient) return reply.code(500).send({ error: 'Login con Google no configurado' })
    const { credential } = req.body || {}
    if (!credential) return reply.code(400).send({ error: 'Falta credential de Google' })
    let payload
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID })
      payload = ticket.getPayload()
    } catch {
      return reply.code(401).send({ error: 'No se pudo validar la cuenta de Google' })
    }
    const email = payload.email?.trim().toLowerCase()
    if (!email || !payload.email_verified) return reply.code(401).send({ error: 'La cuenta de Google no tiene un mail verificado' })
    const usuario = lista().has(email) ? null : await usuarioGestion(email)
    if (!puedeVerTv(email, lista(), usuario)) {
      req.log.warn({ email }, 'tv: login rechazado')
      return reply.code(403).send({ error: NO_PUEDE })
    }
    req.log.info({ email }, 'tv: login')
    const token = fastify.jwt.sign({ email, nombre: payload.name ?? email, tv: true }, { expiresIn: SESION_TV })
    return { token, email, nombre: payload.name ?? email }
  })

  const DS = fastify.bqDataset
  // raw_pagos/raw_audits/raw_cajas/dim_locales/dim_rubcat/dim_metodos_pago en
  // ${DS} (dcsmart_analytics) son las tablas FÍSICAS del ETL viejo — quedaron
  // congeladas el 2026-08-07 cuando ese ETL se recortó a solo users/
  // diag_columnas (ver dcsmart_analytics_datastream_migration). El corte a CDC
  // solo reemplazó las vistas semánticas (vw_pagos_auditoria, vw_cajas_auditoria,
  // vw_audit_estado_actual) — quedaron sin migrar los nombres raw_*/dim_* que
  // esta ruta usa directo. Toda referencia a esas tablas puntuales debe leer de
  // acá (las vistas de compatibilidad de 04_cdc_compat_views.sql, siempre
  // frescas), no de ${DS}.
  const DS_CDC = 'dcsmart_analytics_cdc'
  // Cláusula general: TODA la información de este dashboard se restringe a
  // locales categorizados como "Gastronomía" (columna tipo_local en la tabla
  // Postgres locales, replicada tal cual por Datastream a public_locales —
  // no existe en la vista de compatibilidad dim_locales, que no expone esa
  // columna). A pedido explícito del usuario — locales de otros rubros
  // (Indumentaria, Arquitectura, Inmobiliario, Multimedia) quedan afuera de
  // cada métrica, no solo del heatmap de locales.
  const GASTRO = `(SELECT id FROM dcsmart_analytics_cdc.public_locales WHERE tipo_local = 'Gastronomía')`

  // Referencia para el KPI "Optimización con IA" (tarjeta de Pagos → Carga
  // con IA). Lectura IA: MEDIDO (mediana real de latencia de POST
  // /leer-factura en dcsmart-backend, últimos 30 días, vía Cloud Logging).
  // Revisión humana post-lectura y tiempo de carga manual: ESTIMADOS, no hay
  // dato medido todavía — el manual (3 min) lo confirmó el usuario
  // 2026-09-02 a partir de la complejidad del formulario (proveedor, rubro/
  // categoría, PV/NRO, importes, impuestos). Si en algún momento dcsmart
  // instrumenta el tiempo real de carga (ver sugerencia en memoria
  // dcsmart_rendimiento_general), estos 3 valores se reemplazan por datos
  // medidos sin cambiar la fórmula.
  const IA_LECTURA_SEG = 2.5
  const IA_REVISION_SEG = 45
  const MANUAL_REF_SEG = 3 * 60
  const AHORRO_SEG_POR_OP = MANUAL_REF_SEG - (IA_LECTURA_SEG + IA_REVISION_SEG)

  fastify.get('/resumen', {
    preHandler: [autenticarTv],
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const [
      [totalRows], [desauditRows], [localRows], [localesActivosRows], [etlRows], [cmvRows], [tiempoAuditRows], [pagos7dRows], [cargadoIaRows], [cumpleRows]
    ] = await Promise.all([
      // Totales históricos — SIN filtro de fecha.
      fastify.bq.query({
        query: `SELECT
                  (SELECT COUNT(*) FROM ${DS}.vw_pagos_auditoria WHERE id_local IN ${GASTRO}) AS ops,
                  (SELECT COUNTIF(auditada) FROM ${DS}.vw_pagos_auditoria WHERE id_local IN ${GASTRO}) AS ops_auditadas,
                  (SELECT COUNT(*) FROM ${DS}.vw_cajas_auditoria WHERE id_local IN ${GASTRO}) AS cajas,
                  (SELECT COUNTIF(auditada) FROM ${DS}.vw_cajas_auditoria WHERE id_local IN ${GASTRO}) AS cajas_auditadas,
                  (SELECT COUNT(DISTINCT local) FROM (
                     SELECT local FROM ${DS}.vw_pagos_auditoria WHERE local IS NOT NULL AND id_local IN ${GASTRO}
                     UNION DISTINCT
                     SELECT local FROM ${DS}.vw_cajas_auditoria WHERE local IS NOT NULL AND id_local IN ${GASTRO}
                  )) AS locales_activos`
      }),
      // Desauditorías históricas por tabla — error de operación, se muestra
      // contrapuesto al total de ops/auditadas (no es solo un dato de
      // ranking). vw_auditoria_actividad no expone id_local (es por
      // auditor, no por local) — se arma el join a pagos/cajas acá mismo
      // para poder aplicar el filtro de Gastronomía.
      fastify.bq.query({
        query: `WITH eventos AS (
                  SELECT au.tabla, au.aprobado,
                         IF(au.tabla = 'pagos', p.id_local, c.id_local) AS id_local
                  FROM ${DS_CDC}.raw_audits au
                  LEFT JOIN ${DS_CDC}.raw_pagos p ON au.tabla = 'pagos' AND p.id = au.id_registro
                  LEFT JOIN ${DS_CDC}.raw_cajas c ON au.tabla = 'cajas' AND c.id = au.id_registro
                  WHERE au.tabla IN ('pagos', 'cajas')
                )
                SELECT tabla, COUNTIF(aprobado) AS auditorias, COUNTIF(NOT aprobado) AS desauditorias
                FROM eventos
                WHERE id_local IN ${GASTRO}
                GROUP BY tabla`
      }),
      // Heatmap de locales — ops y cajas por separado, histórico completo.
      fastify.bq.query({
        query: `WITH p AS (
                  SELECT local, ANY_VALUE(grupo) AS grupo,
                         COUNT(*) AS ops, COUNTIF(auditada) AS ops_auditadas
                  FROM ${DS}.vw_pagos_auditoria WHERE local IS NOT NULL AND id_local IN ${GASTRO} GROUP BY local
                ), c AS (
                  SELECT local, ANY_VALUE(grupo) AS grupo,
                         COUNT(*) AS cajas, COUNTIF(auditada) AS cajas_auditadas
                  FROM ${DS}.vw_cajas_auditoria WHERE local IS NOT NULL AND id_local IN ${GASTRO} GROUP BY local
                )
                SELECT COALESCE(p.local, c.local) AS local, COALESCE(p.grupo, c.grupo) AS grupo,
                       IFNULL(p.ops, 0) AS ops, IFNULL(p.ops_auditadas, 0) AS ops_auditadas,
                       IFNULL(c.cajas, 0) AS cajas, IFNULL(c.cajas_auditadas, 0) AS cajas_auditadas
                FROM p FULL OUTER JOIN c ON p.local = c.local
                ORDER BY (IFNULL(p.ops,0) + IFNULL(c.cajas,0)) DESC`
      }),
      // Top locales más activos: cadencia de carga de ops por día en el
      // último mes (ventana móvil de 30 días), según fecha_created (no
      // fecha de la transacción) — a pedido explícito del usuario.
      // "ops_por_dia" divide por 30 (mismo divisor para todos los locales),
      // así que ordenar por ops DESC ya da el mismo orden que ordenar por
      // ops_por_dia DESC — se calcula igual para mostrarlo tal cual en la
      // tabla. ops_auditadas es sobre el MISMO cohorte de 30 días (no el
      // histórico completo de vw_pagos_auditoria) para que el % de auditado
      // que se muestra junto a la cadencia sea del mismo período.
      fastify.bq.query({
        query: `SELECT l.nombre AS local, COUNT(*) AS ops,
                       COUNTIF(IFNULL(e.auditada, FALSE)) AS ops_auditadas,
                       ROUND(COUNT(*) / 30.0, 1) AS ops_por_dia
                FROM ${DS_CDC}.raw_pagos p
                LEFT JOIN ${DS_CDC}.dim_locales l ON l.id = p.id_local
                LEFT JOIN ${DS}.vw_audit_estado_actual e ON e.tabla = 'pagos' AND e.id_registro = p.id
                WHERE p.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
                  AND p.id_local IN ${GASTRO}
                GROUP BY l.nombre
                ORDER BY ops DESC
                LIMIT 10`
      }),
      fastify.bq.query({
        query: `WITH latest AS (
                  SELECT run_id FROM ${DS}.etl_runs ORDER BY finished_at DESC LIMIT 1
                )
                SELECT ANY_VALUE(corte) AS corte, MAX(finished_at) AS finished_at,
                       IF(COUNTIF(estado='ERROR')>0,'ERROR',
                         IF(COUNTIF(estado='MISMATCH')>0,'MISMATCH','OK')) AS estado
                FROM ${DS}.etl_runs
                WHERE run_id IN (SELECT run_id FROM latest)`
      }),
      // Top 10 locales por mejor % de CMV (menor = mejor margen), ÚLTIMOS 30
      // DÍAS vs los 30 anteriores (a pedido explícito — antes era el mes
      // calendario completo anterior). Se ignoran los locales con % < 12:
      // en la práctica un CMV real nunca baja de ahí, así que un valor menor
      // es carga de costos incompleta (rezago), no un margen genuino — a
      // pedido explícito, para no mostrar un "mejor" que en realidad es un
      // local con datos a medio cargar.
      fastify.bq.query({
        query: `WITH periodo_actual AS (
                  SELECT DATE_SUB(CURRENT_DATE('America/Argentina/Buenos_Aires'), INTERVAL 30 DAY) AS desde,
                         CURRENT_DATE('America/Argentina/Buenos_Aires') AS hasta
                ),
                periodo_anterior AS (
                  SELECT DATE_SUB(desde, INTERVAL 30 DAY) AS desde, desde AS hasta FROM periodo_actual
                ),
                cmv_local AS (
                  SELECT p.id_local, SUM(p.importe) AS cmv
                  FROM ${DS_CDC}.raw_pagos p
                  JOIN ${DS_CDC}.dim_rubcat rc ON rc.id = p.id_rubcat
                  CROSS JOIN periodo_actual pa
                  WHERE UPPER(rc.rubro) LIKE 'CMV%' AND DATE(p.periodo) BETWEEN pa.desde AND pa.hasta
                    AND p.id_local IN ${GASTRO}
                  GROUP BY p.id_local
                ),
                ventas_local AS (
                  SELECT id_local, SUM(total) AS ventas
                  FROM ${DS_CDC}.raw_cajas CROSS JOIN periodo_actual pa
                  WHERE DATE(fecha_inicio) BETWEEN pa.desde AND pa.hasta
                    AND id_local IN ${GASTRO}
                  GROUP BY id_local
                ),
                cmv_local_prev AS (
                  SELECT p.id_local, SUM(p.importe) AS cmv
                  FROM ${DS_CDC}.raw_pagos p
                  JOIN ${DS_CDC}.dim_rubcat rc ON rc.id = p.id_rubcat
                  CROSS JOIN periodo_anterior pp
                  WHERE UPPER(rc.rubro) LIKE 'CMV%' AND DATE(p.periodo) >= pp.desde AND DATE(p.periodo) < pp.hasta
                    AND p.id_local IN ${GASTRO}
                  GROUP BY p.id_local
                ),
                ventas_local_prev AS (
                  SELECT id_local, SUM(total) AS ventas
                  FROM ${DS_CDC}.raw_cajas CROSS JOIN periodo_anterior pp
                  WHERE DATE(fecha_inicio) >= pp.desde AND DATE(fecha_inicio) < pp.hasta
                    AND id_local IN ${GASTRO}
                  GROUP BY id_local
                )
                SELECT l.nombre AS local,
                       ROUND(SAFE_DIVIDE(IFNULL(cl.cmv,0), vl.ventas) * 100, 1) AS pct_cmv,
                       ROUND(SAFE_DIVIDE(IFNULL(clp.cmv,0), vlp.ventas) * 100, 1) AS pct_cmv_anterior
                FROM ventas_local vl
                LEFT JOIN cmv_local cl ON cl.id_local = vl.id_local
                LEFT JOIN ${DS_CDC}.dim_locales l ON l.id = vl.id_local
                LEFT JOIN ventas_local_prev vlp ON vlp.id_local = vl.id_local
                LEFT JOIN cmv_local_prev clp ON clp.id_local = vl.id_local
                WHERE vl.ventas > 0 AND cl.cmv > 0
                  AND SAFE_DIVIDE(IFNULL(cl.cmv,0), vl.ventas) * 100 >= 12
                ORDER BY pct_cmv ASC
                LIMIT 10`
      }),
      // Tiempo promedio hasta auditar (creación del pago -> PRIMERA vez que
      // se aprobó, no la última — una op re-auditada tras una desauditoría
      // no "tardó" desde el evento más reciente). Ventana de 30 días vs los
      // 30 anteriores (antes era 7/7 — con huecos cortos de datos reales,
      // como el de agosto 2026, la ventana de 7 días quedaba en null seguido;
      // 30 días absorbe esos huecos sin dejar de ser "reciente").
      fastify.bq.query({
        query: `WITH primera AS (
                  SELECT id_registro, MIN(fecha) AS primera_fecha
                  FROM ${DS_CDC}.raw_audits
                  WHERE tabla = 'pagos' AND aprobado
                  GROUP BY id_registro
                ),
                detalle AS (
                  SELECT pa.primera_fecha,
                         TIMESTAMP_DIFF(pa.primera_fecha, p.created_at, HOUR) / 24.0 AS dias
                  FROM primera pa
                  JOIN ${DS_CDC}.raw_pagos p ON p.id = pa.id_registro
                  WHERE p.created_at IS NOT NULL AND pa.primera_fecha > p.created_at
                    -- una auditoría no puede haber pasado en el futuro: sin esto,
                    -- una fecha rota (dato corrupto conocido, ver
                    -- dcsmart_audits_fecha_futura_corrupcion) siempre cumple el
                    -- filtro de "semana actual" (>= hoy-7d, sin cota superior) y
                    -- contamina el promedio para siempre, sin importar cuán vieja
                    -- sea la corrupción.
                    AND pa.primera_fecha <= CURRENT_TIMESTAMP()
                    AND p.id_local IN ${GASTRO}
                )
                SELECT
                  ROUND(AVG(IF(primera_fecha >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY), dias, NULL)), 2) AS dias_semana_actual,
                  ROUND(AVG(IF(primera_fecha >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY)
                               AND primera_fecha < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY), dias, NULL)), 2) AS dias_semana_anterior
                FROM detalle`
      }),
      // Pagos realizados (pagado=true, solo tabla pagos — NO cajas), según
      // fecha_pago (cuándo se pagó, no cuándo se creó ni la fecha de la
      // transacción), en los ÚLTIMOS 7 DÍAS HÁBILES (lu-vie, no calendario
      // — se salta sábados/domingos) — a pedido explícito. Filtrado a forma
      // de pago Transferencia / MP / Mercado Pago — cubre todas las
      // variantes reales de dim_metodos_pago (MP Credito/Debito/Pix/Point*/
      // QR*, Mercado Pago, Mercado Pago QR) vía LIKE case-insensitive, no
      // columna de "tipo de método" separada (no existe en el esquema).
      // promedio_dia divide por 7 (fijo, son 7 días hábiles por construcción).
      fastify.bq.query({
        query: `WITH candidatos AS (
                  SELECT d AS fecha
                  FROM UNNEST(GENERATE_DATE_ARRAY(
                    DATE_SUB(CURRENT_DATE('America/Argentina/Buenos_Aires'), INTERVAL 13 DAY),
                    CURRENT_DATE('America/Argentina/Buenos_Aires')
                  )) AS d
                  WHERE EXTRACT(DAYOFWEEK FROM d) NOT IN (1, 7)
                ),
                ultimos_7_habiles AS (
                  SELECT fecha FROM candidatos ORDER BY fecha DESC LIMIT 7
                )
                SELECT COUNT(*) AS pagos_7d, ROUND(COUNT(*) / 7.0, 1) AS pagos_promedio_dia
                FROM ${DS_CDC}.raw_pagos p
                LEFT JOIN ${DS_CDC}.dim_metodos_pago mp ON mp.id = p.id_metodo
                JOIN ultimos_7_habiles u ON u.fecha = DATE(p.fecha_pago, 'America/Argentina/Buenos_Aires')
                WHERE p.pagado
                  AND (UPPER(mp.nombre) = 'TRANSFERENCIA' OR UPPER(mp.nombre) LIKE 'MP%' OR UPPER(mp.nombre) LIKE '%MERCADO PAGO%')
                  AND p.id_local IN ${GASTRO}`
      }),
      // Optimización con IA: últimos 30 días vs los 30 anteriores (a pedido
      // explícito, mismo criterio de ventana que "Tiempo hasta auditar").
      fastify.bq.query({
        query: `SELECT
                  COUNTIF(cargado_con_ia AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)) AS pagos_ia_30d,
                  COUNTIF(created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)) AS pagos_30d,
                  COUNTIF(cargado_con_ia
                          AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY)
                          AND created_at <  TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)) AS pagos_ia_30d_anterior,
                  COUNTIF(created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY)
                          AND created_at <  TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)) AS pagos_30d_anterior
                FROM ${DS_CDC}.raw_pagos
                WHERE id_local IN ${GASTRO}`
      }),
      // Cumpleaños de hoy: dim_users (NO es CDC, la sincroniza a mano
      // dcsmart-etl — ver dim_users más arriba) trae fecha_nac desde
      // 2026-09-10. Compara solo mes/día (fecha_nac es DATE puro, el año es
      // el de nacimiento, no importa acá). Nombre completo -> primera
      // palabra en la propia query, no en el frontend.
      fastify.bq.query({
        query: `SELECT SPLIT(TRIM(nombre), ' ')[OFFSET(0)] AS primer_nombre
                FROM ${DS}.dim_users
                WHERE activo AND fecha_nac IS NOT NULL
                  AND EXTRACT(MONTH FROM fecha_nac) = EXTRACT(MONTH FROM CURRENT_DATE('America/Argentina/Buenos_Aires'))
                  AND EXTRACT(DAY FROM fecha_nac) = EXTRACT(DAY FROM CURRENT_DATE('America/Argentina/Buenos_Aires'))
                ORDER BY primer_nombre`
      })
    ])

    const t = plainRows(totalRows)[0] || {}
    const desauditPorTabla = {}
    plainRows(desauditRows).forEach(r => { desauditPorTabla[r.tabla] = r })

    const ta = plainRows(tiempoAuditRows)[0] || {}
    const p7 = plainRows(pagos7dRows)[0] || {}
    const ia = plainRows(cargadoIaRows)[0] || {}
    const pagosIa30d = Number(ia.pagos_ia_30d || 0)
    const pagos30d = Number(ia.pagos_30d || 0)
    const pagosIa30dAnterior = Number(ia.pagos_ia_30d_anterior || 0)
    const pagos30dAnterior = Number(ia.pagos_30d_anterior || 0)

    const total = {
      ops: Number(t.ops || 0), ops_auditadas: Number(t.ops_auditadas || 0),
      cajas: Number(t.cajas || 0), cajas_auditadas: Number(t.cajas_auditadas || 0),
      locales_activos: Number(t.locales_activos || 0),
      ops_desauditorias: Number(desauditPorTabla.pagos?.desauditorias || 0),
      cajas_desauditorias: Number(desauditPorTabla.cajas?.desauditorias || 0),
      dias_hasta_auditar: ta.dias_semana_actual != null ? Number(ta.dias_semana_actual) : null,
      dias_hasta_auditar_semana_anterior: ta.dias_semana_anterior != null ? Number(ta.dias_semana_anterior) : null,
      pagos_7d: Number(p7.pagos_7d || 0),
      pagos_promedio_dia: Number(p7.pagos_promedio_dia || 0),
      pagos_ia_30d: pagosIa30d,
      pct_adopcion_ia: pagos30d > 0 ? Math.round((pagosIa30d / pagos30d) * 1000) / 10 : 0,
      pct_adopcion_ia_anterior: pagos30dAnterior > 0
        ? Math.round((pagosIa30dAnterior / pagos30dAnterior) * 1000) / 10
        : null,
      horas_ahorradas_ia: Math.round((pagosIa30d * AHORRO_SEG_POR_OP / 3600) * 10) / 10
    }

    const locales = plainRows(localRows).map(r => ({
      nombre: r.local, grupo: slugCorto(r.grupo),
      ops: Number(r.ops || 0), ops_auditadas: Number(r.ops_auditadas || 0),
      cajas: Number(r.cajas || 0), cajas_auditadas: Number(r.cajas_auditadas || 0)
    }))

    const locales_activos_mes = plainRows(localesActivosRows).map(r => ({
      nombre: r.local, ops: Number(r.ops || 0), ops_auditadas: Number(r.ops_auditadas || 0),
      ops_por_dia: Number(r.ops_por_dia || 0)
    }))

    const etl = plainRows(etlRows)[0] || {}

    const cmvPlain = plainRows(cmvRows)
    const top_cmv_locales = cmvPlain.map(r => ({
      nombre: r.local, pct_cmv: Number(r.pct_cmv || 0),
      pct_cmv_anterior: r.pct_cmv_anterior != null ? Number(r.pct_cmv_anterior) : null
    }))

    const cumpleanieros_hoy = plainRows(cumpleRows).map(r => r.primer_nombre).filter(Boolean)

    return {
      actualizado: new Date().toISOString(),
      ultimo_corte_etl: {
        corte: etl.corte || null,
        finished_at: etl.finished_at || null,
        estado: etl.estado || null
      },
      total,
      locales,
      locales_activos_mes,
      top_cmv_locales,
      cumpleanieros_hoy
    }
  })
}
