// Costo impositivo de un mes o un rango de fechas (IVA a pagar, IIBB a pagar e
// impuestos internos) por local.
//
// Los impuestos de cada factura (tabla `impuestos`) no están en BigQuery: se
// leen de la base de gestión con el pool de SOLO LECTURA. La alícuota de IIBB y
// si el local entra en el reporte se guardan en la base propia (ci_local; ver
// infra/00h_costo_impositivo.sql). Las cuentas viven en lib/costoImpositivo.js.
//
// Fechas: las cajas por fecha de inicio. Las facturas, en un mes, por período (o
// por fecha si no tienen) y, en un rango, por fecha de factura (ver
// periodoConsulta en lib/costoImpositivo.js).

import { TIPOS, calcularLocal, totalizar, alicuotaOk, periodoConsulta } from '../lib/costoImpositivo.js'
import { esInterno } from '../lib/reporteVentas.js'

// Lo que trae cada factura, sumado por tipo de impuesto.
const IMPUESTOS_POR_PAGO = `
  LEFT JOIN LATERAL (
    SELECT sum(monto) FILTER (WHERE tipo::text IN ('IVA21', 'IVA10', 'IVA27')) AS iva,
           sum(monto) FILTER (WHERE tipo::text = 'PERC_IVA')     AS perc_iva,
           sum(monto) FILTER (WHERE tipo::text = 'PERC_IIBB')    AS perc_iibb,
           sum(monto) FILTER (WHERE tipo::text = 'IMP_INTERNOS') AS internos,
           sum(monto) FILTER (WHERE tipo::text = 'PERCEPCION')   AS perc_vieja,
           sum(monto) FILTER (WHERE tipo::text = 'RETENCION')    AS retencion
      FROM impuestos WHERE id_pago = p.id
  ) t ON true`

// Qué fecha de la factura manda (whitelist: nunca entra texto del pedido al SQL).
const COLUMNA_FECHA = { periodo: 'coalesce(p.periodo, p.fecha)', fecha: 'p.fecha' }
const filtroFacturas = (campo) => {
  const col = COLUMNA_FECHA[campo]
  return `p.id_tipo::text = ANY($2::text[]) AND ${col} >= $3::date AND ${col} < $4::date`
}

// Lo que el frontend necesita para rotular el período.
const describir = (per) => (per.modo === 'mes'
  ? { modo: 'mes', mes: per.mes }
  : { modo: 'rango', desde: per.desde, hasta: per.hastaIncl })

const num = (v) => (v === null || v === undefined ? 0 : Number(v))

export default async function (fastify) {
  const ro = fastify.gestionLectura
  const db = fastify.analyticsDb

  // GET /api/costo-impositivo?grupo=&mes=YYYY-MM  |  ?grupo=&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const per = periodoConsulta(req.query)
    const grupo = typeof req.query.grupo === 'string' ? req.query.grupo.trim() : ''
    if (!grupo) return reply.code(400).send({ error: 'Elegí el grupo.' })
    if (per.error) return reply.code(400).send({ error: per.error })
    const { desde, hasta } = per
    const periodo = describir(per)

    const { rows: locales } = await ro.query(
      `SELECT l.id, l.nombre, l.activo FROM locales l JOIN apps a ON a.id = l.id_app
        WHERE a.nombre = $1 ORDER BY l.nombre`, [grupo])
    if (!locales.length) return { periodo, grupo, locales: [], total: totalizar([]) }
    const ids = locales.map((l) => l.id)

    const [cajas, facturas, config] = await Promise.all([
      ro.query(
        `SELECT id_local, sum(fiscal) AS z, count(*)::int AS cajas FROM cajas
          WHERE id_local = ANY($1::text[]) AND fecha_inicio >= $2::date AND fecha_inicio < $3::date
          GROUP BY 1`, [ids, desde, hasta]),
      ro.query(
        `SELECT p.id_local, p.ingresa_egreso, count(*)::int AS facturas, sum(p.importe_neto) AS neto,
                sum(t.iva) AS iva, sum(t.perc_iva) AS perc_iva, sum(t.perc_iibb) AS perc_iibb,
                sum(t.internos) AS internos, sum(t.perc_vieja) AS perc_vieja, sum(t.retencion) AS retencion
           FROM pagos p ${IMPUESTOS_POR_PAGO}
          WHERE p.id_local = ANY($1::text[]) AND ${filtroFacturas(per.campoFactura)}
          GROUP BY 1, 2`, [ids, TIPOS, desde, hasta]),
      db.query('SELECT id_local, alicuota_iibb, incluir FROM ci_local WHERE id_local = ANY($1::text[])', [ids])
    ])

    const zPor = new Map(cajas.rows.map((r) => [r.id_local, r]))
    const cfgPor = new Map(config.rows.map((r) => [r.id_local, r]))
    const lado = (idLocal, ingreso) => {
      const r = facturas.rows.find((f) => f.id_local === idLocal && f.ingresa_egreso === ingreso)
      if (!r) return {}
      return {
        facturas: r.facturas, neto: num(r.neto), iva: num(r.iva), percIva: num(r.perc_iva), percIibb: num(r.perc_iibb),
        internos: num(r.internos), percVieja: num(r.perc_vieja), retencion: num(r.retencion)
      }
    }

    const filas = locales.map((l) => {
      const cfg = cfgPor.get(l.id)
      const alicuota = cfg?.alicuota_iibb === null || cfg?.alicuota_iibb === undefined ? null : Number(cfg.alicuota_iibb)
      const caja = zPor.get(l.id)
      return {
        id: l.id,
        nombre: l.nombre,
        activo: l.activo,
        incluir: cfg ? cfg.incluir : true,
        cajas: caja?.cajas || 0,
        calculo: calcularLocal({ z: num(caja?.z), ingresos: lado(l.id, true), egresos: lado(l.id, false), alicuota })
      }
    })
      // Locales dados de baja sin movimiento en el mes: no suman nada y solo confunden.
      .filter((f) => f.activo || f.cajas || f.calculo.facturas)

    return { periodo, grupo, locales: filas, total: totalizar(filas) }
  })

  // GET /api/costo-impositivo/facturas?id_local=&mes= (o &desde=&hasta=) — las facturas que entran en la cuenta.
  fastify.get('/facturas', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const per = periodoConsulta(req.query)
    const idLocal = typeof req.query.id_local === 'string' ? req.query.id_local : ''
    if (!idLocal) return reply.code(400).send({ error: 'Falta el local.' })
    if (per.error) return reply.code(400).send({ error: per.error })
    const { desde, hasta } = per
    const { rows } = await ro.query(
      `SELECT p.id, to_char(p.fecha, 'YYYY-MM-DD') AS fecha,
              to_char(coalesce(p.periodo, p.fecha), 'YYYY-MM') AS periodo, p.id_tipo::text AS tipo, p.pv, p.nro::text AS nro,
              p.ingresa_egreso, coalesce(pr.nombre, pr.razon_social) AS proveedor, p.importe_neto AS neto,
              t.iva, t.perc_iva, t.perc_iibb, t.internos, t.perc_vieja, t.retencion
         FROM pagos p ${IMPUESTOS_POR_PAGO}
         LEFT JOIN proveedores pr ON pr.id = p.id_proveedor
        WHERE p.id_local = $1 AND ${filtroFacturas(per.campoFactura)}
        ORDER BY p.ingresa_egreso DESC, p.fecha, p.nro
        LIMIT 2000`, [idLocal, TIPOS, desde, hasta])
    return rows.map((r) => ({
      id: r.id, fecha: r.fecha, periodo: r.periodo, tipo: r.tipo, pv: r.pv, nro: r.nro,
      sentido: r.ingresa_egreso ? 'INGRESO' : 'EGRESO', proveedor: r.proveedor,
      neto: num(r.neto), iva: num(r.iva), percIva: num(r.perc_iva), percIibb: num(r.perc_iibb),
      internos: num(r.internos), percVieja: num(r.perc_vieja), retencion: num(r.retencion)
    }))
  })

  // PUT /api/costo-impositivo/local { id_local, alicuota, incluir } — solo el equipo DC.
  fastify.put('/local', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    if (!esInterno(req.user)) return reply.code(403).send({ error: 'Solo el equipo DC puede cambiar la alícuota.' })
    const { id_local: idLocal, alicuota, incluir } = req.body || {}
    const alic = alicuotaOk(alicuota)
    if (typeof idLocal !== 'string' || !idLocal) return reply.code(400).send({ error: 'Falta el local.' })
    if (alic === undefined) return reply.code(400).send({ error: 'La alícuota tiene que ser un porcentaje entre 0 y 20.' })
    if (typeof incluir !== 'boolean') return reply.code(400).send({ error: 'Falta indicar si el local entra en el reporte.' })
    const { rows } = await ro.query('SELECT 1 FROM locales WHERE id = $1', [idLocal])
    if (!rows.length) return reply.code(404).send({ error: 'Ese local no existe en gestión.' })
    const quien = req.user.email || req.user.nombre || String(req.user.id)
    await db.query(
      `INSERT INTO ci_local (id_local, alicuota_iibb, incluir, actualizado_por, actualizado_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (id_local) DO UPDATE SET alicuota_iibb = $2, incluir = $3, actualizado_por = $4, actualizado_at = now()`,
      [idLocal, alic, incluir, quien])
    return { ok: true, id_local: idLocal, alicuota: alic, incluir }
  })
}
