// Informe mensual (P&L + resumen + presentación), por local y mes.
//
// Lee de BigQuery lo que viene de gestión y guarda lo que se ajusta a mano en
// la base propia (informe_mensual, informe_reglas, informe_local; ver
// infra/00d_informe_mensual.sql). Nunca escribe en la base de gestión.
//
// El armado de los números vive en el frontend (lib/informe.js): acá solo se
// juntan las piezas y se persiste. Al cerrar el mes el cliente manda el
// snapshot ya calculado, que es lo que se presentó.

const okMes = (m) => /^\d{4}-\d{2}$/.test(m || '')
const txt = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// Imágenes como data URL: chicas (el cliente las comprime antes de subirlas).
const MAX_IMAGEN = 3 * 1024 * 1024
const okImagen = (v) => v === null || (typeof v === 'string' && /^data:image\/(png|jpe?g|webp|svg\+xml);base64,/.test(v) && v.length <= MAX_IMAGEN)

function plain (v) {
  if (v === null || v === undefined) return v
  if (typeof v !== 'object') return v
  if (v instanceof Date) return v.toISOString()
  if ('value' in v) return v.value
  return Number(v.toString())
}
const plainRows = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, plain(v)])))
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

function rangoMes (mes) {
  const [y, m] = mes.split('-').map(Number)
  return { desde: `${mes}-01`, hasta: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
}

export default async function (fastify) {
  const DS = fastify.bqDataset
  const db = fastify.analyticsDb

  // GET /api/informe?grupo&local&mes — todo lo que la pantalla necesita.
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const grupo = txt(req.query.grupo)
    const local = txt(req.query.local)
    const mes = req.query.mes
    if (!grupo || !local || !okMes(mes)) return reply.code(400).send({ error: 'grupo, local y mes (YYYY-MM) requeridos' })
    const { desde, hasta } = rangoMes(mes)
    const params = { grupo, local, desde, hasta }

    const [[ventasRows], [gastosRows], [cajaRows], guardado, reglas, localRow, anio] = await Promise.all([
      // Ventas del mes: total, efectivo (columna 2), PAX y días con venta.
      fastify.bq.query({
        query: `SELECT CAST(ROUND(SUM(total)) AS INT64) total, CAST(ROUND(SUM(efectivo)) AS INT64) efectivo,
                       SUM(comensales) comensales, SUM(tickets) tickets,
                       COUNT(DISTINCT IF(total > 0, fecha_dia, NULL)) dias
                  FROM ${DS}.vw_cajas
                 WHERE grupo = @grupo AND local = @local AND fecha_dia BETWEEN @desde AND @hasta`,
        params
      }),
      // Gastos por PERÍODO (el mes al que se imputa la factura), no por fecha
      // de factura: es lo que usa la planilla hecha a mano. Con período, el CMV
      // de Loreto 08-26 coincide al peso categoría por categoría; con fecha de
      // factura daba de más. Las notas de crédito restan (el agregado es NETO,
      // igual que en gestión).
      fastify.bq.query({
        query: `SELECT rubro, categoria, tipo,
                       CAST(ROUND(SUM(CASE WHEN ingresa_egreso = 'EGRESO' THEN importe
                                           WHEN STARTS_WITH(tipo, 'NC') THEN -importe ELSE 0 END)) AS INT64) total
                  FROM ${DS}.vw_pagos
                 WHERE grupo = @grupo AND local = @local
                   AND COALESCE(periodo_dia, fecha_dia) BETWEEN @desde AND @hasta
                 GROUP BY 1, 2, 3
                HAVING total != 0
                 ORDER BY total DESC`,
        params
      }),
      // Gastos pagados con plata de la caja: gestión no trae su detalle (Fudo
      // los manda como "Gasto" pelado), así que se muestran como un total a
      // repartir en la columna 2.
      fastify.bq.query({
        query: `SELECT CAST(ROUND(SUM(monto)) AS INT64) total
                  FROM ${DS}.vw_caja_detalles
                 WHERE grupo = @grupo AND local = @local AND tipo = 'gasto' AND fecha_dia BETWEEN @desde AND @hasta`,
        params
      }),
      db.query(`SELECT datos, cerrado, snapshot, actualizado_por, actualizado_at, cerrado_por, cerrado_at
                  FROM informe_mensual WHERE grupo = $1 AND local = $2 AND mes = $3`, [grupo, local, mes]),
      db.query('SELECT rubro, categoria, seccion, concepto FROM informe_reglas WHERE grupo = $1', [grupo]),
      db.query('SELECT razon_social, logo, foto FROM informe_local WHERE grupo = $1 AND local = $2', [grupo, local]),
      // Meses anteriores del mismo año, para el acumulado.
      db.query(`SELECT mes, cerrado, snapshot->'valores' AS valores
                  FROM informe_mensual
                 WHERE grupo = $1 AND local = $2 AND mes LIKE $3 AND mes < $4
                 ORDER BY mes`, [grupo, local, `${mes.slice(0, 4)}-%`, mes]),
    ])

    // Razón social por defecto: la del proveedor vinculado al local en gestión.
    let razonSocialGestion = null
    try {
      const { rows } = await fastify.dcsmartRo.query(
        `SELECT p.razon_social FROM locales l JOIN apps a ON a.id = l.id_app
           LEFT JOIN proveedores p ON p.id = l.id_proveedor
          WHERE l.nombre = $1 AND a.nombre = $2 LIMIT 1`, [local, grupo])
      razonSocialGestion = rows[0]?.razon_social || null
    } catch (err) {
      req.log.warn({ err }, 'informe: sin acceso a la razón social de gestión')
    }

    const v = plainRows(ventasRows)[0] || {}
    const g = guardado.rows[0]
    const l = localRow.rows[0] || {}
    return {
      grupo, local, mes,
      auto: {
        ventas: { total: num(v.total), efectivo: num(v.efectivo), comensales: num(v.comensales), tickets: num(v.tickets), dias: num(v.dias) },
        gastos: plainRows(gastosRows).map((r) => ({ rubro: r.rubro || '(sin rubro)', categoria: r.categoria || '(sin categoría)', tipo: r.tipo || '', total: num(r.total) })),
        cajaGastos: num(plainRows(cajaRows)[0]?.total),
      },
      guardado: g ? {
        datos: g.datos || {}, cerrado: g.cerrado, snapshot: g.snapshot,
        actualizado_por: g.actualizado_por, actualizado_at: g.actualizado_at,
        cerrado_por: g.cerrado_por, cerrado_at: g.cerrado_at,
      } : null,
      reglas: reglas.rows,
      local: { razon_social: l.razon_social || razonSocialGestion || '', logo: l.logo || null, foto: l.foto || null },
      anio: anio.rows,
    }
  })

  // PUT /api/informe  { grupo, local, mes, datos } — guarda los ajustes del mes.
  fastify.put('/', { preHandler: [fastify.authenticate], bodyLimit: 2 * 1024 * 1024 }, async (req, reply) => {
    const { mes, datos } = req.body || {}
    const grupo = txt(req.body?.grupo)
    const local = txt(req.body?.local)
    if (!grupo || !local || !okMes(mes) || typeof datos !== 'object' || !datos) return reply.code(400).send({ error: 'grupo, local, mes y datos requeridos' })
    const { rows } = await db.query(
      `INSERT INTO informe_mensual (grupo, local, mes, datos, actualizado_por, actualizado_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (grupo, local, mes) DO UPDATE
         SET datos = EXCLUDED.datos, actualizado_por = EXCLUDED.actualizado_por, actualizado_at = now()
       WHERE informe_mensual.cerrado = false
       RETURNING actualizado_at`, [grupo, local, mes, datos, req.user.email])
    if (!rows.length) return reply.code(409).send({ error: 'El mes está cerrado. Reabrilo para hacer cambios.' })
    return { ok: true, actualizado_at: rows[0].actualizado_at }
  })

  // POST /api/informe/cerrar  { grupo, local, mes, datos, snapshot } — congela los números.
  fastify.post('/cerrar', { preHandler: [fastify.authenticate], bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const { mes, datos, snapshot } = req.body || {}
    const grupo = txt(req.body?.grupo)
    const local = txt(req.body?.local)
    if (!grupo || !local || !okMes(mes) || !snapshot?.valores) return reply.code(400).send({ error: 'grupo, local, mes y snapshot requeridos' })
    const { rows } = await db.query(
      `INSERT INTO informe_mensual (grupo, local, mes, datos, cerrado, snapshot, actualizado_por, cerrado_por, cerrado_at)
       VALUES ($1, $2, $3, $4, true, $5, $6, $6, now())
       ON CONFLICT (grupo, local, mes) DO UPDATE
         SET datos = EXCLUDED.datos, cerrado = true, snapshot = EXCLUDED.snapshot,
             actualizado_por = EXCLUDED.actualizado_por, actualizado_at = now(), cerrado_por = EXCLUDED.cerrado_por, cerrado_at = now()
       WHERE informe_mensual.cerrado = false
       RETURNING cerrado_at`, [grupo, local, mes, datos || {}, snapshot, req.user.email])
    if (!rows.length) return reply.code(409).send({ error: 'El mes ya estaba cerrado.' })
    return { ok: true, cerrado_at: rows[0].cerrado_at }
  })

  // POST /api/informe/reabrir  { grupo, local, mes } — solo administradores.
  fastify.post('/reabrir', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    if (!req.user.admin) return reply.code(403).send({ error: 'Solo un administrador puede reabrir un mes cerrado.' })
    const { mes } = req.body || {}
    const grupo = txt(req.body?.grupo)
    const local = txt(req.body?.local)
    if (!grupo || !local || !okMes(mes)) return reply.code(400).send({ error: 'grupo, local y mes requeridos' })
    await db.query(`UPDATE informe_mensual SET cerrado = false, actualizado_por = $4, actualizado_at = now()
                     WHERE grupo = $1 AND local = $2 AND mes = $3`, [grupo, local, mes, req.user.email])
    return { ok: true }
  })

  // PUT /api/informe/regla  { grupo, rubro, categoria, seccion|null, concepto? }
  // A qué sección va una categoría de gestión, para todo el grupo. seccion null la borra.
  fastify.put('/regla', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const grupo = txt(req.body?.grupo)
    const rubro = txt(req.body?.rubro)
    const categoria = txt(req.body?.categoria)
    const seccion = req.body?.seccion == null ? null : txt(req.body.seccion, 40)
    const concepto = txt(req.body?.concepto) || null
    if (!grupo || !rubro || !categoria) return reply.code(400).send({ error: 'grupo, rubro y categoria requeridos' })
    if (!seccion) {
      await db.query('DELETE FROM informe_reglas WHERE grupo = $1 AND rubro = $2 AND categoria = $3', [grupo, rubro, categoria])
      return { ok: true }
    }
    await db.query(
      `INSERT INTO informe_reglas (grupo, rubro, categoria, seccion, concepto, actualizado_por)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (grupo, rubro, categoria) DO UPDATE
         SET seccion = EXCLUDED.seccion, concepto = EXCLUDED.concepto, actualizado_por = EXCLUDED.actualizado_por, actualizado_at = now()`,
      [grupo, rubro, categoria, seccion, concepto, req.user.email])
    return { ok: true }
  })

  // PUT /api/informe/local  { grupo, local, razon_social?, logo?, foto? }
  // Lo que la presentación necesita del local. Un campo ausente no se toca; null lo borra.
  fastify.put('/local', { preHandler: [fastify.authenticate], bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
    const b = req.body || {}
    const grupo = txt(b.grupo)
    const local = txt(b.local)
    if (!grupo || !local) return reply.code(400).send({ error: 'grupo y local requeridos' })
    for (const k of ['logo', 'foto']) {
      if (k in b && !okImagen(b[k])) return reply.code(400).send({ error: `La imagen (${k}) tiene que ser PNG, JPG, WEBP o SVG y pesar menos de 3 MB.` })
    }
    const actual = (await db.query('SELECT razon_social, logo, foto FROM informe_local WHERE grupo = $1 AND local = $2', [grupo, local])).rows[0] || {}
    const razon = 'razon_social' in b ? (txt(b.razon_social) || null) : (actual.razon_social ?? null)
    const logo = 'logo' in b ? b.logo : (actual.logo ?? null)
    const foto = 'foto' in b ? b.foto : (actual.foto ?? null)
    await db.query(
      `INSERT INTO informe_local (grupo, local, razon_social, logo, foto, actualizado_por)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (grupo, local) DO UPDATE
         SET razon_social = EXCLUDED.razon_social, logo = EXCLUDED.logo, foto = EXCLUDED.foto,
             actualizado_por = EXCLUDED.actualizado_por, actualizado_at = now()`,
      [grupo, local, razon, logo, foto, req.user.email])
    return { ok: true }
  })
}
