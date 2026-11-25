// Trello #374: el cuadro "Total ingresos". ESPEJO de gestión 2.0 (dcsmart2: apps/gestion/backend/src/lib/totalIngresos.js,
// la pestaña Reportes › Ingresos): la misma cuenta en los dos lados. Si se cambia una, se cambia la otra.
//
// Filas (aprobadas por el usuario sobre la maqueta del 24/11/2026):
//   - Punto de venta: las cajas, sin las de turno Evento y sin lo cobrado por apps.
//   - Eventos: separado por dónde se cargó: cajas de turno Evento y cobros de gestión
//     con rubro o categoría Evento/Eventos.
//   - Aplicaciones: lo cobrado por Rappi, PedidosYa, MP Delivery y Uber Eats dentro de
//     las cajas, una sub-fila por app. Misma regla que el Reporte de Ventas de Analytics
//     (que además reconoce "Online Rappi" y "Pedido Ya", como escribe Fudo).
//   - Otros: el resto de los ingresos cargados en gestión, agrupados por la
//     Clasificación P&L de su rubro/categoría (Trello #372).
// Columnas: Total, Digital (= total − efectivo), Efectivo, Fiscal % y Avión % (= lo que
// no es fiscal).
//   - Fiscal en cajas: el Z. Las apps cuentan 100 % fiscal y se descuentan del Z de su
//     caja: la caja no dice qué parte del Z es de cada app.
//   - Fiscal en gestión: comprobante fiscal (A, B, C, M y sus notas de crédito/débito)
//     o cobro que no fue en efectivo.

export const ES_APP_CANAL = /^(online\s+)?(rappi|pedidos?\s*ya|peya|mp\s*delivery|uber\s*eats)(\s+efectivo)?$/i
const APP_EN_EFECTIVO = /\s+efectivo$/i
const TIPOS_FISCALES = new Set(['A', 'B', 'C', 'M', 'NCA', 'NCB', 'NCC', 'NDA', 'ND', 'NDC'])
const ES_EVENTO = /^eventos?$/i

export function nombreApp(metodo) {
  const base = String(metodo).trim().replace(/^online\s+/i, '').replace(APP_EN_EFECTIVO, '').toLowerCase().replace(/\s+/g, '')
  if (base === 'rappi') return 'Rappi'
  if (base === 'pedidosya' || base === 'pedidoya' || base === 'peya') return 'PedidosYa'
  if (base === 'mpdelivery') return 'MP Delivery'
  if (base === 'ubereats') return 'Uber Eats'
  return String(metodo).trim()
}

const n = (v) => {
  const x = Number(v ?? 0)
  return Number.isFinite(x) ? x : 0
}

function acumulador(nombre) {
  return { nombre, total: 0, efectivo: 0, fiscal: 0, cantidad: 0 }
}

function sumar(acc, { total, efectivo, fiscal }, cantidad = 1) {
  acc.total += total
  acc.efectivo += efectivo
  acc.fiscal += fiscal
  acc.cantidad += cantidad
}

// Redondeo a centavos y columnas derivadas. Sin total, los % van en null (la pantalla
// muestra un guion): un 0 % diría "nada fiscal" cuando no hay nada que medir.
function cerrar(acc, extra = {}) {
  const r = (x) => Math.round(x * 100) / 100
  const total = r(acc.total)
  const efectivo = r(acc.efectivo)
  const fiscal = r(acc.fiscal)
  const pct = (x) => (total !== 0 ? Math.round((x / total) * 1000) / 10 : null)
  return {
    nombre: acc.nombre,
    total,
    digital: r(total - efectivo),
    efectivo,
    fiscal,
    avion: r(total - fiscal),
    pct_fiscal: pct(fiscal),
    pct_avion: total !== 0 ? Math.round((1000 - (fiscal / total) * 1000)) / 10 : null,
    cantidad: acc.cantidad,
    ...extra,
  }
}

// cajas:  [{ id, tipo_turno, total, efectivo, fiscal }]
// cobros: [{ id_caja, nombre, monto }]  -- detalles tipo 'cobro' de esas cajas
// partes: [{ importe, id_tipo, metodo, rubro, categoria, clasificacion_pyl }]  -- ingresos de
//         gestión, ya partidos por reparto de rubro/categoría (una parte por rubro).
// conGestion: false cuando el reporte está filtrado por turno (los pagos no tienen turno).
export function armarTotalIngresos({ cajas = [], cobros = [], partes = [], conGestion = true }) {
  const appsPorCaja = new Map()
  const apps = new Map()
  for (const c of cobros) {
    const nombre = String(c.nombre ?? '').trim()
    if (!ES_APP_CANAL.test(nombre)) continue
    const monto = n(c.monto)
    const enEfectivo = APP_EN_EFECTIVO.test(nombre) ? monto : 0
    const porCaja = appsPorCaja.get(c.id_caja) ?? { total: 0, efectivo: 0 }
    porCaja.total += monto
    porCaja.efectivo += enEfectivo
    appsPorCaja.set(c.id_caja, porCaja)
    const app = nombreApp(nombre)
    if (!apps.has(app)) apps.set(app, acumulador(app))
    sumar(apps.get(app), { total: monto, efectivo: enEfectivo, fiscal: monto })
  }

  const puntoVenta = acumulador('Punto de venta')
  const eventosCaja = acumulador('En caja (turno Evento)')
  for (const c of cajas) {
    const app = appsPorCaja.get(c.id) ?? { total: 0, efectivo: 0 }
    const fila = String(c.tipo_turno ?? '').trim().toLowerCase() === 'evento' ? eventosCaja : puntoVenta
    sumar(fila, {
      total: n(c.total) - app.total,
      efectivo: Math.max(0, n(c.efectivo) - app.efectivo),
      fiscal: Math.max(0, n(c.fiscal) - app.total),
    })
  }
  // Las apps se cuentan por caja, no por cobro: una caja con Rappi y PedidosYa es una.
  const appsCantidad = appsPorCaja.size

  const eventosGestion = acumulador('En gestión (rubro Eventos)')
  const otros = new Map()
  for (const p of partes) {
    const importe = n(p.importe)
    const efectivo = /^efectivo$/i.test(String(p.metodo ?? '').trim()) ? importe : 0
    const fiscal = TIPOS_FISCALES.has(p.id_tipo) || efectivo === 0 ? importe : 0
    const montos = { total: importe, efectivo, fiscal }
    if (ES_EVENTO.test(String(p.rubro ?? '').trim()) || ES_EVENTO.test(String(p.categoria ?? '').trim())) {
      sumar(eventosGestion, montos)
      continue
    }
    const clase = String(p.clasificacion_pyl ?? '').trim() || 'Sin Clasificación P&L'
    if (!otros.has(clase)) otros.set(clase, acumulador(clase))
    sumar(otros.get(clase), montos)
  }

  const grupo = (nombre, clave, hijos) => {
    const acc = acumulador(nombre)
    for (const h of hijos) sumar(acc, h, h.cantidad)
    return cerrar(acc, { clave, hijos: hijos.map((h) => cerrar(h)) })
  }
  const porTotal = (a, b) => b.total - a.total

  const filas = [
    cerrar(puntoVenta, { clave: 'punto_venta', hijos: [] }),
    grupo('Eventos', 'eventos', conGestion ? [eventosCaja, eventosGestion] : [eventosCaja]),
    { ...grupo('Aplicaciones', 'aplicaciones', [...apps.values()].sort(porTotal)), cantidad: appsCantidad },
    grupo('Otros', 'otros', [...otros.values()].sort(porTotal)),
  ]

  const total = acumulador('Total')
  for (const f of filas) sumar(total, f, 0)
  return { filas, total: cerrar(total), con_gestion: conGestion }
}
