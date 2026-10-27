// Motor del Informe Mensual nuevo (por cliente). Lógica pura, sin React ni DOM.
//
// Arma, a partir de la respuesta de GET /api/informe-mensual/:id (`im`) y del
// Reporte de Ventas del mismo cliente (`rv` = armarReporte, `rvData` = la
// respuesta cruda de /api/reporte-ventas/:id), el P&L de cada local para cada
// mes del año del informe y del año anterior, el acumulado y el consolidado
// del grupo. Cada P&L de un mes sale de `construirInforme` (lib/informe.js):
// acá solo se le arma la entrada (ventas por canal, líneas cargadas, pax/días)
// y se completa la salida.
//
// Regla de oro (como en el Reporte de Ventas): lo que no está es null, nunca
// 0. Un mes sin ventas ni gastos es null; un % sin base es null.

import { construirInforme, sumarValores, armarResumen, claveLinea, SECCIONES } from './informe.js'
import { autoDeLocal } from './reporteVentas.js'

const LOCAL = 'Local' // el canal que queda como resto (igual que en lib/reporteVentas.js)

// ── Números ──────────────────────────────────────────────────────────────────

const num = (v) => {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const n0 = (v) => num(v) ?? 0
const r2 = (x) => Math.round(x * 100) / 100
const dividir = (a, b) => {
  const x = num(a)
  const y = num(b)
  return x == null || y == null || y === 0 ? null : x / y
}

// valor / base en %, o null si falta alguno o la base es 0.
export function pct(valor, base) {
  const d = dividir(valor, base)
  return d == null ? null : d * 100
}

// ── Meses ────────────────────────────────────────────────────────────────────

const mesDe = (anio, m) => `${anio}-${String(m).padStart(2, '0')}`
const mesPrevio = (mes) => {
  const [a, m] = mes.split('-').map(Number)
  return m === 1 ? mesDe(a - 1, 12) : mesDe(a, m - 1)
}
const mesAnioAnterior = (mes) => mesDe(Number(mes.slice(0, 4)) - 1, Number(mes.slice(5, 7)))
// Enero .. mes del año del informe.
const mesesHasta = (mes) => Array.from({ length: Number(mes.slice(5, 7)) }, (_, i) => mesDe(Number(mes.slice(0, 4)), i + 1))

// ── Entrada del motor ────────────────────────────────────────────────────────

// Líneas de im_linea (hoja 'pyl') de un local y mes → `datos` de construirInforme.
//   corrige != null → ajuste de una línea automática (montos null = queda el de gestión).
//   corrige == null → línea agregada a mano (una oculta no se cuenta).
// `sub` (parte del CMV) sale de im_linea.sub; una línea de CMV sin sub va a Alimentos.
const subDe = (l) => (l.seccion === 'cmv' ? l.sub || 'alimentos' : null)
export function datosDeLineas(lineas = [], local, mes) {
  const ajustes = {}
  const manuales = []
  for (const l of lineas || []) {
    if (l.hoja !== 'pyl' || l.local !== local || l.mes !== mes) continue
    if (l.corrige) {
      ajustes[l.corrige] = { col1: num(l.monto), col2: num(l.monto2), oculto: !!l.oculta, id: l.id, seccion: l.seccion, concepto: l.concepto, sub: subDe(l) }
    } else if (!l.oculta) {
      manuales.push({ id: l.id, seccion: l.seccion, concepto: l.concepto || '', col1: n0(l.monto), col2: n0(l.monto2), sub: subDe(l) })
    }
  }
  return { ajustes, manuales }
}

// Venta del local en un mes que no es el del informe: la del histórico del
// Reporte de Ventas (resuelve cierres y cargas a mano), o lo automático crudo.
function ventaDelMes(rvLocal, rvAuto, mes) {
  const hist = rvLocal?.historico || []
  const h = hist.find((x) => x.mes === mes)
  if (h) return num(h.venta?.valor)
  const ant = hist.find((x) => mesAnioAnterior(x.mes) === mes)
  if (ant && ant.anterior != null) return num(ant.anterior)
  const a = rvAuto?.meses?.[mes]
  const v = num(a?.venta)
  return v === 0 && n0(a?.cajas) > 0 ? null : v // venta 0 con cajas = falta (como el RV)
}

// Líneas de la sección Ventas del P&L: una por canal. "Local" (el resto) lleva
// el efectivo de las cajas como columna 2; los demás canales van en la 1.
//   mes del informe: canales resueltos del Reporte de Ventas (rvLocal.canales);
//   otros meses: venta del histórico y canales automáticos (rvAuto.canales[mes]).
// Sin venta → { lineas: [] }. `faltan`: canales sin valor (su venta queda en Local).
export function ventasDeLocal({ rvLocal, rvAuto, efectivo, mes, esMesInforme } = {}) {
  const ef = n0(efectivo)
  const faltan = []
  const otros = []
  let total
  let local = null
  if (esMesInforme) {
    total = num(rvLocal?.venta?.valor)
    for (const c of rvLocal?.canales || []) {
      if (c.nombre === LOCAL) local = num(c.valor)
      else if (num(c.valor) == null) faltan.push(c.nombre)
      else otros.push({ canal: c.nombre, total: num(c.valor) })
    }
  } else {
    total = ventaDelMes(rvLocal, rvAuto, mes)
    for (const c of rvAuto?.canales?.[mes] || []) {
      if (c.nombre !== LOCAL && num(c.valor) != null) otros.push({ canal: c.nombre, total: num(c.valor) })
    }
  }
  if (total == null) return { lineas: [], faltan }
  if (local == null) local = r2(total - otros.reduce((t, c) => t + c.total, 0))

  const lineas = []
  if (local !== 0 || ef !== 0) lineas.push({ canal: LOCAL, total: local, col1: r2(local - ef), col2: ef })
  for (const c of otros) if (c.total !== 0) lineas.push({ canal: c.canal, total: c.total, col1: c.total, col2: 0 })
  return { lineas, faltan }
}

// ── Salida del motor ─────────────────────────────────────────────────────────

const ORDEN_ORIGEN = { auto: 0, manual: 1 }
const ordenar = (lineas) => lineas.sort((a, b) =>
  (ORDEN_ORIGEN[a.origen] ?? 1) - (ORDEN_ORIGEN[b.origen] ?? 1) || a.concepto.localeCompare(b.concepto, 'es'))

// Bases de los indicadores: lo que se suma entre meses o locales sin perder
// qué falta. venta / ventaSalon / pax / dias son null si no hay dato (pax o
// días en 0 = sin dato). Los promedios llevan su propio par numerador /
// denominador, armado solo con los meses o locales que tienen los dos: un mes
// sin pax no infla el Prom. pax del año ni del grupo.
//   { venta, ventaSalon, pax, dias, parPax: { num, den }|null, parDias: { num, den }|null }
const positivo = (v) => (num(v) > 0 ? num(v) : null)
function basesDeMes({ venta, ventaSalon, pax, dias }) {
  return {
    venta, ventaSalon, pax, dias,
    parPax: ventaSalon != null && pax != null ? { num: ventaSalon, den: pax } : null,
    parDias: venta != null && dias != null ? { num: venta, den: dias } : null,
  }
}
const sumaNula = (vals) => {
  const con = vals.filter((v) => v != null)
  return con.length ? con.reduce((t, v) => t + v, 0) : null
}
const sumaPar = (pares) => {
  const con = pares.filter(Boolean)
  return con.length ? { num: con.reduce((t, p) => t + p.num, 0), den: con.reduce((t, p) => t + p.den, 0) } : null
}
function combinarBases(lista) {
  return {
    venta: sumaNula(lista.map((b) => b.venta)),
    ventaSalon: sumaNula(lista.map((b) => b.ventaSalon)),
    pax: sumaNula(lista.map((b) => b.pax)),
    dias: sumaNula(lista.map((b) => b.dias)),
    parPax: sumaPar(lista.map((b) => b.parPax)),
    parDias: sumaPar(lista.map((b) => b.parDias)),
  }
}

// Indicadores del mes, del acumulado o del grupo sin ceros inventados: sin
// venta, la venta y todo lo que se mide contra ella es null; un promedio sin
// base es null. Prom. pax = venta del canal Local / pax (como el Canva).
export function indicadoresDe(valores, bases = {}) {
  const venta = num(bases.venta)
  const cmv = n0(valores?.cmv?.alimentos) + n0(valores?.cmv?.bebidas) + n0(valores?.cmv?.movstock)
  const egresos = Object.values(valores?.egresos || {}).reduce((t, x) => t + n0(x), 0)
  const eerr = venta == null ? null : venta - cmv - egresos
  const rf = eerr == null ? null : eerr - n0(valores?.pasivo) - n0(valores?.dividendos)
  const prom = (p) => (p ? dividir(p.num, p.den) : null)
  return {
    venta, pax: num(bases.pax), dias: num(bases.dias),
    promPax: prom(bases.parPax),
    promDias: prom(bases.parDias),
    cmv, cmvPct: pct(cmv, venta),
    laborPct: pct(n0(valores?.egresos?.labor), venta),
    eerr, eerrPct: pct(eerr, venta),
    rf, rfPct: pct(rf, venta),
  }
}

// armarResumen con los % recalculados sin ceros inventados. Sin venta, los
// renglones de venta y de resultado quedan en null (no se muestra un 0 como dato).
const SIN_VENTA = { ventas: ['local', 'evento', 'subtotal'], resultadoBruto: ['bruto'], economico: ['ingresos', 'eerr'], final: ['rf'] }
export function resumenValores(valores, bases = {}) {
  const r = armarResumen(valores)
  const venta = num(bases.venta)
  const arreglar = (grupo) => (f) => {
    const monto = venta == null && SIN_VENTA[grupo]?.includes(f.clave) ? null : f.monto
    return { ...f, monto, pct: pct(monto, venta) }
  }
  const out = {}
  for (const [k, v] of Object.entries(r)) out[k] = Array.isArray(v) ? v.map(arreglar(k)) : v?.label ? arreglar(k)(v) : v
  out.indicadores = indicadoresDe(valores, bases)
  return out
}

// Canales vendidos en el mes (las líneas visibles de Ventas, ya corregidas) y la
// venta del canal Local (base del promedio por pax).
function canalesDe(secciones) {
  const ventas = secciones.find((s) => s.key === 'ventas')
  const canales = ventas.lineas.filter((l) => !l.oculto).map((l) => ({ canal: l.concepto, total: l.total, col1: l.col1, col2: l.col2 }))
  const salon = canales.find((c) => c.canal === LOCAL)
  return { canales, ventaSalon: salon ? salon.total : null }
}

// Completa la salida de construirInforme: InformeMes.
function completar(inf, { local, mes, cerrado, editadoEnLineas = {}, avisos = [], canales }) {
  const c = canalesDe(inf.secciones)
  const bases = basesDeMes({
    venta: c.canales.length ? inf.totales.ventas.total : null,
    ventaSalon: c.ventaSalon,
    pax: positivo(inf.valores.pax),
    dias: positivo(inf.valores.dias),
  })
  const valores = { ...inf.valores, pax: bases.pax, dias: bases.dias }
  return {
    ...inf,
    valores,
    local, mes, cerrado,
    canales: canales ?? c.canales,
    ventaSalon: c.ventaSalon,
    bases,
    indicadores: indicadoresDe(valores, bases),
    resumen: resumenValores(valores, bases),
    editadoEnLineas,
    avisos: [...inf.avisos, ...avisos],
  }
}

// Foto de un InformeMes para im_cierre.snapshot.locales[local]: solo lo que se
// ve (las ocultas no cuentan), sin rubros ni fuentes.
export function fotoDeMes(m) {
  return {
    valores: m.valores,
    secciones: m.secciones
      .map((s) => ({
        key: s.key,
        lineas: s.lineas.filter((l) => !l.oculto).map((l) => ({
          clave: l.clave, seccion: l.seccion, concepto: l.concepto, sub: l.sub ?? null, origen: l.origen,
          col1: l.col1, col2: l.col2, total: l.total, ...(l.huerfana ? { huerfana: true } : {}),
        })),
      }))
      .filter((s) => s.lineas.length),
    canales: m.canales,
  }
}

// Un mes cerrado: el P&L se rearma con las líneas de la foto (los totales y
// resultados se recalculan con el mismo motor, así no hay dos maneras de sumar).
function desdeFoto({ local, mes, foto }) {
  const lineas = (foto.secciones || []).flatMap((s) => s.lineas || [])
  const manuales = lineas.map((l, i) => ({ id: `foto:${i}`, seccion: l.seccion, concepto: l.concepto, col1: l.col1, col2: l.col2, sub: l.sub }))
  const inf = construirInforme({ auto: {}, datos: { manuales, pax: foto.valores?.pax, dias: foto.valores?.dias } })
  for (const s of inf.secciones) {
    for (const l of s.lineas) {
      const orig = lineas[Number(String(l.id).slice('foto:'.length))]
      if (!orig) continue
      l.clave = orig.clave
      l.origen = orig.origen || 'auto'
      l.id = orig.origen === 'manual' ? Number(String(orig.clave).slice('manual:'.length)) || undefined : undefined
      if (orig.huerfana) l.huerfana = true
    }
    ordenar(s.lineas)
  }
  return completar(inf, { local, mes, cerrado: true, canales: foto.canales })
}

const cierreDe = (im, mes) => (im.cierres || []).find((c) => c.mes === mes && c.cerrado !== false)
const valorMano = (im, local, mes, dato) => num((im.valores || []).find((v) => v.local === local && v.mes === mes && v.dato === dato)?.valor)

// P&L de un local en un mes. `rv` = { rvLocal: LocalMes del Reporte de Ventas, rvAuto: autoDeLocal(...) }.
//   cerrado → la foto de im_cierre; abierto → construirInforme con gestión + líneas + pax/días.
//   null si el mes no tiene ventas ni gastos (ni nada cargado a mano).
export function pylMes({ local, mes, im, rv = {} }) {
  const cierre = cierreDe(im, mes)
  if (cierre) {
    const foto = cierre.snapshot?.locales?.[local]
    return foto ? desdeFoto({ local, mes, foto }) : null
  }

  const a = im.auto?.[local]?.[mes] || {}
  const ventas = ventasDeLocal({ rvLocal: rv.rvLocal, rvAuto: rv.rvAuto, efectivo: a.efectivo, mes, esMesInforme: mes === im.mes })
  const gastos = (a.gastos || []).filter((x) => n0(x.total) !== 0)
  const datos = datosDeLineas(im.lineas, local, mes)
  if (!ventas.lineas.length && !gastos.length && !datos.manuales.length && !Object.keys(datos.ajustes).length) return null

  const pax = valorMano(im, local, mes, 'pax')
  const dias = valorMano(im, local, mes, 'dias')
  const entrada = (manuales) => ({
    auto: { ventas: { lineas: ventas.lineas, dias: a.dias, comensales: a.pax }, gastos, cajaGastos: a.cajaGastos },
    reglas: im.reglas || [],
    datos: { ajustes: datos.ajustes, manuales, ...(pax != null ? { pax } : {}), ...(dias != null ? { dias } : {}) },
  })
  let inf = construirInforme(entrada(datos.manuales))

  // Correcciones de líneas que gestión ya no trae: se siguen viendo y sumando
  // con el monto corregido, marcadas como huérfanas (Review Focus 2).
  const existentes = new Set(inf.secciones.flatMap((s) => s.lineas.map((l) => l.clave)))
  const huerfanas = Object.entries(datos.ajustes).filter(([k]) => !existentes.has(k)).map(([clave, aj]) => {
    const sep = clave.indexOf('|')
    return { clave, aj, seccion: aj.seccion || clave.slice(0, sep), concepto: aj.concepto || clave.slice(sep + 1) }
  })
  if (huerfanas.length) {
    const extra = huerfanas.filter((h) => !h.aj.oculto)
      .map((h) => ({ id: `huerfana:${h.clave}`, seccion: h.seccion, concepto: h.concepto, col1: n0(h.aj.col1), col2: n0(h.aj.col2), sub: h.aj.sub }))
    if (extra.length) inf = construirInforme(entrada([...datos.manuales, ...extra]))
    const porClave = new Map(huerfanas.map((h) => [`manual:huerfana:${h.clave}`, h]))
    for (const s of inf.secciones) {
      for (const l of s.lineas) {
        const h = porClave.get(l.clave)
        if (!h) continue
        Object.assign(l, { clave: h.clave, origen: 'auto', id: undefined, huerfana: true, editado: true })
      }
      // Una huérfana oculta no suma, pero se lista para poder volver a mostrarla.
      for (const h of huerfanas) {
        if (!h.aj.oculto || h.seccion !== s.key) continue
        const col1 = n0(h.aj.col1)
        const col2 = n0(h.aj.col2)
        s.lineas.push({ clave: h.clave, seccion: h.seccion, concepto: h.concepto, origen: 'auto', col1, col2, total: col1 + col2,
          sub: h.seccion === 'cmv' ? h.aj.sub || 'alimentos' : undefined,
          auto: { total: 0, col1: 0, col2: 0 }, rubros: [], editado: h.aj.col1 != null || h.aj.col2 != null, oculto: true, huerfana: true })
      }
      ordenar(s.lineas)
    }
  }

  // Quién tocó cada línea (para el editor): clave de la línea → fila de im_linea.
  const editadoEnLineas = {}
  for (const l of im.lineas || []) {
    if (l.hoja !== 'pyl' || l.local !== local || l.mes !== mes) continue
    editadoEnLineas[l.corrige || `manual:${l.id}`] = { id: l.id, actualizado_por: l.actualizado_por ?? null, actualizado_at: l.actualizado_at ?? null }
  }

  const avisos = []
  if (!ventas.lineas.length) avisos.push({ tipo: 'venta', texto: 'Falta la venta del mes en el Reporte de Ventas.' })
  if (ventas.faltan.length) avisos.push({ tipo: 'canal', texto: `Sin valor en el Reporte de Ventas: ${ventas.faltan.join(', ')}. Su venta quedó dentro de Local.` })
  return completar(inf, { local, mes, cerrado: false, editadoEnLineas, avisos })
}

// ── Acumulado y consolidado ──────────────────────────────────────────────────

// Suma de varios InformeMes (meses de un local, o locales de un mes).
//   total: valores sumados (null si ninguno tiene datos); faltan: los que eran null.
function acumular(claves, lista) {
  const con = lista.filter(Boolean)
  const faltan = claves.filter((_, i) => !lista[i])
  if (!con.length) return { total: null, bases: null, ventaSalon: null, indicadores: null, resumen: null, faltan }
  const bases = combinarBases(con.map((m) => m.bases))
  const total = { ...sumarValores(con.map((m) => m.valores)), pax: bases.pax, dias: bases.dias }
  return { total, bases, ventaSalon: bases.ventaSalon, indicadores: indicadoresDe(total, bases), resumen: resumenValores(total, bases), faltan }
}

const sumaTriple = (a, b) => ({ total: a.total + b.total, col1: a.col1 + b.col1, col2: a.col2 + b.col2 })
const ceroTriple = () => ({ total: 0, col1: 0, col2: 0 })

// Consolidado de un mes del grupo: valores sumados (sumarValores) y líneas
// sumadas por (sección, concepto). null si ningún local tiene datos ese mes.
function consolidar(mes, lista) {
  const con = lista.filter(Boolean)
  if (!con.length) return null
  const bases = combinarBases(con.map((m) => m.bases))
  const valores = { ...sumarValores(con.map((m) => m.valores)), pax: bases.pax, dias: bases.dias }
  const secciones = SECCIONES.map((s) => {
    const porClave = new Map()
    for (const m of con) {
      for (const l of m.secciones.find((x) => x.key === s.key).lineas) {
        if (l.oculto) continue
        const k = claveLinea(l.seccion, l.concepto)
        const g = porClave.get(k) || { clave: k, seccion: l.seccion, concepto: l.concepto, sub: l.sub, ...ceroTriple(), porLocal: {} }
        Object.assign(g, sumaTriple(g, l))
        g.porLocal[m.local] = (g.porLocal[m.local] || 0) + l.total
        porClave.set(k, g)
      }
    }
    const lineas = [...porClave.values()].sort((a, b) => a.concepto.localeCompare(b.concepto, 'es'))
    return { ...s, lineas, ...lineas.reduce(sumaTriple, ceroTriple()) }
  })
  const totales = {}
  for (const k of Object.keys(con[0].totales)) totales[k] = con.reduce((t, m) => sumaTriple(t, m.totales[k]), ceroTriple())
  const canalesMap = new Map()
  for (const m of con) {
    for (const c of m.canales) {
      const g = canalesMap.get(c.canal) || { canal: c.canal, ...ceroTriple() }
      canalesMap.set(c.canal, { ...g, ...sumaTriple(g, c) })
    }
  }
  return {
    mes, locales: con.map((m) => m.local), cerrado: con.every((m) => m.cerrado),
    secciones, totales, valores, canales: [...canalesMap.values()], ventaSalon: bases.ventaSalon, bases,
    indicadores: indicadoresDe(valores, bases), resumen: resumenValores(valores, bases),
  }
}

// ── Informe del cliente ──────────────────────────────────────────────────────

// Todo lo que las hojas necesitan para el cliente y el mes. Ver la forma de
// `Informe` en el reporte de la Task 4 (.superpowers/sdd/...).
export function armarInformeMensual({ im, rv, rvData, mes }) {
  mes = mes || im.mes
  const cliente = im.cliente || {}
  const nombresLocales = cliente.locales?.length ? cliente.locales : Object.keys(im.auto || {})
  const meses = mesesHasta(mes)
  const mesesAnt = meses.map(mesAnioAnterior)
  const previo = mesPrevio(mes)
  const avisos = []

  const locales = nombresLocales.map((local) => {
    const nombre = cliente.nombres?.[local] || local
    const rvLocal = rv?.locales?.find((l) => l.local === local) || null
    const rvAuto = rvData?.auto ? autoDeLocal({ reglas: [], ...rvData }, local) : null
    const calc = (m) => pylMes({ local, mes: m, im, rv: { rvLocal, rvAuto } })
    const porMes = Object.fromEntries(meses.map((m) => [m, calc(m)]))
    const porMesAnt = Object.fromEntries(mesesAnt.map((m) => [m, calc(m)]))
    const mesAnterior = previo in porMes ? porMes[previo] : calc(previo)
    const acumulado = { meses, ...acumular(meses, meses.map((m) => porMes[m])) }
    const anioAnterior = { meses: porMesAnt, ...acumular(mesesAnt, mesesAnt.map((m) => porMesAnt[m])) }

    const actual = porMes[mes]
    if (!actual) avisos.push({ local, tipo: 'sinDatos', texto: `${nombre}: no hay ventas ni gastos en el mes.` })
    for (const a of actual?.avisos || []) avisos.push({ local, ...a, texto: `${nombre}: ${a.texto}` })
    if (anioAnterior.faltan.length) {
      avisos.push({ local, tipo: 'anioAnterior', meses: anioAnterior.faltan,
        texto: anioAnterior.faltan.length === mesesAnt.length
          ? `${nombre}: no hay datos del año anterior.`
          : `${nombre}: sin datos del año anterior en ${anioAnterior.faltan.join(', ')}.` })
    }
    return { local, nombre, rv: rvLocal, meses: porMes, mesAnterior, acumulado, anioAnterior }
  })

  let grupo = null
  if (locales.length > 1) {
    const gMeses = Object.fromEntries(meses.map((m) => [m, consolidar(m, locales.map((l) => l.meses[m]))]))
    const gAnt = Object.fromEntries(mesesAnt.map((m) => [m, consolidar(m, locales.map((l) => l.anioAnterior.meses[m]))]))
    grupo = {
      meses: gMeses,
      mesAnterior: consolidar(previo, locales.map((l) => l.mesAnterior)),
      acumulado: { meses, ...acumular(meses, meses.map((m) => gMeses[m])) },
      anioAnterior: { meses: gAnt, ...acumular(mesesAnt, mesesAnt.map((m) => gAnt[m])) },
      porLocalMes: Object.fromEntries(locales.map((l) => [l.local, l.meses[mes]])),
    }
  }

  return {
    cliente, mes, meses,
    razonSocial: cliente.razon_social || im.razonSocialGestion || null,
    locales, grupo,
    hojasConfig: im.hojas?.hojas || null,
    indicadoresConfig: im.hojas?.indicadores || {},
    valores: im.valores || [],
    textos: im.textos || [],
    lineasCliente: (im.lineas || []).filter((l) => l.local == null),
    observaciones: im.observaciones || {},
    cerrado: !!cierreDe(im, mes),
    avisos,
  }
}
