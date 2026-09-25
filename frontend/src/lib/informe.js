// Motor del Informe Mensual: detalle del P&L, resumen, indicadores y acumulado.
// Lógica pura (sin React ni DOM), testeable con node:test.
//
// Reproduce las planillas que se arman a mano para cada local:
//   - el DETALLE ("LORETO GARDEN BAR SOCIEDAD SIMPLE - 08-26"): secciones
//     numeradas, una línea por categoría, columnas Total / 1 / 2 con su %;
//   - el RESUMEN ("P&L acumulado"): ventas, indicadores, CMV abierto en
//     alimentos/bebidas/mov. de stock, egresos por sección, EERR y RF.
// Todo sale de los mismos números, así el resumen y la presentación no pueden
// contradecir al detalle (en el informe de Loreto de agosto hecho a mano,
// Cargas Sociales y Sindicato estaban cruzados y los dividendos no coincidían).
//
// Columna 1 = bancarizado / facturado. Columna 2 = efectivo / sin factura.

// ── Estructura ───────────────────────────────────────────────────────────────

// `resumen`: renglón del resumen donde suma la sección. `bajoLinea`: va
// después del resultado económico (no es gasto operativo).
export const SECCIONES = [
  { key: 'ventas',          num: '1',    titulo: 'Ventas',                      bloque: 'Ingresos' },
  { key: 'cmv',             num: '2',    titulo: 'CMV (Costo Mercadería Vendida)', bloque: 'CMV' },
  { key: 'alquiler',        num: '4.1',  titulo: 'Alquiler y Servicios',        bloque: '4- Costos Fijos - Variables', resumen: 'fijos' },
  { key: 'publicidad',      num: '5.1',  titulo: 'Publicidad',                  bloque: '5- Gastos Generales', resumen: 'publicidad' },
  { key: 'descartables',    num: '5.2',  titulo: 'Descartables // Limpieza',    bloque: '5- Gastos Generales', resumen: 'descartables' },
  { key: 'instalaciones',   num: '5.3',  titulo: 'Instalaciones // Otros',      bloque: '5- Gastos Generales', resumen: 'instalaciones' },
  { key: 'representacion',  num: '5.4',  titulo: 'Gastos de Representación',    bloque: '5- Gastos Generales', resumen: 'representacion' },
  { key: 'financieros',     num: '6',    titulo: 'Costos Financieros',          bloque: '6- Costos Financieros', resumen: 'financieros' },
  { key: 'sueldos',         num: '7.1',  titulo: 'Sueldos - CCSS y Sindicato',  bloque: '7- Sueldos y Honorarios', resumen: 'labor' },
  { key: 'sueldos_socios',  num: '7.2',  titulo: 'Sueldos Socios',              bloque: '7- Sueldos y Honorarios', resumen: 'labor' },
  { key: 'desvinculaciones', num: '7.3', titulo: 'Desvinculaciones',            bloque: '7- Sueldos y Honorarios', resumen: 'desvinculaciones' },
  { key: 'honorarios',      num: '7.4',  titulo: 'Honorarios',                  bloque: '7- Sueldos y Honorarios', resumen: 'honorarios' },
  { key: 'otros',           num: '8',    titulo: 'Otros gastos (sin clasificar)', bloque: '8- Otros', resumen: 'otros' },
  { key: 'eventos',         num: '9',    titulo: 'Eventos',                     bloque: '9- Eventos', resumen: 'eventos' },
  { key: 'impositivos',     num: '10',   titulo: 'Impositivos',                 bloque: '10- Impositivos', resumen: 'impositivos' },
  { key: 'pasivo',          num: '12.1', titulo: 'Pasivo (plan de pagos)',      bloque: '12- Pasivo', bajoLinea: true },
  { key: 'dividendos',      num: '12.3', titulo: 'Dividendos Pagados',          bloque: '12- Pasivo', bajoLinea: true },
]
export const SECCION = Object.fromEntries(SECCIONES.map((s) => [s.key, s]))

// Movimientos de fondos, no gastos: no entran al P&L. Se listan aparte para
// que se vea qué quedó afuera y se pueda meter si hace falta.
export const EXCLUIDO = 'excluido'

// Renglones de egresos del resumen, en el orden de la planilla.
export const EGRESOS_RESUMEN = [
  ['fijos', 'Fijos & Variables'],
  ['publicidad', 'Publicidad'],
  ['representacion', 'Gastos de Representación'],
  ['descartables', 'Descartables / Limpieza'],
  ['instalaciones', 'Instalaciones // Otros'],
  ['financieros', 'Costos Financieros'],
  ['labor', 'Labor'],
  ['desvinculaciones', 'Desvinculaciones'],
  ['honorarios', 'Honorarios'],
  ['eventos', 'Eventos'],
  ['impositivos', 'Impositivos'],
  ['otros', 'Otros (sin clasificar)'],
]

// ── De gestión a la planilla ─────────────────────────────────────────────────

// Tipo de comprobante -> columna. Los valores son los de vw_pagos.tipo
// (strings de display: "DC (1)", no el enum). CM es Caja Mayor: plata en mano.
export const COLUMNA_POR_TIPO = {
  'A': 1, 'C': 1, 'M': 1, 'NCA': 1, 'NDA': 1, 'DC (1)': 1, 'DDJJ': 1,
  'B': 2, 'NCB': 2, 'DC (2)': 2, 'STK': 2, 'CM': 2, 'X': 2,
}
export const columnaDeTipo = (tipo) => COLUMNA_POR_TIPO[tipo] ?? null

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Sección por defecto de un rubro/categoría de gestión. Una regla guardada
// (informe_reglas) la pisa. Salió de comparar los pagos de Loreto de agosto
// contra la planilla hecha a mano.
export function seccionPorDefecto(rubro, categoria) {
  const r = norm(rubro)
  const c = norm(categoria)
  if (r.startsWith('cmv')) return 'cmv'
  if (/^fijos\s*\/\s*variables?$/.test(r)) return 'alquiler'
  if (r === 'publicidad') return 'publicidad'
  if (r.startsWith('descartables')) return 'descartables'
  if (r.startsWith('instalaciones')) return 'instalaciones'
  if (r.includes('representacion')) return 'representacion'
  if (r === 'costos financieros' || r.startsWith('comisiones')) return 'financieros'
  if (r === 'sueldos') return /liquidacion|desvincul|indemniz|despido/.test(c) ? 'desvinculaciones' : 'sueldos'
  // En gestión hay sueldos de empleados cargados bajo el rubro Socios (Loreto:
  // Socios / Sueldos = la línea Sueldos de la planilla). Lo demás de Socios es
  // retiro de los socios: dividendos.
  if (r === 'socios') return c.includes('sueldo') ? 'sueldos' : 'dividendos'
  if (r === 'honorarios') return 'honorarios'
  if (r === 'eventos' || r === 'musicos') return 'eventos'
  if (r.startsWith('impositivo')) return 'impositivos'
  if (r === 'plan de pagos') return 'pasivo'
  if (['caja mayor', 'local', 'aportes'].includes(r)) return EXCLUIDO
  return 'otros'
}

// Para el resumen, el CMV se abre por rubro.
export function subCmv(rubro) {
  const r = norm(rubro)
  if (r.includes('movstock') || r.includes('mov. de stock') || r.includes('mov stock')) return 'movstock'
  if (r.includes('bebida')) return 'bebidas'
  return 'alimentos'
}

// ── Números ──────────────────────────────────────────────────────────────────

const n = (v) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}
export const pct = (valor, base) => (base ? (valor / base) * 100 : 0)
const suma = (a, b) => ({ total: a.total + b.total, col1: a.col1 + b.col1, col2: a.col2 + b.col2 })
const cero = () => ({ total: 0, col1: 0, col2: 0 })
const resta = (a, b) => ({ total: a.total - b.total, col1: a.col1 - b.col1, col2: a.col2 - b.col2 })
export const claveLinea = (seccion, concepto) => `${seccion}|${norm(concepto)}`

// ── Construcción ─────────────────────────────────────────────────────────────

// auto:    lo que viene de gestión (ver GET /api/informe).
// reglas:  [{ rubro, categoria, seccion, concepto }] del grupo.
// datos:   lo ajustado a mano: { ajustes: { [clave]: { col1?, col2?, oculto? } },
//          manuales: [{ id, seccion, concepto, col1, col2, sub? }], pax?, dias? }
export function construirInforme({ auto = {}, reglas = [], datos = {} } = {}) {
  const ajustes = datos.ajustes || {}
  const manuales = datos.manuales || []
  const reglaDe = new Map(reglas.map((r) => [`${norm(r.rubro)}|${norm(r.categoria)}`, r]))

  // 1) Líneas automáticas, agrupadas por (sección, concepto): la misma
  //    categoría puede venir de dos rubros (Bebidas sin alcohol está en CMV
  //    Alimentos y en CMV Bebidas) y en la planilla es un solo renglón.
  const lineas = new Map()
  const excluidos = []
  const tiposSinClasificar = new Map()
  const agregar = (seccion, concepto, col, monto, extra = {}) => {
    const k = claveLinea(seccion, concepto)
    const l = lineas.get(k) || { clave: k, seccion, concepto, auto: cero(), rubros: new Set(), sub: extra.sub, origen: 'auto' }
    l.auto.total += monto
    if (col === 2) l.auto.col2 += monto
    else l.auto.col1 += monto
    if (extra.rubro) l.rubros.add(`${extra.rubro} / ${extra.categoria}`)
    lineas.set(k, l)
  }

  const v = auto.ventas || {}
  const ventasTotal = n(v.total)
  const ventasEfectivo = n(v.efectivo)
  if (ventasTotal || ventasEfectivo) {
    const k = claveLinea('ventas', 'Local')
    lineas.set(k, {
      clave: k, seccion: 'ventas', concepto: 'Local', origen: 'auto', rubros: new Set(['Cajas del mes']),
      // La columna 2 de ventas es el efectivo de las cajas; la 1, el resto.
      // Loreto 08-26: 27.406.497 y 43.072.737, igual que la planilla.
      auto: { total: ventasTotal, col1: ventasTotal - ventasEfectivo, col2: ventasEfectivo },
    })
  }

  for (const g of auto.gastos || []) {
    const monto = n(g.total)
    if (!monto) continue
    const regla = reglaDe.get(`${norm(g.rubro)}|${norm(g.categoria)}`)
    const seccion = regla?.seccion || seccionPorDefecto(g.rubro, g.categoria)
    const concepto = regla?.concepto || g.categoria || g.rubro
    const col = columnaDeTipo(g.tipo)
    if (col === null) {
      const t = g.tipo || '(vacío)'
      tiposSinClasificar.set(t, (tiposSinClasificar.get(t) || 0) + monto)
    }
    if (seccion === EXCLUIDO) {
      excluidos.push({ rubro: g.rubro, categoria: g.categoria, tipo: g.tipo, total: monto })
      continue
    }
    agregar(seccion, concepto, col ?? 1, monto, { rubro: g.rubro, categoria: g.categoria, sub: seccion === 'cmv' ? subCmv(g.rubro) : undefined })
  }

  // 2) Ajustes a mano sobre las automáticas: un monto corregido pisa el de
  //    gestión en esa columna; el total se recalcula.
  for (const l of lineas.values()) {
    const a = ajustes[l.clave] || {}
    const col1 = a.col1 ?? l.auto.col1
    const col2 = a.col2 ?? l.auto.col2
    l.col1 = n(col1)
    l.col2 = n(col2)
    l.total = l.col1 + l.col2
    l.editado = a.col1 != null || a.col2 != null
    l.oculto = !!a.oculto
    l.rubros = [...l.rubros]
  }

  // 3) Líneas agregadas a mano.
  for (const m of manuales) {
    if (!SECCION[m.seccion]) continue
    const col1 = n(m.col1)
    const col2 = n(m.col2)
    const k = `manual:${m.id}`
    lineas.set(k, {
      clave: k, id: m.id, seccion: m.seccion, concepto: m.concepto || '', origen: 'manual',
      col1, col2, total: col1 + col2, auto: cero(), rubros: [], editado: false, oculto: false,
      sub: m.seccion === 'cmv' ? (m.sub || 'alimentos') : undefined,
    })
  }

  // 4) Secciones con sus totales (sin las ocultas).
  const secciones = SECCIONES.map((s) => {
    const ls = [...lineas.values()].filter((l) => l.seccion === s.key)
      .sort((a, b) => (a.origen === b.origen ? a.concepto.localeCompare(b.concepto, 'es') : a.origen === 'auto' ? -1 : 1))
    const visibles = ls.filter((l) => !l.oculto)
    const t = visibles.reduce((acc, l) => suma(acc, l), cero())
    return { ...s, lineas: ls, ...t }
  })
  const S = Object.fromEntries(secciones.map((s) => [s.key, s]))

  // 5) Resultados.
  const ventas = { total: S.ventas.total, col1: S.ventas.col1, col2: S.ventas.col2 }
  const cmv = { total: S.cmv.total, col1: S.cmv.col1, col2: S.cmv.col2 }
  const resultadoBruto = resta(ventas, cmv)
  const operativas = secciones.filter((s) => s.resumen)
  const egresos = operativas.reduce((acc, s) => suma(acc, s), cero())
  const resultadoEconomico = resta(resultadoBruto, egresos)
  const pasivo = { total: S.pasivo.total, col1: S.pasivo.col1, col2: S.pasivo.col2 }
  const dividendos = { total: S.dividendos.total, col1: S.dividendos.col1, col2: S.dividendos.col2 }
  const resultadoFinal = resta(resta(resultadoEconomico, pasivo), dividendos)

  // 6) Lo que el resumen necesita: valores del mes, sumables entre meses.
  const cmvPorSub = { alimentos: 0, bebidas: 0, movstock: 0 }
  for (const l of S.cmv.lineas) if (!l.oculto) cmvPorSub[l.sub || 'alimentos'] += l.total
  const ventasEvento = S.ventas.lineas.filter((l) => !l.oculto && /evento/i.test(l.concepto)).reduce((a, l) => a + l.total, 0)
  const egresosPorResumen = Object.fromEntries(EGRESOS_RESUMEN.map(([k]) => [k, 0]))
  for (const s of operativas) egresosPorResumen[s.resumen] += s.total
  const valores = {
    ventasLocal: ventas.total - ventasEvento,
    ventasEvento,
    dias: datos.dias != null ? n(datos.dias) : n(v.dias),
    pax: datos.pax != null ? n(datos.pax) : n(v.comensales),
    cmv: cmvPorSub,
    egresos: egresosPorResumen,
    pasivo: pasivo.total,
    dividendos: dividendos.total,
  }

  // 7) Avisos: lo que conviene mirar antes de presentar.
  const avisos = []
  if (S.otros.lineas.some((l) => !l.oculto && l.total)) {
    avisos.push({ tipo: 'otros', texto: `Hay ${S.otros.lineas.filter((l) => !l.oculto && l.total).length} categoría(s) sin sección (${fmtCorto(S.otros.total)}). Asignalas para que el resumen quede bien.` })
  }
  for (const [t, monto] of tiposSinClasificar) {
    avisos.push({ tipo: 'tipo', texto: `Comprobantes tipo "${t}" (${fmtCorto(monto)}) sin columna definida: se contaron en la columna 1.` })
  }
  const cajaGastos = n(auto.cajaGastos)
  if (cajaGastos) {
    const cargadoCol2 = secciones.filter((s) => s.key !== 'ventas').reduce((a, s) => a + s.lineas.filter((l) => l.origen === 'manual' && !l.oculto).reduce((b, l) => b + l.col2, 0), 0)
    avisos.push({ tipo: 'caja', texto: `Gastos pagados con la caja en el mes: ${fmtCorto(cajaGastos)} (gestión no trae el detalle). Cargados a mano en efectivo: ${fmtCorto(cargadoCol2)}.`, cajaGastos, cargadoCol2 })
  }

  return {
    secciones,
    totales: { ventas, cmv, resultadoBruto, egresos, resultadoEconomico, pasivo, dividendos, resultadoFinal },
    valores,
    indicadores: indicadores(valores),
    excluidos,
    avisos,
  }
}

// ── Resumen e indicadores (sobre valores, así sirve para el mes y el año) ───

export function indicadores(val) {
  const venta = n(val.ventasLocal) + n(val.ventasEvento)
  const cmv = n(val.cmv?.alimentos) + n(val.cmv?.bebidas) + n(val.cmv?.movstock)
  const egresos = Object.values(val.egresos || {}).reduce((a, x) => a + n(x), 0)
  const eerr = venta - cmv - egresos
  return {
    venta,
    pax: n(val.pax),
    promPax: val.pax ? venta / n(val.pax) : 0,
    dias: n(val.dias),
    promDias: val.dias ? venta / n(val.dias) : 0,
    cmvPct: pct(cmv, venta),
    laborPct: pct(n(val.egresos?.labor), venta),
    eerr,
    eerrPct: pct(eerr, venta),
  }
}

// Filas del resumen ("P&L acumulado"), con monto y % sobre ventas.
export function armarResumen(val) {
  const ventas = n(val.ventasLocal) + n(val.ventasEvento)
  const fila = (clave, label, monto, extra = {}) => ({ clave, label, monto, pct: pct(monto, ventas), ...extra })
  const cmv = n(val.cmv?.alimentos) + n(val.cmv?.bebidas) + n(val.cmv?.movstock)
  const egresos = EGRESOS_RESUMEN.map(([k, label]) => fila(k, label, n(val.egresos?.[k])))
    .filter((f) => f.clave !== 'otros' || f.monto)
  const egresosTotal = egresos.reduce((a, f) => a + f.monto, 0)
  const eerr = ventas - cmv - egresosTotal
  const rf = eerr - n(val.pasivo) - n(val.dividendos)
  return {
    ventas: [fila('local', 'Local', n(val.ventasLocal)), fila('evento', 'Evento', n(val.ventasEvento)), fila('subtotal', 'Subtotal', ventas, { total: true })],
    cmv: [fila('alimentos', 'Alimentos', n(val.cmv?.alimentos)), fila('bebidas', 'Bebidas', n(val.cmv?.bebidas)), fila('movstock', 'Mov. de Stock', n(val.cmv?.movstock)), fila('subtotal', 'Subtotal', cmv, { total: true })],
    resultadoBruto: fila('bruto', 'Resultado Bruto', ventas - cmv),
    egresos: [...egresos, fila('subtotal', 'Subtotal', egresosTotal, { total: true })],
    economico: [fila('ingresos', 'Ingresos', ventas), fila('egresos', 'Egresos', cmv + egresosTotal), fila('eerr', 'EERR', eerr, { total: true })],
    final: [fila('pasivo', 'Otros Pasivos', n(val.pasivo)), fila('dividendos', 'Dividendos Pagados', n(val.dividendos)), fila('rf', 'RF', rf, { total: true })],
    indicadores: indicadores(val),
  }
}

// Suma de los valores de varios meses (acumulado del año).
export function sumarValores(lista) {
  const out = { ventasLocal: 0, ventasEvento: 0, dias: 0, pax: 0, cmv: { alimentos: 0, bebidas: 0, movstock: 0 }, egresos: Object.fromEntries(EGRESOS_RESUMEN.map(([k]) => [k, 0])), pasivo: 0, dividendos: 0 }
  for (const v of lista) {
    if (!v) continue
    out.ventasLocal += n(v.ventasLocal)
    out.ventasEvento += n(v.ventasEvento)
    out.dias += n(v.dias)
    out.pax += n(v.pax)
    for (const k of Object.keys(out.cmv)) out.cmv[k] += n(v.cmv?.[k])
    for (const k of Object.keys(out.egresos)) out.egresos[k] += n(v.egresos?.[k])
    out.pasivo += n(v.pasivo)
    out.dividendos += n(v.dividendos)
  }
  return out
}

// ── Formatos ─────────────────────────────────────────────────────────────────

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const nombreMes = (mes) => MESES[Number(String(mes).slice(5, 7)) - 1] || ''
export const mesCorto = (mes) => `${String(mes).slice(5, 7)}-${String(mes).slice(2, 4)}` // '2026-08' -> '08-26'
export const fmtMonto = (v) => Math.round(n(v)).toLocaleString('es-AR')
export const fmtPct = (v) => `${n(v).toFixed(2).replace('.', ',')}%`
function fmtCorto(v) { return '$ ' + fmtMonto(v) }
