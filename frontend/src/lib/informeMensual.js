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

import { construirInforme, sumarValores, armarResumen, claveLinea, SECCIONES, SECCION, EGRESOS_RESUMEN } from './informe.js'
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

// ── Hojas ────────────────────────────────────────────────────────────────────
//
// paginasDe arma la lista de hojas del PDF; los armadores *De devuelven los
// números de cada hoja. Lo que no está es null (la hoja muestra "—"), nunca 0.

// alcance: 'cliente' = una hoja; 'unLocal' = una, solo con un local; 'grupo' =
// una, solo con más de un local; 'local' = una por local; 'localGrupo' = por
// local y del grupo, en dos partes; 'seccion' = por local y grupo de secciones
// con datos en el mes (GRUPOS_SECCION).
export const HOJAS_DEFECTO = [
  { clave: 'portada', titulo: 'Portada', alcance: 'cliente' },
  { clave: 'indice', titulo: 'Índice', alcance: 'cliente' },
  { clave: 'indicadores', titulo: 'Principales indicadores', alcance: 'unLocal' },
  { clave: 'ind_locales', titulo: 'Indicadores por local', alcance: 'grupo' },
  { clave: 'historico', titulo: 'Histórico de ventas', alcance: 'local' },
  { clave: 'pyl_acumulado', titulo: 'P&L acumulado', alcance: 'localGrupo' },
  { clave: 'pyl_historico', titulo: 'P&L año anterior contra actual', alcance: 'local' },
  { clave: 'consolidado', titulo: 'Consolidado del grupo', alcance: 'grupo' },
  { clave: 'cmv', titulo: 'CMV', alcance: 'local' },
  { clave: 'detalle', titulo: 'Detalle de gastos', alcance: 'seccion' },
  { clave: 'apertura', titulo: 'Apertura por rubro', alcance: 'seccion', ocultaConVariosLocales: true },
  { clave: 'cashflow', titulo: 'Cash flow', alcance: 'cliente' },
  { clave: 'deuda', titulo: 'Deuda corriente', alcance: 'cliente' },
  { clave: 'resumen', titulo: 'Resumen ejecutivo', alcance: 'local' },
  { clave: 'contraportada', titulo: 'Contraportada', alcance: 'cliente' },
]

// Secciones del P&L que tienen hoja de detalle y de apertura (una por grupo).
export const GRUPOS_SECCION = [
  { key: 'cmv', titulo: 'CMV', secciones: ['cmv'] },
  { key: 'fijos', titulo: 'Fijos y variables', secciones: ['alquiler'] },
  { key: 'generales', titulo: 'Gastos generales', secciones: ['publicidad', 'descartables', 'instalaciones', 'representacion'] },
  { key: 'financieros', titulo: 'Costos financieros', secciones: ['financieros'] },
  { key: 'sueldos', titulo: 'Sueldos y honorarios', secciones: ['sueldos', 'sueldos_socios', 'desvinculaciones', 'honorarios'] },
  { key: 'impositivos', titulo: 'Impositivos', secciones: ['impositivos'] },
]
const GRUPO = Object.fromEntries(GRUPOS_SECCION.map((x) => [x.key, x]))

// Renglones que entran en una hoja de detalle / apertura; si hay más, sigue en
// otra hoja (parte 2, 3…). Ajustados a lo que entra en la hoja de 1456×819: el detalle va en dos
// columnas de 14 renglones (más títulos y totales) y la apertura en una de 20.
export const FILAS_POR_HOJA = { detalle: 28, apertura: 20 }

const SUBS_CMV = [['alimentos', 'Alimentos'], ['bebidas', 'Bebidas'], ['movstock', 'Movimiento de stock']]

const sinCero = (v) => (v == null || v === 0 ? null : v)
const resta = (a, b) => (a == null || b == null ? null : r2(a - b))
const ventaDe = (m) => m?.bases?.venta ?? null
const localDe = (informe, local) => (informe?.locales || []).find((l) => l.local === local) || null
const mesesDeLocal = (informe, local) => {
  const l = localDe(informe, local)
  return { l, act: l?.meses?.[informe.mes] || null, ant: l?.mesAnterior || null }
}
// Contra el mes anterior: null si alguno de los dos meses no tiene datos; un
// concepto que falta en un mes que sí tiene datos cuenta como 0 ("▲ 68.000").
const difMeses = (actual, anterior, act, ant) => (act && ant ? r2((actual ?? 0) - (anterior ?? 0)) : null)

function grupoDe(key) {
  const g = GRUPO[key]
  if (!g) throw new Error(`No hay hoja de detalle para "${key}".`)
  return g
}

// Bloques (subtítulos) dentro de una hoja de detalle: el CMV se abre en
// alimentos / bebidas / stock; un grupo de varias secciones, por sección.
const bloquesDe = (grupo) => (grupo.key === 'cmv'
  ? SUBS_CMV.map(([key, titulo]) => ({ key, titulo }))
  : grupo.secciones.length > 1 ? grupo.secciones.map((s) => ({ key: s, titulo: SECCION[s].titulo })) : [])
const bloqueDe = (grupo, l) => (grupo.key === 'cmv' ? l.sub || 'alimentos' : grupo.secciones.length > 1 ? l.seccion : null)
const posBloque = (grupo) => {
  const orden = bloquesDe(grupo).map((b) => b.key)
  return (f) => Math.max(0, orden.indexOf(f.bloque))
}
const bloquesConFilas = (grupo, filas) => bloquesDe(grupo).filter((b) => filas.some((f) => f.bloque === b.key))

// Líneas visibles de las secciones de un grupo en un mes, sumadas por concepto
// (una línea a mano con el mismo concepto que una de gestión es el mismo renglón).
function conceptosDe(m, grupo) {
  const out = new Map()
  for (const s of m?.secciones || []) {
    if (!grupo.secciones.includes(s.key)) continue
    for (const l of s.lineas) {
      if (l.oculto) continue
      const k = claveLinea(l.seccion, l.concepto)
      const c = out.get(k) || { clave: k, concepto: l.concepto, seccion: l.seccion, bloque: bloqueDe(grupo, l), total: 0, col1: 0, col2: 0 }
      c.total = r2(c.total + n0(l.total))
      c.col1 = r2(c.col1 + n0(l.col1))
      c.col2 = r2(c.col2 + n0(l.col2))
      out.set(k, c)
    }
  }
  return out
}
const sumaConceptos = (cs) => (cs.length ? sinCero(r2(cs.reduce((t, c) => t + c.total, 0))) : null)
const tieneDatosGrupo = (m, grupo) => [...conceptosDe(m, grupo).values()].some((c) => c.total || c.col1 || c.col2)

// Configuración de hojas (la guardada en reporte_hojas, o `config`) sobre los
// valores por defecto, en orden. Para la lista del editor:
//   [{ clave, titulo, alcance, visible, orden, aplica, motivo }]
// aplica = false (con el motivo) si la hoja no corresponde a este cliente o mes.
export function hojasDe(informe, config) {
  const lista = Array.isArray(config) ? config : config?.hojas ?? informe?.hojasConfig
  const guardada = new Map((Array.isArray(lista) ? lista : []).filter((h) => h?.clave).map((h) => [h.clave, h]))
  const varios = (informe?.locales?.length || 0) > 1
  const vacia = { cashflow: !cashflowDe(informe).tieneDatos, deuda: !deudaDe(informe).tieneDatos }
  return HOJAS_DEFECTO
    .map((h, i) => {
      const g = guardada.get(h.clave) || {}
      let motivo = null
      if (h.alcance === 'unLocal' && varios) motivo = 'Solo para clientes de un local. Con varios locales sale "Indicadores por local".'
      else if (h.alcance === 'grupo' && !varios) motivo = 'Solo para clientes con más de un local.'
      else if (vacia[h.clave]) motivo = 'No hay nada cargado este mes, así que no sale en el PDF.'
      return {
        clave: h.clave, titulo: h.titulo, alcance: h.alcance,
        visible: typeof g.visible === 'boolean' ? g.visible : !(h.ocultaConVariosLocales && varios),
        orden: num(g.orden) ?? i,
        aplica: !motivo, motivo, i,
      }
    })
    .sort((a, b) => a.orden - b.orden || a.i - b.i)
    .map(({ i, ...h }) => h)
}

// Hojas del PDF en orden: [{ id, clave, titulo, local?, nombre?, grupo?, seccion?, seccionTitulo?, parte?, partes? }]
//   id: 'clave' | 'clave:local' | 'pyl_acumulado:local:1|2' | 'pyl_acumulado:grupo:1|2'
//       | 'detalle:local:seccion' | 'apertura:local:seccion' (desde la parte 2: ':2', ':3'…)
export function paginasDe(informe, config) {
  const locales = informe?.locales || []
  const paginas = []
  for (const h of hojasDe(informe, config)) {
    if (!h.visible || !h.aplica) continue
    const base = { clave: h.clave, titulo: h.titulo }
    if (h.alcance === 'local') {
      for (const l of locales) paginas.push({ id: `${h.clave}:${l.local}`, ...base, local: l.local, nombre: l.nombre })
    } else if (h.alcance === 'localGrupo') {
      for (const l of locales) {
        for (const parte of [1, 2]) paginas.push({ id: `${h.clave}:${l.local}:${parte}`, ...base, local: l.local, nombre: l.nombre, parte, partes: 2 })
      }
      if (informe.grupo) for (const parte of [1, 2]) paginas.push({ id: `${h.clave}:grupo:${parte}`, ...base, grupo: true, parte, partes: 2 })
    } else if (h.alcance === 'seccion') {
      for (const l of locales) {
        const act = l.meses?.[informe.mes]
        for (const g of GRUPOS_SECCION) {
          // El detalle compara contra el mes anterior: sale si hay datos en cualquiera
          // de los dos. La apertura es solo del mes del informe.
          const conDatos = h.clave === 'detalle' ? tieneDatosGrupo(act, g) || tieneDatosGrupo(l.mesAnterior, g) : tieneDatosGrupo(act, g)
          if (!conDatos) continue
          const filas = (h.clave === 'detalle' ? detalleDe : aperturaDe)(informe, l.local, g.key).filas.length
          if (!filas) continue // p. ej. +5 / −5 en un concepto: total 0, no hay renglón que mostrar
          const partes = Math.max(1, Math.ceil(filas / FILAS_POR_HOJA[h.clave]))
          for (let parte = 1; parte <= partes; parte++) {
            paginas.push({
              id: `${h.clave}:${l.local}:${g.key}${parte > 1 ? `:${parte}` : ''}`, ...base,
              local: l.local, nombre: l.nombre, seccion: g.key, seccionTitulo: g.titulo, parte, partes,
            })
          }
        }
      }
    } else {
      paginas.push({ id: h.clave, ...base })
    }
  }
  return paginas
}

// Detalle de gastos de un grupo de secciones: mes del informe contra el anterior,
// concepto por concepto, % sobre la venta de cada mes.
//   { grupo: { key, titulo }, local, mes, mesAnterior, ventaActual, ventaAnterior,
//     bloques: [{ key, titulo }], filas: [{ clave, concepto, seccion, bloque, anterior,
//     pctAnterior, actual, pctActual, diferencia }], totales: { anterior, pctAnterior,
//     actual, pctActual, diferencia }, resultadoBruto: igual que totales | null (solo CMV) }
export function detalleDe(informe, local, seccionGrupo) {
  const grupo = grupoDe(seccionGrupo)
  const { act, ant } = mesesDeLocal(informe, local)
  const vAct = ventaDe(act)
  const vAnt = ventaDe(ant)
  const A = conceptosDe(act, grupo)
  const P = conceptosDe(ant, grupo)
  const renglon = (actual, anterior) => ({
    anterior, pctAnterior: pct(anterior, vAnt), actual, pctActual: pct(actual, vAct), diferencia: difMeses(actual, anterior, act, ant),
  })
  const filas = []
  for (const k of new Set([...A.keys(), ...P.keys()])) {
    const a = A.get(k)
    const p = P.get(k)
    const actual = sinCero(a?.total ?? null)
    const anterior = sinCero(p?.total ?? null)
    if (actual == null && anterior == null) continue
    const c = a || p
    filas.push({ clave: k, concepto: c.concepto, seccion: c.seccion, bloque: c.bloque, ...renglon(actual, anterior) })
  }
  const pos = posBloque(grupo)
  filas.sort((x, y) => pos(x) - pos(y) || (y.actual ?? 0) - (x.actual ?? 0) || (y.anterior ?? 0) - (x.anterior ?? 0)
    || x.concepto.localeCompare(y.concepto, 'es'))

  let resultadoBruto = null
  if (grupo.key === 'cmv') {
    const rb = (m) => (ventaDe(m) == null ? null : m.totales.resultadoBruto.total)
    resultadoBruto = { ...renglon(rb(act), rb(ant)), diferencia: resta(rb(act), rb(ant)) }
  }
  return {
    grupo: { key: grupo.key, titulo: grupo.titulo }, local, mes: informe.mes, mesAnterior: mesPrevio(informe.mes),
    ventaActual: vAct, ventaAnterior: vAnt,
    bloques: bloquesConFilas(grupo, filas), filas,
    totales: renglon(act ? sumaConceptos([...A.values()]) : null, ant ? sumaConceptos([...P.values()]) : null),
    resultadoBruto,
  }
}

// Apertura por rubro del mes: columna 1 (con factura) y 2 (sin factura), cada
// una con su % sobre la venta de esa columna, y el reparto (% de la columna 1).
//   { grupo, local, mes, venta: { total, col1, col2 }, bloques, filas: [{ clave, concepto,
//     seccion, bloque, total, pct, col1, pct1, col2, pct2, reparto }], totales: { total, pct,
//     col1, pct1, col2, pct2, reparto }, resultadoBruto: { total, pct, col1, pct1, col2, pct2 } | null (solo CMV) }
// Una columna sin monto es null ("—").
export function aperturaDe(informe, local, seccionGrupo) {
  const grupo = grupoDe(seccionGrupo)
  const { act } = mesesDeLocal(informe, local)
  const hayVenta = ventaDe(act) != null
  const venta = {
    total: hayVenta ? ventaDe(act) : null,
    col1: hayVenta ? sinCero(act.totales.ventas.col1) : null,
    col2: hayVenta ? sinCero(act.totales.ventas.col2) : null,
  }
  const montos = (x, cero = sinCero) => {
    const total = cero(num(x.total))
    const col1 = cero(num(x.col1))
    const col2 = cero(num(x.col2))
    return { total, pct: pct(total, venta.total), col1, pct1: pct(col1, venta.col1), col2, pct2: pct(col2, venta.col2) }
  }
  // Parte de la columna 1 en el total; null si no hay total o hay una columna negativa (notas de crédito).
  const reparto = (m) => (m.total == null || (m.col1 ?? 0) < 0 || (m.col2 ?? 0) < 0 ? null : pct(m.col1 ?? 0, m.total))
  const conReparto = (m) => ({ ...m, reparto: reparto(m) })

  const cs = [...conceptosDe(act, grupo).values()]
  const pos = posBloque(grupo)
  const filas = cs
    .map((c) => ({ clave: c.clave, concepto: c.concepto, seccion: c.seccion, bloque: c.bloque, ...conReparto(montos(c)) }))
    .filter((f) => f.total != null || f.col1 != null || f.col2 != null)
    .sort((x, y) => pos(x) - pos(y) || x.concepto.localeCompare(y.concepto, 'es'))
  const suma = (k) => r2(cs.reduce((t, c) => t + c[k], 0))
  const totales = conReparto(montos(act ? { total: suma('total'), col1: suma('col1'), col2: suma('col2') } : {}))
  const resultadoBruto = grupo.key === 'cmv' && hayVenta ? montos(act.totales.resultadoBruto, (v) => v) : null
  return { grupo: { key: grupo.key, titulo: grupo.titulo }, local, mes: informe.mes, venta, bloques: bloquesConFilas(grupo, filas), filas, totales, resultadoBruto }
}

// Hoja de CMV: total y cada parte (alimentos, bebidas, stock) con su % sobre la
// venta y los puntos contra el mes anterior; categorías de mayor a menor.
//   { local, mes, venta, total, pct, anterior: { total, pct }, pts,
//     porSub: { alimentos|bebidas|movstock: { titulo, total, pct, anterior: { total, pct }, pts } },
//     categorias: { alimentos|bebidas|movstock: [{ clave, concepto, total, barra (0-100, contra la mayor) }] } }
export function cmvDe(informe, local) {
  const { act, ant } = mesesDeLocal(informe, local)
  const vAct = ventaDe(act)
  const vAnt = ventaDe(ant)
  const A = [...conceptosDe(act, GRUPO.cmv).values()]
  const P = [...conceptosDe(ant, GRUPO.cmv).values()]
  // pts: los dos meses tienen que tener venta (ni null ni 0); una parte sin
  // compras en un mes con venta cuenta 0%.
  const parte = (total, totalAnt) => {
    const p = pct(total ?? 0, vAct)
    const pa = pct(totalAnt ?? 0, vAnt)
    return {
      total, pct: pct(total, vAct),
      anterior: { total: totalAnt, pct: pct(totalAnt, vAnt) },
      pts: (total == null && totalAnt == null) || p == null || pa == null ? null : p - pa,
    }
  }
  const porSub = {}
  const categorias = {}
  for (const [sub, titulo] of SUBS_CMV) {
    const deSub = (cs) => cs.filter((c) => c.bloque === sub)
    porSub[sub] = { titulo, ...parte(sumaConceptos(deSub(A)), sumaConceptos(deSub(P))) }
    const cats = deSub(A).filter((c) => c.total).sort((x, y) => y.total - x.total || x.concepto.localeCompare(y.concepto, 'es'))
    const max = Math.max(0, ...cats.map((c) => c.total))
    categorias[sub] = cats.map((c) => ({ clave: c.clave, concepto: c.concepto, total: c.total, barra: max > 0 && c.total > 0 ? (c.total / max) * 100 : null }))
  }
  return { local, mes: informe.mes, venta: vAct, ...parte(sumaConceptos(A), sumaConceptos(P)), porSub, categorias }
}

// Textos del informe (im_texto): del local, o del cliente con local ''.
function textoDe(informe, local, clave) {
  const t = (informe?.textos || []).find((x) => (x.local ?? '') === (local ?? '') && x.clave === clave && (x.mes == null || x.mes === informe.mes))
  const s = t?.texto == null ? '' : String(t.texto).trim()
  return s || null
}

// Resumen ejecutivo: cifras del mes contra el anterior, armadas solas; el
// comentario lo escribe una persona (im_texto 'resumen:<clave>').
//   [{ clave, titulo, sentido: 'costo'|'resultado', formato: 'pesos'|'numero', actual, anterior,
//      diferencia, pctActual, pctAnterior, diferenciaPts, comentario }]
// sentido: en un costo subir es malo; en venta y resultados subir es bueno.
// pctActual / pctAnterior / diferenciaPts solo en costos y resultados (sobre la venta).
export function resumenDe(informe, local) {
  const { act, ant } = mesesDeLocal(informe, local)
  const vAct = ventaDe(act)
  const vAnt = ventaDe(ant)
  const filas = []
  const fila = (clave, titulo, sentido, dato, { formato = 'pesos', conPct = false } = {}) => {
    const actual = act ? num(dato(act)) : null
    const anterior = ant ? num(dato(ant)) : null
    const pctActual = conPct ? pct(actual, vAct) : null
    const pctAnterior = conPct ? pct(anterior, vAnt) : null
    return {
      clave, titulo, sentido, formato, actual, anterior, diferencia: resta(actual, anterior),
      pctActual, pctAnterior, diferenciaPts: pctActual == null || pctAnterior == null ? null : pctActual - pctAnterior,
      comentario: textoDe(informe, local, `resumen:${clave}`),
    }
  }
  const ind = (k) => (m) => m.indicadores?.[k]
  filas.push(
    fila('venta', 'Venta', 'resultado', ind('venta')),
    fila('dias', 'Días de venta', 'resultado', ind('dias'), { formato: 'numero' }),
    fila('pax', 'Cubiertos', 'resultado', ind('pax'), { formato: 'numero' }),
    fila('prom_pax', 'Promedio por cubierto', 'resultado', ind('promPax')),
    fila('cmv', 'CMV general', 'costo', ind('cmv'), { conPct: true }),
    fila('cmv_alimentos', 'CMV alimentos', 'costo', (m) => m.valores?.cmv?.alimentos, { conPct: true }),
    fila('cmv_bebidas', 'CMV bebidas', 'costo', (m) => m.valores?.cmv?.bebidas, { conPct: true }),
    fila('cmv_movstock', 'Mov. de stock', 'costo', (m) => m.valores?.cmv?.movstock, { conPct: true }),
  )
  for (const [k, titulo] of EGRESOS_RESUMEN) {
    const f = fila(k, titulo, 'costo', (m) => m.valores?.egresos?.[k], { conPct: true })
    if (f.actual || f.anterior) filas.push(f) // solo los egresos con dato en alguno de los dos meses
  }
  filas.push(
    fila('eerr', 'Resultado económico', 'resultado', ind('eerr'), { conPct: true }),
    fila('rf', 'Resultado final', 'resultado', ind('rf'), { conPct: true }),
  )
  return filas
}

// Líneas del cliente (local null) de una hoja en el mes del informe, en orden.
const lineasDeHoja = (informe, hoja) => (informe?.lineasCliente || [])
  .filter((l) => l.hoja === hoja && l.local == null && l.mes === informe.mes && !l.oculta)
  .sort((a, b) => (num(a.orden) ?? 0) - (num(b.orden) ?? 0) || (num(a.id) ?? 0) - (num(b.id) ?? 0))
const montosDe = (ls) => {
  const lineas = ls.map((l) => ({ id: l.id, concepto: l.concepto || '', monto: num(l.monto) }))
  const con = lineas.filter((l) => l.monto != null)
  return { lineas, total: con.length ? r2(con.reduce((t, l) => t + l.monto, 0)) : null }
}

// Cash flow (cargado a mano, del cliente):
//   { disponible: { lineas: [{ id, concepto, monto }], total }, pagar: { lineas, total },
//     mpLiquidar, lineasMp, resultado (disponible − pagar), cobertura (% de los pagos que
//     cubre lo disponible), elaborado, proyectado (textos), tieneDatos }
export function cashflowDe(informe) {
  const ls = lineasDeHoja(informe, 'cashflow')
  const de = (seccion) => montosDe(ls.filter((l) => l.seccion === seccion))
  const disponible = de('disponible')
  const pagar = de('pagar')
  const mp = de('mp_liquidar')
  return {
    disponible, pagar, mpLiquidar: mp.total, lineasMp: mp.lineas,
    resultado: resta(disponible.total, pagar.total),
    cobertura: pct(disponible.total, pagar.total),
    elaborado: textoDe(informe, '', 'cashflow:elaborado'),
    proyectado: textoDe(informe, '', 'cashflow:proyectado'),
    tieneDatos: [disponible, pagar, mp].some((b) => b.total != null),
  }
}

// Deuda corriente (cargada a mano, del cliente):
//   { lineas, total, lineasVenta, ventaPeriodo, ventaPeriodoCargada, pct, fecha, tieneDatos }
// ventaPeriodo: la cargada (sección venta_periodo) o, si no hay, la venta del mes
// del cliente (todos los locales).
export function deudaDe(informe) {
  const ls = lineasDeHoja(informe, 'deuda')
  const deuda = montosDe(ls.filter((l) => l.seccion === 'deuda'))
  const venta = montosDe(ls.filter((l) => l.seccion === 'venta_periodo'))
  const ventaMes = sumaNula((informe?.locales || []).map((l) => ventaDe(l.meses?.[informe.mes])))
  const ventaPeriodo = venta.total ?? ventaMes
  return {
    lineas: deuda.lineas, total: deuda.total,
    lineasVenta: venta.lineas, ventaPeriodo, ventaPeriodoCargada: venta.total != null,
    pct: pct(deuda.total, ventaPeriodo),
    fecha: textoDe(informe, '', 'deuda:fecha'),
    tieneDatos: deuda.total != null,
  }
}

// Mover una categoría de gestión a otra sección (regla del grupo) cambia la clave
// de su línea: de `seccion|concepto` a `nueva|concepto`. Una corrección guardada
// con la clave vieja (im_linea.corrige) quedaría huérfana y se contaría dos veces
// (la línea movida + la huérfana). Esto dice qué hacer con cada una:
//   { linea: body de PUT /linea } → la misma corrección, con la clave nueva;
//   { borrar: id } → se borra: la línea sale del P&L ('excluido') o el local y mes
//                    ya tienen una corrección con la clave nueva.
// Los meses cerrados no se tocan (usan su foto y la API no deja cambiarlos).
export function trasladoDeCorrecciones({ lineas = [], claveVieja, seccionNueva, concepto, sub = null, mesesCerrados = new Set() }) {
  const claveNueva = seccionNueva === 'excluido' ? null : claveLinea(seccionNueva, concepto)
  const out = []
  for (const f of lineas || []) {
    if (f.hoja !== 'pyl' || f.corrige !== claveVieja || mesesCerrados.has(f.mes)) continue
    const yaEsta = claveNueva && lineas.some((g) => g.hoja === 'pyl' && g.corrige === claveNueva && g.local === f.local && g.mes === f.mes)
    if (!claveNueva || yaEsta) { out.push({ borrar: Number(f.id) }); continue }
    out.push({
      linea: {
        id: Number(f.id), local: f.local, mes: f.mes, hoja: 'pyl', seccion: seccionNueva,
        concepto: f.concepto || concepto || '', corrige: claveNueva,
        monto: num(f.monto), monto2: num(f.monto2), oculta: !!f.oculta,
        sub: seccionNueva === 'cmv' ? f.sub || sub || 'alimentos' : null,
        orden: Number.isInteger(f.orden) ? f.orden : 0,
      },
    })
  }
  return out
}

// Foto del mes para cerrar (POST /cerrar): { locales: { [local]: fotoDeMes(...) } }.
// Un local sin datos en el mes no entra (al reabrirlo se ve igual: null).
export function snapshotIm(informe) {
  const locales = {}
  for (const l of informe?.locales || []) {
    const m = l.meses?.[informe.mes]
    if (m) locales[l.local] = fotoDeMes(m)
  }
  return { locales }
}
