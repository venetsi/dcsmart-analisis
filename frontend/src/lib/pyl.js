// Estructura del P&L (modelo ROA): mapeo rubro → sección, en orden.
// op:true = gasto operativo (resta del Resultado Económico).
// op:false = movimiento no operativo (tesorería, financiación, distribución) — se
// muestra abajo de la línea y NO distorsiona el resultado operativo.
const SECTIONS = [
  { key: 'cmv', corto: 'CMV', titulo: 'CMV — Costo de Mercadería Vendida', rubros: ['CMV Alimentos', 'CMV Bebidas', 'CMV MovStock', 'CMV MovStock B2B'], op: true, cmv: true },
  { key: 'alquiler', corto: 'Alquiler', titulo: 'Alquiler y Servicios', rubros: ['Fijos/Variables', 'Fijos/Variable'], op: true },
  { key: 'generales', corto: 'Generales', titulo: 'Gastos Generales', rubros: ['Publicidad', 'Descartables/Limpieza', 'Instalaciones/Otros'], op: true },
  { key: 'financieros', corto: 'Financieros', titulo: 'Costos Financieros', rubros: ['Costos Financieros', 'Comisiones por Ventas'], op: true },
  { key: 'labor', corto: 'Sueldos', titulo: 'Sueldos y Cargas', rubros: ['Sueldos'], op: true, labor: true },
  { key: 'honorarios', corto: 'Honorarios', titulo: 'Honorarios', rubros: ['Honorarios'], op: true },
  { key: 'eventos', corto: 'Eventos', titulo: 'Eventos', rubros: ['Eventos', 'Musicos'], op: true },
  { key: 'impositivos', corto: 'Impositivos', titulo: 'Impositivos', rubros: ['Impositivo'], op: true },
  { key: 'otros', corto: 'Otros', titulo: 'Otros gastos operativos', rubros: [], op: true, cajon: true },
  { key: 'tesoreria', corto: 'Tesorería', titulo: 'Movimientos de tesorería (Caja Mayor)', rubros: ['Caja Mayor', 'Local'], op: false },
  { key: 'financiacion', corto: 'Préstamos', titulo: 'Préstamos / Financiación', rubros: ['Plan de Pagos'], op: false, fin: true },
  { key: 'distribucion', corto: 'Socios', titulo: 'Socios / Dividendos', rubros: ['Socios', 'Aportes'], op: false }
]

const rubroToSection = {}
for (const s of SECTIONS) for (const r of s.rubros) rubroToSection[r] = s.key

export function buildPyl(data) {
  const ventas = data.ventas?.total || 0
  const pct = (x) => (ventas ? +(x / ventas * 100).toFixed(1) : 0)

  // agrupa las líneas de gasto por sección → categorías
  const secMap = new Map(SECTIONS.map(s => [s.key, { ...s, total: 0, fiscal: 0, efectivo: 0, lineas: [] }]))
  for (const g of data.gastos || []) {
    const key = rubroToSection[g.rubro] || 'otros'
    const s = secMap.get(key)
    s.total += g.total; s.fiscal += g.fiscal; s.efectivo += g.efectivo
    s.lineas.push(g)
  }
  for (const s of secMap.values()) s.lineas.sort((a, b) => b.total - a.total)

  const sec = (k) => secMap.get(k)
  const secciones = SECTIONS.map(s => sec(s.key)).filter(s => s.lineas.length)

  const cmv = sec('cmv').total
  const resultadoBruto = ventas - cmv
  const opSections = secciones.filter(s => s.op && !s.cmv)
  const gastosOperativos = opSections.reduce((a, s) => a + s.total, 0)
  const resultadoEconomico = resultadoBruto - gastosOperativos
  const financiacion = sec('financiacion').total
  const resultadoMes = resultadoEconomico - financiacion

  const labor = sec('labor').total
  const primeCost = cmv + labor

  return {
    ventas: data.ventas,
    pct,
    secciones,
    operativas: secciones.filter(s => s.op),
    noOperativas: secciones.filter(s => !s.op),
    totales: {
      ventas, cmv, resultadoBruto, gastosOperativos, resultadoEconomico,
      financiacion, resultadoMes,
      foodCostPct: pct(cmv), laborPct: pct(labor), primeCostPct: pct(primeCost),
      margenPct: pct(resultadoEconomico)
    }
  }
}

// Pasos para el gráfico waterfall (Ventas → −CMV → Bruto → −opex → Resultado)
export function waterfallSteps(pyl) {
  const t = pyl.totales
  const steps = [{ label: 'Ventas', tipo: 'ingreso', valor: t.ventas }]
  steps.push({ label: 'CMV', tipo: 'egreso', valor: -t.cmv })
  steps.push({ label: 'Bruto', tipo: 'subtotal', valor: t.resultadoBruto })
  for (const s of pyl.operativas.filter(s => !s.cmv)) {
    steps.push({ label: s.corto, tipo: 'egreso', valor: -s.total })
  }
  steps.push({ label: 'Resultado', tipo: 'resultado', valor: t.resultadoEconomico })
  return steps
}

// En qué se va la venta: cada sección operativa como % de las ventas, de mayor
// a menor, y al final lo que queda (el resultado económico). Si los gastos
// superan la venta, el resultado sale negativo y se marca aparte.
export function repartoVentas(pyl) {
  const filas = pyl.operativas
    .filter(s => s.total)
    .map(s => ({ key: s.key, label: s.corto, valor: s.total, pct: pyl.pct(s.total) }))
    .sort((a, b) => b.valor - a.valor)
  const r = pyl.totales.resultadoEconomico
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
