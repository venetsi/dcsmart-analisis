// Estructura del P&L (modelo ROA): mapeo rubro → sección, en orden.
// op:true = gasto operativo (resta del Resultado Económico).
// op:false = movimiento no operativo (tesorería, financiación, distribución) — se
// muestra abajo de la línea y NO distorsiona el resultado operativo.
const SECTIONS = [
  { key: 'cmv', titulo: 'CMV — Costo de Mercadería Vendida', rubros: ['CMV Alimentos', 'CMV Bebidas', 'CMV MovStock', 'CMV MovStock B2B'], op: true, cmv: true },
  { key: 'alquiler', titulo: 'Alquiler y Servicios', rubros: ['Fijos/Variables', 'Fijos/Variable'], op: true },
  { key: 'generales', titulo: 'Gastos Generales', rubros: ['Publicidad', 'Descartables/Limpieza', 'Instalaciones/Otros'], op: true },
  { key: 'financieros', titulo: 'Costos Financieros', rubros: ['Costos Financieros', 'Comisiones por Ventas'], op: true },
  { key: 'labor', titulo: 'Sueldos y Cargas', rubros: ['Sueldos'], op: true, labor: true },
  { key: 'honorarios', titulo: 'Honorarios', rubros: ['Honorarios'], op: true },
  { key: 'eventos', titulo: 'Eventos', rubros: ['Eventos', 'Musicos'], op: true },
  { key: 'impositivos', titulo: 'Impositivos', rubros: ['Impositivo'], op: true },
  { key: 'otros', titulo: 'Otros gastos operativos', rubros: [], op: true, cajon: true },
  { key: 'tesoreria', titulo: 'Movimientos de tesorería (Caja Mayor)', rubros: ['Caja Mayor', 'Local'], op: false },
  { key: 'financiacion', titulo: 'Préstamos / Financiación', rubros: ['Plan de Pagos'], op: false, fin: true },
  { key: 'distribucion', titulo: 'Socios / Dividendos', rubros: ['Socios', 'Aportes'], op: false }
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
  steps.push({ label: 'Result. Bruto', tipo: 'subtotal', valor: t.resultadoBruto })
  for (const s of pyl.operativas.filter(s => !s.cmv)) {
    steps.push({ label: s.titulo.split(' ')[0].replace('—', ''), tipo: 'egreso', valor: -s.total })
  }
  steps.push({ label: 'Result. Econ.', tipo: 'resultado', valor: t.resultadoEconomico })
  return steps
}
