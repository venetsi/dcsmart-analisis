// Estructura del P&L (Trello #374): Ventas = el cuadro de ingresos (punto de venta, eventos, apps y las ventas
// cargadas en gestión) y los gastos agrupados por su Clasificación P&L (rubcat.clasificacion_pyl, Trello #372) ›
// Rubro › Categoría. Los totales siguen el orden que pidió el usuario:
//   Resultado Bruto = Ventas − CMV
//   EBITDA          = Resultado Bruto − Labor − Gastos Operativos (− lo que todavía no tiene clasificación)
//   EBIT            = EBITDA − Depreciaciones y Amortizaciones (clasificación creada el 25/11; sin rubros, 0)
//   RFN             = EBIT − Resultado Financiero
//   Utilidad        = RFN − Impuesto a las Ganancias
//   Remanente       = Utilidad − Capex − Retiro Socios + Aportes de Capital − Impuestos
// "No P&L" (Caja Mayor y otros movimientos de tesorería) se muestra aparte y no suma.

export const SECCIONES = [
  { key: 'CMV', titulo: 'CMV', corto: 'CMV', op: true, cmv: true },
  { key: 'Labor', titulo: 'Labor', corto: 'Labor', op: true, labor: true },
  { key: 'Gastos Operativos', titulo: 'Gastos Operativos', corto: 'Gastos op.', op: true },
  { key: 'Sin Clasificación P&L', titulo: 'Sin Clasificación P&L', corto: 'Sin clasif.', op: true, sinClasif: true },
  { key: 'Depreciaciones y Amortizaciones', titulo: 'Depreciaciones y Amortizaciones', corto: 'D&A' },
  { key: 'Resultado Financiero', titulo: 'Resultado Financiero', corto: 'Financiero' },
  { key: 'Imp. Ganancias', titulo: 'Impuesto a las Ganancias', corto: 'Ganancias' },
  { key: 'Capex', titulo: 'Capex', corto: 'Capex' },
  { key: 'Retiro Socios', titulo: 'Retiro Socios', corto: 'Retiros' },
  { key: 'Aportes de Capital', titulo: 'Aportes de Capital', corto: 'Aportes', suma: true },
  { key: 'Impuestos', titulo: 'Impuestos', corto: 'Impuestos' },
  { key: 'No P&L', titulo: 'Fuera del P&L', corto: 'No P&L', memo: true },
]
const CONOCIDAS = new Set([...SECCIONES.map((s) => s.key), 'Ventas'])

// La clasificación de un gasto: la de su rubro/categoría; sin clasificación (o una que esta pantalla no conoce),
// a "Sin Clasificación P&L", que resta igual: un gasto no se pierde por no estar clasificado.
export function claseDe(g) {
  const c = String(g.clasificacion ?? '').trim()
  return CONOCIDAS.has(c) ? c : 'Sin Clasificación P&L'
}

function acumular(lista) {
  const s = { total: 0, fiscal: 0, efectivo: 0 }
  for (const x of lista) { s.total += x.total; s.fiscal += x.fiscal; s.efectivo += x.efectivo }
  return s
}

// Ventas del P&L: las filas del cuadro de ingresos que son venta. De "Otros" (ingresos de gestión) solo entra lo
// clasificado como Ventas; las notas de crédito de proveedores ya restan en su sección de gasto.
export function ventasDelCuadro(ingresos) {
  const filas = []
  for (const f of ingresos?.filas || []) {
    if (f.clave === 'otros') {
      const v = f.hijos.find((h) => h.nombre === 'Ventas')
      if (v) filas.push({ key: 'gestion', label: 'Ventas cargadas en gestión', total: v.total, fiscal: v.fiscal, efectivo: v.efectivo })
    } else {
      filas.push({ key: f.clave, label: f.nombre, total: f.total, fiscal: f.fiscal, efectivo: f.efectivo })
    }
  }
  return filas.filter((f) => f.total)
}

export function buildPyl(data) {
  const lineasVenta = ventasDelCuadro(data.ingresos)
  // Egresos y notas de crédito clasificados como Ventas: restan de la venta (ajustes, devoluciones).
  const ajustes = (data.gastos || []).filter((g) => claseDe(g) === 'Ventas')
  const ajuste = acumular(ajustes)
  if (ajuste.total) lineasVenta.push({ key: 'ajustes', label: 'Ajustes y notas de crédito de ventas', total: -ajuste.total, fiscal: -ajuste.fiscal, efectivo: -ajuste.efectivo })
  // Sin el cuadro (respuesta vieja de la API), la venta es la de las cajas.
  const ventasSum = data.ingresos ? acumular(lineasVenta) : { total: data.ventas?.total || 0, fiscal: data.ventas?.fiscal || 0, efectivo: data.ventas?.efectivo || 0 }
  const ventas = ventasSum.total
  const pct = (x) => (ventas ? +(x / ventas * 100).toFixed(1) : 0)

  const secMap = new Map(SECCIONES.map((s) => [s.key, { ...s, total: 0, fiscal: 0, efectivo: 0, lineas: [], rubros: [] }]))
  for (const g of data.gastos || []) {
    const clase = claseDe(g)
    if (clase === 'Ventas') continue
    const s = secMap.get(clase)
    s.total += g.total; s.fiscal += g.fiscal; s.efectivo += g.efectivo
    s.lineas.push(g)
  }
  for (const s of secMap.values()) {
    s.lineas.sort((a, b) => b.total - a.total)
    const porRubro = new Map()
    for (const l of s.lineas) {
      if (!porRubro.has(l.rubro)) porRubro.set(l.rubro, { rubro: l.rubro, total: 0, fiscal: 0, efectivo: 0, categorias: [] })
      const r = porRubro.get(l.rubro)
      r.total += l.total; r.fiscal += l.fiscal; r.efectivo += l.efectivo
      r.categorias.push(l)
    }
    s.rubros = [...porRubro.values()].sort((a, b) => b.total - a.total)
  }
  const sec = (k) => secMap.get(k)
  const secciones = SECCIONES.map((s) => sec(s.key)).filter((s) => s.lineas.length)

  const cmv = sec('CMV').total
  const labor = sec('Labor').total
  const resultadoBruto = ventas - cmv
  const gastosOperativos = labor + sec('Gastos Operativos').total + sec('Sin Clasificación P&L').total
  const ebitda = resultadoBruto - gastosOperativos
  const depreciaciones = sec('Depreciaciones y Amortizaciones').total
  const ebit = ebitda - depreciaciones
  const financiero = sec('Resultado Financiero').total
  const rfn = ebit - financiero
  const ganancias = sec('Imp. Ganancias').total
  const utilidad = rfn - ganancias
  const capex = sec('Capex').total
  const retiros = sec('Retiro Socios').total
  const aportes = sec('Aportes de Capital').total
  const impuestos = sec('Impuestos').total
  const remanente = utilidad - capex - retiros + aportes - impuestos
  // Sueldos para las tarjetas (labor %, prime cost): la clasificación Labor MÁS el rubro Sueldos que esté en gastos
  // operativos o sin clasificar. En la Clasificación P&L del 24/11 casi todo Sueldos quedó en Gastos Operativos y
  // la tarjeta daba 0; la tabla sigue la clasificación tal cual.
  const sueldosOp = ['Gastos Operativos', 'Sin Clasificación P&L']
    .flatMap((k) => sec(k).lineas).filter((l) => /^sueldos$/i.test(String(l.rubro).trim()))
    .reduce((x, l) => x + l.total, 0)
  const laborKpi = labor + sueldosOp

  return {
    ventas: { ...data.ventas, total: ventas, fiscal: ventasSum.fiscal, efectivo: ventasSum.efectivo, lineas: lineasVenta },
    pct,
    secciones,
    operativas: secciones.filter((s) => s.op),
    noOperativas: secciones.filter((s) => !s.op),
    sec,
    totales: {
      ventas, cmv, labor, resultadoBruto, gastosOperativos,
      laborKpi, ebitda, depreciaciones, ebit, financiero, rfn, ganancias, utilidad,
      capex, retiros, aportes, impuestos, remanente,
      // Nombres de antes, para las tarjetas y el gráfico.
      resultadoEconomico: ebitda, resultadoMes: remanente,
      foodCostPct: pct(cmv), laborPct: pct(laborKpi), primeCostPct: pct(cmv + laborKpi),
      margenPct: pct(ebitda),
    },
  }
}

// Pasos para el gráfico waterfall (Ventas → −CMV → Bruto → −Labor → −Gastos op. → EBITDA)
export function waterfallSteps(pyl) {
  const t = pyl.totales
  const steps = [{ label: 'Ventas', tipo: 'ingreso', valor: t.ventas }]
  steps.push({ label: 'CMV', tipo: 'egreso', valor: -t.cmv })
  steps.push({ label: 'Bruto', tipo: 'subtotal', valor: t.resultadoBruto })
  for (const s of pyl.operativas.filter((s) => !s.cmv)) {
    steps.push({ label: s.corto, tipo: 'egreso', valor: -s.total })
  }
  steps.push({ label: 'EBITDA', tipo: 'resultado', valor: t.ebitda })
  return steps
}

// En qué se va la venta: cada sección operativa como % de las ventas, de mayor a menor, y al final lo que queda
// (el EBITDA). Si los gastos superan la venta, el resultado sale negativo y se marca aparte.
export function repartoVentas(pyl) {
  const filas = pyl.operativas
    .filter((s) => s.total)
    .map((s) => ({ key: s.key, label: s.corto, valor: s.total, pct: pyl.pct(s.total) }))
    .sort((a, b) => b.valor - a.valor)
  const r = pyl.totales.ebitda
  return { filas, resultado: { valor: r, pct: pyl.pct(r) } }
}

// Variación porcentual contra otro período; null si no hay base para comparar.
export function variacion(actual, anterior) {
  if (!anterior || actual == null) return null
  return +((actual - anterior) / Math.abs(anterior) * 100).toFixed(1)
}

// '2026-09' -> '2026-08' (y enero pasa al diciembre anterior).
export function mesAnterior(mes) {
  const [y, m] = mes.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
