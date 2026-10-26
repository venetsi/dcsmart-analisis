// Reporte de Ventas mensual por cliente (conjunto de locales de un grupo).
//
// Lee de BigQuery lo que viene de gestión y guarda lo que se corrige a mano en
// la base propia (rv_*; ver infra/00e_reporte_ventas.sql). Nunca escribe en la
// base de gestión. El armado de los números vive en el frontend
// (lib/reporteVentas.js); acá solo se juntan las piezas.

import { Storage } from '@google-cloud/storage'
import { crearLogosLocales } from '../lib/logosLocales.js'
import { crearIpc } from '../lib/ipc.js'
import {
  okMes, rangoReporte, esInterno, normalizarDato, mesCerrable, nombresOk, logosOk, snapshotOk, datoEnSnapshot, okOrigenRegla,
  datoLibre, obsOk, paginaOk, ipcOk, OBS_MAX,
} from '../lib/reporteVentas.js'

const txt = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function plain (v) {
  if (v === null || v === undefined) return v
  if (typeof v !== 'object') return v
  if (v instanceof Date) return v.toISOString()
  if ('value' in v) return v.value
  return Number(v.toString())
}
const plainRows = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, plain(v)])))
// numeric de pg llega como string; los NULL se respetan.
const numOrNull = (v) => (v === null || v === undefined ? null : Number(v))
const numOk = (v) => typeof v === 'number' && Number.isFinite(v)
const numONull = (v) => v === null || numOk(v)
const MSG_INTERNO = 'Solo el equipo DC puede editar el reporte.'
const MSG_CERRADO = 'El mes está cerrado. Reabrilo para hacer cambios.'
const MSG_LOGO = 'Cada logo debe ser una imagen PNG, JPG o WEBP de hasta 400 KB.'
const BODY_CLIENTE = 4 * 1024 * 1024
const MSG_EN_CIERRE = 'Ese dato quedó guardado en el cierre del mes. Reabrilo para cambiarlo.'

// Nombre de 1 a 80 caracteres, recortado (null si no sirve).
const nombreOk = (v) => { const t = txt(v, 81); return t && t.length <= 80 ? t : null }
// Lista de locales: textos no vacíos, sin repetidos (null si queda vacía o es inválida).
function localesOk (v) {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return null
  const l = [...new Set(v.map((x) => x.trim()).filter(Boolean))]
  return l.length ? l : null
}

export default async function (fastify) {
  const DS = fastify.bqDataset
  const db = fastify.analyticsDb

  // Logo que cada local tiene en gestión: el de respaldo cuando el cliente no subió uno propio.
  const storage = new Storage()
  const logosDe = crearLogosLocales({
    consultar: async (grupo, locales) => (await fastify.dcsmartRo.query(
      `SELECT l.nombre, l.logo_url FROM locales l JOIN apps a ON a.id = l.id_app
        WHERE a.nombre = $1 AND l.nombre = ANY($2) AND l.logo_url IS NOT NULL`, [grupo, locales])).rows,
    descargar: async ({ bucket, archivo }) => (await storage.bucket(bucket).file(archivo).download())[0],
    log: fastify.log,
  })
  const conLogosLocal = async (cli) => (cli ? { ...cli, logosLocal: await logosDe(cli.grupo, cli.locales) } : cli)
  // Inflación mensual (IPC de INDEC) para el acumulado; si falla, el reporte sale igual sin ella.
  const ipc = crearIpc({ db, log: fastify.log })
  const ipcDe = async (desde, hasta) => {
    try { return await ipc.leer(desde, hasta) } catch (err) {
      fastify.log.warn({ err }, 'reporte-ventas: no se pudo leer el IPC')
      return {}
    }
  }

  // GET /api/reporte-ventas/clientes?grupo= — los clientes definidos.
  fastify.get('/clientes', { preHandler: [fastify.authenticate] }, async (req) => {
    const grupo = txt(req.query.grupo)
    const { rows } = await db.query(
      `SELECT id, grupo, nombre, locales, nombres, logos FROM rv_cliente
        WHERE ($1 = '' OR grupo = $1) ORDER BY grupo, nombre`, [grupo])
    return Promise.all(rows.map(conLogosLocal))
  })

  // GET /api/reporte-ventas/:id?mes=YYYY-MM — todo lo que la pantalla necesita,
  // desde enero del año anterior hasta `mes`.
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const id = Number(req.params.id)
    const mes = req.query.mes
    if (!Number.isInteger(id) || id <= 0 || !okMes(mes)) return reply.code(400).send({ error: 'id y mes (YYYY-MM) requeridos' })

    const cli = (await db.query('SELECT id, grupo, nombre, locales, nombres, logos FROM rv_cliente WHERE id = $1', [id])).rows[0]
    if (!cli) return reply.code(404).send({ error: 'Cliente no encontrado' })

    const { desde, hasta } = rangoReporte(mes)
    const params = { grupo: cli.grupo, locales: cli.locales, desde, hasta }
    const where = 'grupo = @grupo AND local IN UNNEST(@locales) AND fecha_dia BETWEEN @desde AND @hasta'

    // BigQuery no acepta un arreglo vacío como parámetro: sin locales no hay nada que consultar.
    const bq = cli.locales.length ? (q) => fastify.bq.query(q) : async () => [[]]
    const [[ventasRows], [detRows], [origRows], valores, cierres, reglas, historial, observaciones, inflacion] = await Promise.all([
      // SUM sin COALESCE: si todo es NULL el dato no existe (null, no 0).
      // cajas / sinCubiertos / sinOrdenes: cuántas cajas hubo y cuántas no informaron
      // (NULL o 0). Con alguna sin informar, el motor no toma la suma como dato.
      bq({
        query: `SELECT local, FORMAT_DATE('%Y-%m', fecha_dia) mes,
                       CAST(ROUND(SUM(total)) AS INT64) venta, SUM(comensales) cubiertos, SUM(tickets) ordenes,
                       COUNT(*) cajas,
                       COUNTIF(comensales IS NULL OR comensales = 0) sinCubiertos,
                       COUNTIF(tickets IS NULL OR tickets = 0) sinOrdenes
                  FROM ${DS}.vw_cajas WHERE ${where} GROUP BY 1, 2`,
        params
      }),
      // Cobros por método de pago (los gastos y otros tipos no son venta).
      bq({
        query: `SELECT local, FORMAT_DATE('%Y-%m', fecha_dia) mes, metodo, SUM(monto) monto
                  FROM ${DS}.vw_caja_detalles WHERE ${where} AND tipo = 'cobro' GROUP BY 1, 2, 3`,
        params
      }),
      bq({
        query: `SELECT local, FORMAT_DATE('%Y-%m', fecha_dia) mes, origin, SUM(total) total
                  FROM ${DS}.vw_cajas WHERE ${where} GROUP BY 1, 2, 3`,
        params
      }),
      db.query(`SELECT local, mes, dato, valor, original, actualizado_por, actualizado_at
                  FROM rv_valor WHERE cliente_id = $1 AND mes >= $2 AND mes <= $3
                 ORDER BY local, mes, dato`, [id, desde.slice(0, 7), mes]),
      // Solo meses cerrados: son los que reemplazan al cálculo.
      db.query(`SELECT mes, origen, snapshot, cerrado, cerrado_por, cerrado_at
                  FROM rv_cierre WHERE cliente_id = $1 AND cerrado AND mes >= $2 AND mes <= $3
                 ORDER BY mes`, [id, desde.slice(0, 7), mes]),
      db.query(`SELECT local, match, valor, canal, delivery FROM rv_regla_canal
                 WHERE cliente_id = $1 ORDER BY local, match, valor`, [id]),
      db.query(`SELECT local, mes, dato, antes, despues, por, at FROM rv_valor_historial
                 WHERE cliente_id = $1 AND mes = $2 ORDER BY at DESC, id DESC LIMIT 200`, [id, mes]),
      db.query(`SELECT pagina, texto, actualizado_por, actualizado_at FROM rv_observacion
                 WHERE cliente_id = $1 AND mes = $2`, [id, mes]),
      ipcDe(desde.slice(0, 7), mes),
    ])

    const auto = Object.fromEntries(cli.locales.map((l) => [l, { meses: {}, detalles: {}, cajasOrigen: {} }]))
    for (const r of plainRows(ventasRows)) {
      if (!auto[r.local]) continue
      auto[r.local].meses[r.mes] = {
        venta: numOrNull(r.venta), cubiertos: numOrNull(r.cubiertos), ordenes: numOrNull(r.ordenes),
        cajas: numOrNull(r.cajas), sinCubiertos: numOrNull(r.sinCubiertos), sinOrdenes: numOrNull(r.sinOrdenes),
      }
    }
    for (const r of plainRows(detRows)) {
      if (!auto[r.local]) continue
      ;(auto[r.local].detalles[r.mes] ||= []).push({ metodo: r.metodo, monto: numOrNull(r.monto) })
    }
    for (const r of plainRows(origRows)) {
      if (!auto[r.local]) continue
      ;(auto[r.local].cajasOrigen[r.mes] ||= []).push({ origin: r.origin, total: numOrNull(r.total) })
    }

    return {
      cliente: await conLogosLocal(cli), mes, auto,
      valores: valores.rows.map((v) => ({ ...v, valor: numOrNull(v.valor), original: numOrNull(v.original) })),
      cierres: cierres.rows,
      reglas: reglas.rows,
      historial: historial.rows.map((h) => ({ ...h, antes: numOrNull(h.antes), despues: numOrNull(h.despues) })),
      observaciones: Object.fromEntries(observaciones.rows.map((o) => [o.pagina, o])),
      ipc: inflacion,
    }
  })

  // ---- Escritura: solo el equipo DC ----
  const interno = async (req, reply) => {
    if (!esInterno(req.user)) return reply.code(403).send({ error: MSG_INTERNO })
  }
  const pre = { preHandler: [fastify.authenticate, interno] }
  const quien = (req) => req.user.email || req.user.nombre || String(req.user.id)
  const idDe = (req) => { const n = Number(req.params.id); return Number.isInteger(n) && n > 0 ? n : null }
  const getCli = async (id) => (await db.query('SELECT id, grupo, nombre, locales, nombres, logos FROM rv_cliente WHERE id = $1', [id])).rows[0]
  const mesCerrado = async (c, id, mes) =>
    (await c.query('SELECT 1 FROM rv_cierre WHERE cliente_id = $1 AND mes = $2 AND cerrado', [id, mes])).rowCount > 0
  // Foto del mes si está cerrado (null si está abierto), bloqueada hasta el fin de la transacción.
  const cierreDe = async (c, id, mes) =>
    (await c.query('SELECT snapshot FROM rv_cierre WHERE cliente_id = $1 AND mes = $2 AND cerrado FOR UPDATE', [id, mes])).rows[0] || null

  // Corrige (o borra la corrección de) un dato. valor null = restaurar.
  // En un mes cerrado solo se completa lo que la foto no trae (Ruling 24), salvo
  // cubiertos, órdenes y tickets, que se corrigen siempre (datoLibre).
  fastify.put('/:id/valor', pre, async (req, reply) => {
    const id = idDe(req)
    const b = req.body || {}
    const dato = normalizarDato(b.dato)
    const local = typeof b.local === 'string' ? b.local.trim() : ''
    if (!id || !okMes(b.mes) || !dato || !local) return reply.code(400).send({ error: 'Faltan datos o son inválidos (local, mes, dato).' })
    if (!numONull(b.valor) || b.valor === undefined || !numONull(b.original) || b.original === undefined) {
      return reply.code(400).send({ error: 'valor y original deben ser números o null.' })
    }
    const cli = await getCli(id)
    if (!cli) return reply.code(404).send({ error: 'Cliente no encontrado' })
    if (!cli.locales.includes(local)) return reply.code(400).send({ error: 'El local no pertenece al cliente.' })

    const c = await db.connect()
    try {
      await c.query('BEGIN')
      const cierre = await cierreDe(c, id, b.mes)
      if (cierre && !datoLibre(dato) && datoEnSnapshot(cierre.snapshot, local, dato)) { await c.query('ROLLBACK'); return reply.code(409).send({ error: MSG_EN_CIERRE }) }
      const prev = (await c.query(
        'SELECT valor FROM rv_valor WHERE cliente_id = $1 AND local = $2 AND mes = $3 AND dato = $4 FOR UPDATE',
        [id, local, b.mes, dato])).rows[0]
      const antes = prev ? Number(prev.valor) : b.original
      if (b.valor === null) {
        await c.query('DELETE FROM rv_valor WHERE cliente_id = $1 AND local = $2 AND mes = $3 AND dato = $4', [id, local, b.mes, dato])
      } else {
        await c.query(
          `INSERT INTO rv_valor (cliente_id, local, mes, dato, valor, original, actualizado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (cliente_id, local, mes, dato)
           DO UPDATE SET valor = EXCLUDED.valor, actualizado_por = EXCLUDED.actualizado_por, actualizado_at = now()`,
          [id, local, b.mes, dato, b.valor, b.original, quien(req)])
      }
      await c.query(
        `INSERT INTO rv_valor_historial (cliente_id, local, mes, dato, antes, despues, por)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, local, b.mes, dato, antes, b.valor, quien(req)])
      await c.query('COMMIT')
      return { ok: true }
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {})
      throw e
    } finally { c.release() }
  })

  // Borra todas las correcciones del mes (queda en el historial).
  // Observación opcional de una hoja. texto vacío = borrarla. Se puede escribir aunque
  // el mes esté cerrado: es un comentario, no cambia ningún número.
  fastify.put('/:id/observacion', pre, async (req, reply) => {
    const id = idDe(req)
    const b = req.body || {}
    const texto = obsOk(b.texto)
    if (!id || !okMes(b.mes) || !paginaOk(b.pagina)) return reply.code(400).send({ error: 'Faltan datos o son inválidos (mes, hoja).' })
    if (texto === null) return reply.code(400).send({ error: `La observación puede tener hasta ${OBS_MAX} caracteres.` })
    if (!(await getCli(id))) return reply.code(404).send({ error: 'Cliente no encontrado' })
    if (!texto) {
      await db.query('DELETE FROM rv_observacion WHERE cliente_id = $1 AND mes = $2 AND pagina = $3', [id, b.mes, b.pagina])
    } else {
      await db.query(
        `INSERT INTO rv_observacion (cliente_id, mes, pagina, texto, actualizado_por) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (cliente_id, mes, pagina)
         DO UPDATE SET texto = EXCLUDED.texto, actualizado_por = EXCLUDED.actualizado_por, actualizado_at = now()`,
        [id, b.mes, b.pagina, texto, quien(req)])
    }
    return { ok: true }
  })

  // Inflación de un mes cargada a mano (vale para todos los clientes). null = volver
  // a la de INDEC: se borra lo cargado y se vuelve a consultar.
  fastify.put('/ipc', pre, async (req, reply) => {
    const b = req.body || {}
    if (!okMes(b.mes) || b.variacion === undefined || !ipcOk(b.variacion)) {
      return reply.code(400).send({ error: 'mes (YYYY-MM) y variacion (un % entre -50 y 100, o null) requeridos.' })
    }
    if (b.variacion === null) {
      await db.query(`DELETE FROM rv_ipc WHERE mes = $1 AND fuente = 'mano'`, [b.mes])
      try { await ipc.actualizar(b.mes) } catch (err) { fastify.log.warn({ err }, 'reporte-ventas: no se pudo consultar el IPC de INDEC') }
    } else {
      await db.query(
        `INSERT INTO rv_ipc (mes, variacion, fuente, actualizado_por) VALUES ($1, $2, 'mano', $3)
         ON CONFLICT (mes) DO UPDATE SET variacion = EXCLUDED.variacion, fuente = 'mano',
           actualizado_por = EXCLUDED.actualizado_por, actualizado_at = now()`, [b.mes, b.variacion, quien(req)])
    }
    return { ok: true }
  })

  fastify.post('/:id/restaurar', pre, async (req, reply) => {
    const id = idDe(req)
    const mes = req.body?.mes
    if (!id || !okMes(mes)) return reply.code(400).send({ error: 'mes (YYYY-MM) requerido' })
    if (!(await getCli(id))) return reply.code(404).send({ error: 'Cliente no encontrado' })
    const c = await db.connect()
    try {
      await c.query('BEGIN')
      if (await mesCerrado(c, id, mes)) { await c.query('ROLLBACK'); return reply.code(409).send({ error: MSG_CERRADO }) }
      const del = await c.query(
        'DELETE FROM rv_valor WHERE cliente_id = $1 AND mes = $2 RETURNING local, dato, valor', [id, mes])
      for (const r of del.rows) {
        await c.query(
          `INSERT INTO rv_valor_historial (cliente_id, local, mes, dato, antes, despues, por)
           VALUES ($1,$2,$3,$4,$5,NULL,$6)`, [id, r.local, mes, r.dato, r.valor, quien(req)])
      }
      await c.query('COMMIT')
      return { ok: true, restaurados: del.rowCount }
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {})
      throw e
    } finally { c.release() }
  })

  fastify.post('/:id/cerrar', pre, async (req, reply) => {
    const id = idDe(req)
    const { mes, snapshot } = req.body || {}
    if (!id || !okMes(mes)) return reply.code(400).send({ error: 'mes (YYYY-MM) requerido' })
    if (!mesCerrable(mes)) return reply.code(400).send({ error: 'Solo se cierran meses terminados.' })
    if (!snapshotOk(snapshot)) return reply.code(400).send({ error: 'Falta la foto del mes (snapshot con sus locales).' })
    if (!(await getCli(id))) return reply.code(404).send({ error: 'Cliente no encontrado' })
    // Inserta, o vuelve a cerrar si había quedado abierto (la foto que se reemplaza
    // queda en snapshot_anterior); si ya estaba cerrado no toca nada.
    const { rowCount } = await db.query(
      `INSERT INTO rv_cierre (cliente_id, mes, origen, snapshot, cerrado, cerrado_por)
       VALUES ($1,$2,'reporte',$3,true,$4)
       ON CONFLICT (cliente_id, mes) DO UPDATE
         SET origen = 'reporte', snapshot_anterior = rv_cierre.snapshot, snapshot = EXCLUDED.snapshot, cerrado = true,
             cerrado_por = EXCLUDED.cerrado_por, cerrado_at = now()
       WHERE NOT rv_cierre.cerrado`, [id, mes, JSON.stringify(snapshot), quien(req)])
    if (!rowCount) return reply.code(409).send({ error: 'El mes ya estaba cerrado.' })
    return { ok: true }
  })

  // El snapshot queda como referencia; el mes vuelve a calcularse.
  fastify.post('/:id/reabrir', pre, async (req, reply) => {
    const id = idDe(req)
    const mes = req.body?.mes
    if (!id || !okMes(mes)) return reply.code(400).send({ error: 'mes (YYYY-MM) requerido' })
    const { rowCount } = await db.query(
      'UPDATE rv_cierre SET cerrado = false WHERE cliente_id = $1 AND mes = $2 AND cerrado', [id, mes])
    if (!rowCount) return reply.code(404).send({ error: 'El mes no estaba cerrado.' })
    return { ok: true }
  })

  // ---- Clientes ----
  fastify.post('/clientes', { ...pre, bodyLimit: BODY_CLIENTE }, async (req, reply) => {
    const grupo = txt(req.body?.grupo)
    const nombre = nombreOk(req.body?.nombre)
    const locales = localesOk(req.body?.locales)
    if (!grupo || !nombre || !locales) return reply.code(400).send({ error: 'Faltan el grupo, el nombre (hasta 80 caracteres) o los locales.' })
    const nombres = nombresOk(req.body?.nombres, locales)
    if (nombres === null) return reply.code(400).send({ error: 'Los nombres de los locales deben ser texto de hasta 60 caracteres.' })
    const logos = logosOk(req.body?.logos, locales)
    if (logos === null) return reply.code(400).send({ error: MSG_LOGO })
    try {
      const { rows } = await db.query(
        `INSERT INTO rv_cliente (grupo, nombre, locales, nombres, logos, creado_por) VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, grupo, nombre, locales, nombres, logos`,
        [grupo, nombre, locales, JSON.stringify(nombres ?? {}), JSON.stringify(logos ?? {}), quien(req)])
      return conLogosLocal(rows[0])
    } catch (e) {
      if (e.code === '23505') return reply.code(409).send({ error: 'Ya existe un cliente con ese nombre en el grupo.' })
      throw e
    }
  })

  fastify.put('/clientes/:id', { ...pre, bodyLimit: BODY_CLIENTE }, async (req, reply) => {
    const id = idDe(req)
    const nombre = nombreOk(req.body?.nombre)
    const locales = localesOk(req.body?.locales)
    if (!id || !nombre || !locales) return reply.code(400).send({ error: 'Faltan el nombre (hasta 80 caracteres) o los locales.' })
    const nombres = nombresOk(req.body?.nombres, locales)
    if (nombres === null) return reply.code(400).send({ error: 'Los nombres de los locales deben ser texto de hasta 60 caracteres.' })
    const logos = logosOk(req.body?.logos, locales)
    if (logos === null) return reply.code(400).send({ error: MSG_LOGO })
    try {
      // Sin `nombres` o `logos` en el pedido se conservan los que había (solo de los locales que siguen).
      const { rows } = await db.query(
        `UPDATE rv_cliente SET nombre = $2, locales = $3,
                nombres = COALESCE($4::jsonb, (SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
                                                 FROM jsonb_each(nombres) AS e(k, v) WHERE k = ANY($3))),
                logos = COALESCE($5::jsonb, (SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
                                               FROM jsonb_each(logos) AS e(k, v) WHERE k = ANY($3)))
          WHERE id = $1
         RETURNING id, grupo, nombre, locales, nombres, logos`,
        [id, nombre, locales, nombres === undefined ? null : JSON.stringify(nombres), logos === undefined ? null : JSON.stringify(logos)])
      if (!rows[0]) return reply.code(404).send({ error: 'Cliente no encontrado' })
      return conLogosLocal(rows[0])
    } catch (e) {
      if (e.code === '23505') return reply.code(409).send({ error: 'Ya existe un cliente con ese nombre en el grupo.' })
      throw e
    }
  })

  // ---- Reglas de canal ----
  fastify.put('/:id/regla', pre, async (req, reply) => {
    const id = idDe(req)
    const b = req.body || {}
    const local = txt(b.local)
    const valor = nombreOk(b.valor)
    const canal = nombreOk(b.canal)
    if (!id || !local || !['metodo', 'origen'].includes(b.match) || !valor || !canal || typeof b.delivery !== 'boolean') {
      return reply.code(400).send({ error: 'Faltan datos o son inválidos (local, match, valor, canal, delivery).' })
    }
    if (canal === 'Local') return reply.code(400).send({ error: '"Local" es un canal calculado: no se le asignan reglas.' })
    if (b.match === 'origen' && !okOrigenRegla(valor)) {
      return reply.code(400).send({ error: 'Por origen de caja solo se asignan las cajas cargadas a mano (DCSMART). Las de TapTap o Fudo se asignan por método de cobro.' })
    }
    const cli = await getCli(id)
    if (!cli) return reply.code(404).send({ error: 'Cliente no encontrado' })
    if (!cli.locales.includes(local)) return reply.code(400).send({ error: 'El local no pertenece al cliente.' })
    await db.query(
      `INSERT INTO rv_regla_canal (cliente_id, local, match, valor, canal, delivery, actualizado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (cliente_id, local, match, valor)
       DO UPDATE SET canal = EXCLUDED.canal, delivery = EXCLUDED.delivery,
                     actualizado_por = EXCLUDED.actualizado_por, actualizado_at = now()`,
      [id, local, b.match, valor, canal, b.delivery, quien(req)])
    return { ok: true }
  })

  fastify.delete('/:id/regla', pre, async (req, reply) => {
    const id = idDe(req)
    const b = req.body || {}
    const local = txt(b.local)
    const valor = txt(b.valor, 80)
    if (!id || !local || !['metodo', 'origen'].includes(b.match) || !valor) return reply.code(400).send({ error: 'Faltan local, match o valor.' })
    const { rowCount } = await db.query(
      'DELETE FROM rv_regla_canal WHERE cliente_id = $1 AND local = $2 AND match = $3 AND valor = $4', [id, local, b.match, valor])
    if (!rowCount) return reply.code(404).send({ error: 'La regla no existe.' })
    return { ok: true }
  })
}
