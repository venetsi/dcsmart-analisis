// Motor del Reporte de Ventas Mensuales (P&L por tipo de comprobante).
// No depende de React ni del DOM: lógica pura, testeable con node:test.

// Mapeo tipo de comprobante -> columna. SOLO los confirmados por el usuario.
// Cualquier tipo ausente cae en "sin asignar" (visible), no se adivina.
// Col 1 = bancarizado/blanco/facturado. Col 2 = efectivo/sin factura.
// OJO: los valores REALES en vw_pagos.tipo son strings de display
// ("DC (1)", "DC (2)"), no el enum de gestión. Verificado contra BigQuery.
export const MAPEO_TIPOS = {
  'A': 1, 'C': 1, 'NCA': 1, 'DC (1)': 1,
  'B': 2, 'NCB': 2, 'DC (2)': 2, 'STK': 2,
  // PENDIENTE VALIDAR (bajo volumen, hoy caen en "sin asignar"):
  // 'CM','X','M','NDA','DDJJ','FF','LF','ND', y NULL/''.
}

export function columnaDeTipo(tipo) {
  return MAPEO_TIPOS[tipo] ?? null
}

// Rubros que se cargan a mano: se EXCLUYEN del agregado automático de pagos
// para no contarlos dos veces (el manual manda).
export const RUBROS_EXCLUIDOS_AUTO = ['Impositivo', 'Plan de Pagos', 'Socios', 'Aportes']

// Estructura de secciones del P&L (orden de presentación).
// manual:true => sección alimentada solo por la capa manual.
// op:true     => gasto operativo (resta del resultado económico).
// belowLine   => se muestra debajo del resultado económico (no opera).
export const SECCIONES = [
  { key: 'cmv',          titulo: 'CMV — Costo Mercadería Vendida', rubros: ['CMV Alimentos','CMV Bebidas','CMV MovStock','CMV MovStock B2B'], op: true, cmv: true },
  { key: 'alquiler',     titulo: 'Alquiler y Servicios',           rubros: ['Fijos/Variables','Fijos/Variable'], op: true },
  { key: 'generales',    titulo: 'Gastos Generales',               rubros: ['Publicidad','Descartables/Limpieza','Instalaciones/Otros'], op: true },
  { key: 'financieros',  titulo: 'Costos Financieros',             rubros: ['Costos Financieros','Comisiones por Ventas'], op: true, fin: true },
  { key: 'labor',        titulo: 'Sueldos y Cargas',               rubros: ['Sueldos'], op: true, labor: true },
  { key: 'honorarios',   titulo: 'Honorarios',                     rubros: ['Honorarios'], op: true },
  { key: 'eventos',      titulo: 'Eventos',                        rubros: ['Eventos','Musicos'], op: true },
  { key: 'otros',        titulo: 'Otros gastos operativos',        rubros: [], op: true, cajon: true },
  { key: 'impositivos',  titulo: 'Impositivos (AFIP/ARCA)',        rubros: [], op: true, manual: true },
  { key: 'pasivo',       titulo: 'Pasivo / Plan de pagos',         rubros: [], manual: true, belowLine: true },
  { key: 'socios',       titulo: 'Socios',                          rubros: [], manual: true, belowLine: true },
]

const rubroToSection = {}
for (const s of SECCIONES) for (const r of s.rubros) rubroToSection[r] = s.key

function nuevaLineaMap() { return new Map() }
function addLinea(map, concepto, col, monto) {
  const cur = map.get(concepto) || { concepto, total: 0, col1: 0, col2: 0 }
  if (col === 1) cur.col1 += monto
  else if (col === 2) cur.col2 += monto
  cur.total += monto
  map.set(concepto, cur)
}

export function buildReporte({ ventas, gastos = [], manuales = [] }) {
  const acc = {}
  for (const s of SECCIONES) acc[s.key] = nuevaLineaMap()
  const sinAsignar = { total: 0, col1: 0, col2: 0, tipos: new Set() }

  // 1) Gastos automáticos por rubro/categoria/tipo.
  for (const g of gastos) {
    if (RUBROS_EXCLUIDOS_AUTO.includes(g.rubro)) continue
    const key = rubroToSection[g.rubro] || 'otros'
    const col = columnaDeTipo(g.tipo)
    const total = Number(g.total || 0) // drivers Postgres pueden traer NUMERIC como string
    if (col === null) {
      sinAsignar.total += total
      sinAsignar.tipos.add(g.tipo || '(vacío)')
      addLinea(acc[key], `${g.categoria} · tipo ${g.tipo || '?'} (sin asignar)`, 0, total)
      continue
    }
    addLinea(acc[key], g.categoria || g.rubro, col, total)
  }

  // 2) Capa manual.
  // Si m.seccion no matchea ninguna key de SECCIONES (typo, mayúscula, etc.)
  // NO crear un Map huérfano que nunca se lee (se perdería en silencio):
  // se acumula en manualesSinUbicar, visible en el resultado.
  const manualesSinUbicar = []
  for (const m of manuales) {
    if (!acc[m.seccion]) {
      manualesSinUbicar.push({
        seccion: m.seccion,
        concepto: m.concepto,
        monto: Number(m.monto || 0),
        columna: Number(m.columna),
      })
      continue
    }
    addLinea(acc[m.seccion], m.concepto, Number(m.columna), Number(m.monto || 0))
  }

  // 3) Armar secciones con totales.
  const secciones = SECCIONES.map(s => {
    const lineas = [...acc[s.key].values()]
    const total = lineas.reduce((a, l) => a + l.total, 0)
    const col1 = lineas.reduce((a, l) => a + l.col1, 0)
    const col2 = lineas.reduce((a, l) => a + l.col2, 0)
    return { ...s, lineas, total, col1, col2 }
  })

  const byKey = Object.fromEntries(secciones.map(s => [s.key, s]))
  const ventasTotal = Number(ventas?.total || 0)
  const cmv = byKey.cmv?.total || 0                          // positivo (gasto)
  const resultadoBruto = ventasTotal - cmv
  const gastosOperativos = secciones
    .filter(s => s.op && s.key !== 'cmv')
    .reduce((a, s) => a + s.total, 0)                         // positivo
  const resultadoEconomico = resultadoBruto - gastosOperativos
  const belowLine = secciones.filter(s => s.belowLine).reduce((a, s) => a + s.total, 0)  // positivo
  const resultadoMes = resultadoEconomico - belowLine
  const labor = byKey.labor?.total || 0
  const foodCostPct = ventasTotal ? cmv / ventasTotal * 100 : 0
  const primeCostPct = ventasTotal ? (cmv + labor) / ventasTotal * 100 : 0

  return {
    secciones,
    totales: {
      ventas: ventasTotal, cmv, resultadoBruto, gastosOperativos,
      resultadoEconomico, resultadoMes, foodCostPct, primeCostPct,
    },
    sinAsignar: { ...sinAsignar, tipos: [...sinAsignar.tipos] },
    manualesSinUbicar,
  }
}
