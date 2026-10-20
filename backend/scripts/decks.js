// Lectura de los decks de "Reporte de Ventas" ya entregados (.pptx) para
// cargarlos como meses cerrados. Regla: no se inventa ni se adivina un número.
// Lo que no se reconoce va a `sinMapear`; lo que no cierra, a `diferencias`.
// Las columnas calculadas (promedios, evoluciones, variables) solo verifican.
import JSZip from 'jszip'
import { parseNumeroAR, fmtAR } from '../../frontend/src/lib/reporteVentas.js'

// ---------------------------------------------------------------------------
// Lectura del .pptx

const decodificar = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&')

// Texto de un fragmento de XML: runs del mismo párrafo juntos, párrafos con espacio.
function textoDe(xml) {
  return xml.split(/<\/a:p>/).map((p) =>
    [...p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => decodificar(m[1])).join(''))
    .filter((t) => t.trim()).join(' ').replace(/\s+/g, ' ').trim()
}

// Slides en el orden de la presentación (presentation.xml); si falta, por número de archivo.
async function ordenSlides(zip) {
  const archivos = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
  const porNumero = archivos.sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]))
  const pres = await zip.file('ppt/presentation.xml')?.async('string')
  const rels = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string')
  if (!pres || !rels) return porNumero
  const destino = {}
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/\bId="([^"]+)"/)?.[1]
    const target = m[0].match(/\bTarget="([^"]+)"/)?.[1]
    if (id && target) destino[id] = 'ppt/' + target.replace(/^\.?\//, '')
  }
  const lista = pres.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] || ''
  const orden = [...lista.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].map((m) => destino[m[1]]).filter((p) => p && zip.file(p))
  return orden.length ? orden : porNumero
}

// [{ slide, titulo, filas }]: una entrada por tabla. Las celdas son el texto de
// cada <a:tc> (las combinadas quedan vacías, así las columnas no se corren).
export async function leerTablas(buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const salida = []
  const slides = await ordenSlides(zip)
  for (let i = 0; i < slides.length; i++) {
    const xml = await zip.file(slides[i]).async('string')
    const tablas = xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/g) || []
    const titulo = textoDe(xml.replace(/<a:tbl>[\s\S]*?<\/a:tbl>/g, '</a:p>'))
    for (const t of tablas) {
      const filas = (t.match(/<a:tr\b[\s\S]*?<\/a:tr>/g) || []).map((tr) =>
        (tr.match(/<a:tc\b[^>]*\/>|<a:tc\b[^>]*>[\s\S]*?<\/a:tc>/g) || []).map((tc) => textoDe(tc)))
      salida.push({ slide: i + 1, titulo, filas })
    }
  }
  return salida
}

// ---------------------------------------------------------------------------
// Utilidades

// Mayúsculas, sin acentos, comillas unificadas y espacios simples.
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[`´’‘]/g, "'").replace(/\s+/g, ' ').trim().toUpperCase()

const num = (s) => parseNumeroAR(typeof s === 'string' ? s.trim() : s)
const vacia = (fila) => !fila || fila.every((c) => !String(c ?? '').trim())
const esTotal = (s) => /^TOTAL(ES)?\b/.test(norm(s))
const fmt = (n, d = 0) => fmtAR(n, d)
const TOL_PESOS = 1
const TOL_PUNTOS = 0.01
const EPS = 1e-9

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const mesDe = (anio, m) => `${anio}-${String(m).padStart(2, '0')}`
const mesPrevio = (mes) => {
  const [a, m] = mes.split('-').map(Number)
  return m === 1 ? mesDe(a - 1, 12) : mesDe(a, m - 1)
}

// 'ene', 'ene 26', 'ene-26', 'enero', 'sept 26', 'sep-26', 'setiembre' → 'YYYY-MM'.
// Sin año usa `anio`. Devuelve null si no es un período.
export function leerPeriodo(s, anio) {
  const t = norm(s).toLowerCase()
  const m = t.match(/^([a-z]+)\.?(?:\s*[-/ ]\s*(\d{2}|\d{4}))?$/)
  if (!m || m[1].length < 3) return null
  const palabra = m[1].replace(/^set/, 'sep')
  const idx = MESES.findIndex((n) => n.startsWith(palabra))
  if (idx < 0) return null
  let y = anio
  if (m[2]) y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
  if (!y) return null
  return mesDe(y, idx + 1)
}

// Año en un encabezado: '2.025', '2026', 'CLUB LUCERO 2025'. null si no termina en año.
function anioDe(h) {
  const m = norm(h).match(/(?:^|\s)((?:19|20)\d{2}|[12]\.\d{3})$/)
  return m ? Number(m[1].replace('.', '')) : null
}

function filaEncabezado(filas, buscar = 'PERIODO') {
  return filas.findIndex((f) => (f || []).some((c) => norm(c) === buscar))
}

const agregar = (lista, s) => { if (!lista.includes(s)) lista.push(s) }

function compararPct(actual, ref) {
  if (actual == null || ref == null || ref === 0) return null
  return ((actual - ref) / ref) * 100
}

// ---------------------------------------------------------------------------
// Histórico: una fila por mes.

const ES_CALC_PROM = /^PROM/
const ES_CALC_VAR = /^(EVOLUCION|VARIABLE|VARIACION|INTERANUAL|VAR\b)/
const ES_ANUAL = /INTERANUAL|VS\.? ((19|20)\d{2}|[12]\.\d{3})|ANO ANTERIOR/

function clasificar(enc, anio) {
  const cols = enc.map((h, i) => ({ i, h: String(h ?? '').trim(), n: norm(h), rol: null }))
  const sinMapear = []
  const p = cols.findIndex((c) => c.n === 'PERIODO')
  cols[p].rol = 'periodo'

  for (const c of cols) {
    if (c.rol || !c.n) continue
    if (ES_CALC_PROM.test(c.n)) {
      c.rol = 'prom'
      c.base = /ORDEN/.test(c.n) ? 'ordenes' : /PERSONA|CUBIERTO|PAX/.test(c.n) ? 'cubiertos' : 'auto'
    } else if (ES_CALC_VAR.test(c.n)) {
      c.rol = 'var'
      c.ref = ES_ANUAL.test(c.n) ? 'anual' : 'mes'
    } else if (['PERSONAS', 'CUBIERTOS', 'PAX'].includes(c.n)) c.rol = 'cubiertos'
    else if (['ORDENES'].includes(c.n)) c.rol = 'ordenes'
    else if (anioDe(c.n) != null) { c.rol = 'anio'; c.anio = anioDe(c.n) }
    else if (['VENTAS', 'VENTA', 'TOTAL DE VENTAS'].includes(c.n)) c.rol = 'ventaNombre'
  }

  // Columnas de año: la mayor es la venta, la menor el año anterior.
  const anios = cols.filter((c) => c.rol === 'anio').sort((a, b) => a.anio - b.anio)
  if (anios.length >= 2) {
    anios[anios.length - 1].rol = 'venta'
    anios[0].rol = 'anterior'
    anios.slice(1, -1).forEach((c) => { c.rol = null })
  } else if (anios.length === 1) {
    anios[0].rol = anio && anios[0].anio < anio ? 'anterior' : 'venta'
  }
  if (!cols.some((c) => c.rol === 'venta')) {
    const nombrada = cols.find((c) => c.rol === 'ventaNombre')
    const siguiente = cols[p + 1]
    if (nombrada) nombrada.rol = 'venta'
    else if (siguiente && !siguiente.rol && siguiente.n) siguiente.rol = 'venta'
  }
  for (const c of cols) if (c.rol === 'ventaNombre') c.rol = null
  // Una sola columna por dato: las repetidas no se usan.
  for (const rol of ['venta', 'anterior', 'cubiertos', 'ordenes']) {
    cols.filter((c) => c.rol === rol).slice(1).forEach((c) => { c.rol = null })
  }

  const tiene = (rol) => cols.some((c) => c.rol === rol)
  for (const c of cols) {
    if (c.rol === 'prom') {
      if (c.base === 'auto') {
        const izq = cols[c.i - 1]
        c.base = izq && (izq.rol === 'cubiertos' || izq.rol === 'ordenes') ? izq.rol : null
      }
      if (!c.base || !tiene(c.base) || !tiene('venta')) { c.rol = null; c.motivo = 'no verificable' }
    } else if (c.rol === 'var') {
      if (c.ref === 'anual') c.base = 'venta'
      else {
        const izq = cols[c.i - 1]
        c.base = izq && (izq.rol === 'cubiertos' || izq.rol === 'ordenes') ? izq.rol : 'venta'
      }
      if (!tiene(c.base) || (c.ref === 'anual' && !tiene('anterior'))) {
        c.rol = null; c.motivo = c.ref === 'anual' ? 'no verificable: no hay columna del año anterior' : 'no verificable'
      }
    }
  }
  for (const c of cols) {
    if (c.rol) continue
    if (c.n) agregar(sinMapear, c.motivo ? `${c.h} (${c.motivo})` : c.h)
  }
  return { cols, p, sinMapear }
}

export function interpretarHistorico(filas, { anio } = {}) {
  const meses = {}, anterior = {}, diferencias = []
  const hIdx = filaEncabezado(filas)
  if (hIdx < 0) return { meses, anterior, sinMapear: ['tabla sin columna PERIODO'], diferencias }
  const { cols, p, sinMapear } = clasificar(filas[hIdx], anio)
  const col = (rol) => cols.find((c) => c.rol === rol)
  const BASES = ['venta', 'anterior', 'cubiertos', 'ordenes']

  // Columnas sin encabezado con datos.
  const conDatos = (i) => filas.slice(hIdx + 1).some((f) => String(f?.[i] ?? '').trim())
  const ancho = Math.max(...filas.map((f) => f?.length || 0))
  for (let i = 0; i < ancho; i++) if (!cols[i]?.n && i !== p && conDatos(i)) agregar(sinMapear, `columna ${i + 1} sin encabezado`)

  const leidas = [] // { etiqueta, mes|null, total, fila, v: {venta, anterior, cubiertos, ordenes} }
  for (const fila of filas.slice(hIdx + 1)) {
    if (vacia(fila)) continue
    const etiqueta = String(fila[p] ?? '').trim()
    const v = {}
    for (const b of BASES) { const c = col(b); v[b] = c ? num(fila[c.i]) : null }
    if (esTotal(etiqueta)) { leidas.push({ etiqueta, mes: null, total: true, fila, v }); continue }
    const mes = leerPeriodo(etiqueta, anio)
    if (!mes) { agregar(sinMapear, `fila "${etiqueta}"`); continue }
    if (meses[mes] || leidas.some((l) => l.mes === mes)) { diferencias.push(`${mes}: la fila está repetida, se usa la primera`); continue }
    leidas.push({ etiqueta, mes, total: false, fila, v })
    const dato = {}
    if (v.venta != null) dato.venta = v.venta
    if (v.cubiertos != null) dato.cubiertos = v.cubiertos
    if (v.ordenes != null) dato.ordenes = v.ordenes
    if (Object.keys(dato).length) meses[mes] = dato
    const cAnt = col('anterior')
    if (cAnt && v.anterior != null) anterior[mesDe(cAnt.anio, Number(mes.slice(5)))] = { venta: v.anterior }
  }

  // Verificación de las columnas calculadas.
  const delMes = (m) => leidas.find((l) => l.mes === m)
  for (const l of leidas) {
    const quien = l.total ? l.etiqueta : l.mes
    for (const c of cols) {
      const celda = String(l.fila[c.i] ?? '').trim()
      const dice = num(celda)
      if (dice == null) continue
      if (c.rol === 'prom') {
        const base = l.v[c.base]
        if (l.v.venta == null || !base) continue
        const da = l.v.venta / base
        if (Math.abs(da - dice) > TOL_PESOS + EPS) diferencias.push(`${quien} ${c.h}: dice ${fmt(dice)}, da ${fmt(da)}`)
      } else if (c.rol === 'var' && !l.total) {
        const actual = l.v[c.base]
        const ref = c.ref === 'anual' ? l.v.anterior : delMes(mesPrevio(l.mes))?.v[c.base]
        if (actual == null || ref == null) continue
        if (celda.endsWith('%')) {
          const da = compararPct(actual, ref)
          if (da != null && Math.abs(da - dice) > TOL_PUNTOS + EPS) diferencias.push(`${quien} ${c.h}: dice ${fmt(dice, 2)}%, da ${fmt(da, 2)}%`)
        } else {
          const da = actual - ref
          if (Math.abs(da - dice) > TOL_PESOS + EPS) diferencias.push(`${quien} ${c.h}: dice ${fmt(dice)}, da ${fmt(da)}`)
        }
      } else if (l.total && BASES.includes(c.rol)) {
        const vals = leidas.filter((x) => !x.total).map((x) => x.v[c.rol]).filter((x) => x != null)
        const suma = vals.reduce((t, x) => t + x, 0)
        if (Math.abs(suma - dice) > TOL_PESOS + EPS) diferencias.push(`${quien} ${c.h}: dice ${fmt(dice)}, la suma de los meses da ${fmt(suma)}`)
      }
    }
  }
  return { meses, anterior, sinMapear, diferencias }
}

// ---------------------------------------------------------------------------
// Canales del mes: 'Canal de Venta | Importe | INC', con fila Total.

const nombreCanal = (s) => (norm(s) === 'LOCAL' ? 'Local' : String(s).trim())

export function interpretarCanales(filas) {
  const canales = {}, sinMapear = [], diferencias = []
  let total = null
  const incs = []
  const hIdx = filas.findIndex((f) => /^CANAL/.test(norm(f?.[0])))
  // Sin encabezado 'Canal de Venta', los datos empiezan en la primera fila con importe
  // (lo de arriba son títulos).
  const primera = filas.findIndex((f) => num(f?.[1]) != null)
  const datos = hIdx >= 0 ? filas.slice(hIdx + 1) : primera >= 0 ? filas.slice(primera) : []
  for (const fila of datos) {
    if (vacia(fila)) continue
    const nombre = String(fila[0] ?? '').trim()
    const valor = num(fila[1])
    if (esTotal(nombre)) {
      if (total != null) diferencias.push(`hay más de una fila ${nombre}`)
      else total = valor
      continue
    }
    if (valor == null) { agregar(sinMapear, `"${nombre}" sin importe`); continue }
    if (!nombre) { agregar(sinMapear, `importe ${fila[1]} sin nombre de canal`); continue }
    const n = nombreCanal(nombre)
    if (n in canales) { diferencias.push(`el canal "${n}" está dos veces`); continue }
    canales[n] = valor
    const inc = num(fila[2])
    if (inc != null) incs.push([n, valor, inc])
  }
  if (total == null) diferencias.push('no hay fila Total')
  else {
    const suma = Object.values(canales).reduce((t, v) => t + v, 0)
    if (Math.abs(suma - total) > TOL_PESOS + EPS) diferencias.push(`la suma de los canales da ${fmt(suma)}, el Total dice ${fmt(total)}`)
    for (const [n, valor, inc] of incs) {
      const da = total ? (valor / total) * 100 : null
      if (da != null && Math.abs(da - inc) > TOL_PUNTOS + EPS) diferencias.push(`INC de ${n}: dice ${fmt(inc, 2)}%, da ${fmt(da, 2)}%`)
    }
  }
  return { canales, total, sinMapear, diferencias }
}

// Canales en una fila (Gran Bar Danzon): encabezado 'VENTAS m-aaaa | (combinada) | LOCAL | EVENTOS | ...'
// y una fila por local con el total en la segunda columna.
export function interpretarCanalesHorizontal(filas) {
  const canales = {}, sinMapear = [], diferencias = []
  const [enc = [], ...resto] = filas
  const datos = resto.filter((f) => !vacia(f) && !esTotal(f[0]))
  const filaTotal = resto.find((f) => !vacia(f) && esTotal(f[0]))
  if (!datos.length) return { canales, total: null, sinMapear: ['tabla sin filas de datos'], diferencias }
  datos.slice(1).forEach((f) => agregar(sinMapear, `fila "${f[0]}" (se lee solo la primera fila)`))
  const fila = datos[0]
  const total = num(fila[1])
  for (let i = 2; i < enc.length; i++) {
    const nombre = String(enc[i] ?? '').trim()
    const valor = num(fila[i])
    if (!nombre) { if (valor != null) agregar(sinMapear, `columna ${i + 1} sin encabezado`); continue }
    if (/USD|U\$S|DOLAR/.test(norm(nombre))) { agregar(sinMapear, `${nombre} (otra moneda, no se carga${valor != null ? `: ${fila[i]}` : ''})`); continue }
    if (valor == null) { agregar(sinMapear, `${nombre} vacío`); continue }
    canales[nombreCanal(nombre)] = valor
  }
  if (total == null) diferencias.push('no hay total en la fila')
  else {
    const suma = Object.values(canales).reduce((t, v) => t + v, 0)
    if (Math.abs(suma - total) > TOL_PESOS + EPS) diferencias.push(`la suma de los canales da ${fmt(suma)}, el total dice ${fmt(total)}`)
  }
  if (filaTotal && datos.length === 1) {
    for (let i = 1; i < enc.length; i++) {
      const a = num(fila[i]), b = num(filaTotal[i])
      if (a != null && b != null && Math.abs(a - b) > TOL_PESOS + EPS) diferencias.push(`${filaTotal[0]} columna ${enc[i] || i + 1}: dice ${fmt(b)}, la fila dice ${fmt(a)}`)
    }
  }
  return { canales, total, sinMapear, diferencias }
}

// ---------------------------------------------------------------------------
// Delivery por aplicación (Togni's Café): 'PERIODO | VENTA DELIVERY | VARIABLE % MA |
// TICKET DELIVEY | VARIABLE TK % MA | <App> | TICKET | PROMEDIO | <App> | ...'.

export function interpretarDelivery(filas, { anio } = {}) {
  const meses = {}, sinMapear = [], diferencias = []
  const hIdx = filaEncabezado(filas)
  if (hIdx < 0) return { meses, sinMapear: ['tabla sin columna PERIODO'], diferencias }
  const enc = filas[hIdx]
  const p = enc.findIndex((c) => norm(c) === 'PERIODO')
  let totVenta = null, totTickets = null
  const vars = [] // { i, h, de: 'venta'|'tickets' }
  const apps = [] // { nombre, venta, tickets, prom }
  let app = null
  enc.forEach((h, i) => {
    const n = norm(h)
    if (i === p || !n) return
    if (/^(VARIABLE|VARIACION|EVOLUCION)/.test(n)) vars.push({ i, h: String(h).trim(), de: /\bTK\b|TICKET/.test(n) ? 'tickets' : 'venta' })
    else if (/^VENTA/.test(n) && !app) totVenta = i
    else if (/^TICKET/.test(n)) {
      if (!app) totTickets = i
      else if (app.tickets == null) app.tickets = i
      else agregar(sinMapear, `${String(h).trim()} (columna ${i + 1})`)
    } else if (/^PROM/.test(n)) {
      if (app && app.prom == null) app.prom = i
      else agregar(sinMapear, `${String(h).trim()} (columna ${i + 1})`)
    } else { app = { nombre: String(h).trim(), venta: i, tickets: null, prom: null }; apps.push(app) }
  })

  const leidas = []
  for (const fila of filas.slice(hIdx + 1)) {
    if (vacia(fila)) continue
    const etiqueta = String(fila[p] ?? '').trim()
    const total = esTotal(etiqueta)
    const mes = total ? null : leerPeriodo(etiqueta, anio)
    if (!total && !mes) { agregar(sinMapear, `fila "${etiqueta}"`); continue }
    const v = {
      totVenta: totVenta != null ? num(fila[totVenta]) : null,
      totTickets: totTickets != null ? num(fila[totTickets]) : null,
      apps: Object.fromEntries(apps.map((a) => [a.nombre, {
        venta: num(fila[a.venta]), tickets: a.tickets != null ? num(fila[a.tickets]) : null, prom: a.prom != null ? num(fila[a.prom]) : null,
      }])),
    }
    leidas.push({ etiqueta, mes, total, fila, v })
    if (mes) {
      const m = {}
      for (const [nombre, a] of Object.entries(v.apps)) {
        const d = {}
        if (a.venta != null) d.venta = a.venta
        if (a.tickets != null) d.tickets = a.tickets
        if (Object.keys(d).length) m[nombre] = d
      }
      if (Object.keys(m).length) meses[mes] = m
    }
  }

  const suma = (xs) => xs.reduce((t, x) => t + x, 0)
  const meses_ = leidas.filter((l) => !l.total)
  for (const l of leidas) {
    const quien = l.total ? l.etiqueta : l.mes
    const lista = Object.values(l.v.apps)
    if (l.total) {
      const chk = (dice, vals, que) => {
        if (dice == null) return
        const s = suma(vals.filter((x) => x != null))
        if (Math.abs(s - dice) > TOL_PESOS + EPS) diferencias.push(`${quien} ${que}: dice ${fmt(dice)}, la suma de los meses da ${fmt(s)}`)
      }
      chk(l.v.totVenta, meses_.map((x) => x.v.totVenta), 'venta delivery')
      chk(l.v.totTickets, meses_.map((x) => x.v.totTickets), 'tickets delivery')
      for (const a of apps) {
        chk(l.v.apps[a.nombre].venta, meses_.map((x) => x.v.apps[a.nombre].venta), `venta ${a.nombre}`)
        chk(l.v.apps[a.nombre].tickets, meses_.map((x) => x.v.apps[a.nombre].tickets), `tickets ${a.nombre}`)
      }
      continue
    }
    if (l.v.totVenta != null && lista.every((a) => a.venta != null)) {
      const s = suma(lista.map((a) => a.venta))
      if (Math.abs(s - l.v.totVenta) > TOL_PESOS + EPS) diferencias.push(`${quien} venta delivery: dice ${fmt(l.v.totVenta)}, la suma de las apps da ${fmt(s)}`)
    }
    if (l.v.totTickets != null && lista.every((a) => a.tickets != null)) {
      const s = suma(lista.map((a) => a.tickets))
      if (Math.abs(s - l.v.totTickets) > TOL_PESOS + EPS) diferencias.push(`${quien} tickets delivery: dice ${fmt(l.v.totTickets)}, la suma de las apps da ${fmt(s)}`)
    }
    for (const [nombre, a] of Object.entries(l.v.apps)) {
      if (a.prom == null || a.venta == null || !a.tickets) continue
      const da = a.venta / a.tickets
      if (Math.abs(da - a.prom) > TOL_PESOS + EPS) diferencias.push(`${quien} promedio ${nombre}: dice ${fmt(a.prom)}, da ${fmt(da)}`)
    }
    const previo = leidas.find((x) => x.mes === mesPrevio(l.mes))
    for (const va of vars) {
      const celda = String(l.fila[va.i] ?? '').trim()
      const dice = num(celda)
      const campo = va.de === 'tickets' ? 'totTickets' : 'totVenta'
      const actual = l.v[campo], ref = previo?.v[campo]
      if (dice == null || actual == null || ref == null) continue
      if (celda.endsWith('%')) {
        const da = compararPct(actual, ref)
        if (da != null && Math.abs(da - dice) > TOL_PUNTOS + EPS) diferencias.push(`${quien} ${va.h}: dice ${fmt(dice, 2)}%, da ${fmt(da, 2)}%`)
      } else {
        const da = actual - ref
        if (Math.abs(da - dice) > TOL_PESOS + EPS) diferencias.push(`${quien} ${va.h}: dice ${fmt(dice)}, da ${fmt(da)}`)
      }
    }
  }
  return { meses, sinMapear, diferencias }
}

// ---------------------------------------------------------------------------
// Varios locales en columnas (Gran Latino, TiAmo consolidado). `columnas` mapea
// el encabezado del deck al nombre del local en Analytics. Una columna TOTAL(ES)
// se verifica contra la suma de los locales, y sus evoluciones se verifican
// sobre el total. El año anterior del total no se reparte por local.

export function interpretarMulti(filas, { anio, columnas = {} } = {}) {
  const porLocal = {}, sinMapear = [], diferencias = []
  const hIdx = filaEncabezado(filas)
  if (hIdx < 0) return { porLocal, sinMapear: ['tabla sin columna PERIODO'], diferencias }
  const enc = filas[hIdx]
  const p = enc.findIndex((c) => norm(c) === 'PERIODO')
  const mapa = Object.fromEntries(Object.entries(columnas).map(([k, v]) => [norm(k), v]))
  const usadas = new Set([p])
  const delLocal = {} // local → índice de columna

  enc.forEach((h, i) => {
    const local = mapa[norm(h)]
    if (i === p || !local) return
    usadas.add(i)
    delLocal[local] = i
    const sub = filas.map((f, k) => (k === hIdx ? ['PERIODO', 'VENTAS'] : [f?.[p] ?? '', f?.[i] ?? '']))
    const r = interpretarHistorico(sub, { anio })
    porLocal[local] = { meses: r.meses }
    r.diferencias.forEach((d) => diferencias.push(`${String(h).trim()}: ${d}`))
    r.sinMapear.filter((s) => s.startsWith('fila')).forEach((s) => agregar(sinMapear, s))
  })
  for (const k of Object.keys(columnas)) if (!enc.some((h) => norm(h) === norm(k))) agregar(sinMapear, `columna "${k}" no está en la tabla`)

  const iTotal = enc.findIndex((h, i) => !usadas.has(i) && /^TOTAL(ES)?$/.test(norm(h)))
  if (iTotal < 0) {
    enc.forEach((h, i) => { if (!usadas.has(i) && norm(h)) agregar(sinMapear, String(h).trim()) })
    return { porLocal, sinMapear, diferencias }
  }
  // Total por fila = suma de los locales que tienen dato.
  for (const fila of filas.slice(hIdx + 1)) {
    if (vacia(fila)) continue
    const etiqueta = String(fila[p] ?? '').trim()
    const dice = num(fila[iTotal])
    if (dice == null) continue
    const vals = Object.values(delLocal).map((i) => num(fila[i])).filter((x) => x != null)
    if (!vals.length) continue
    const suma = vals.reduce((t, x) => t + x, 0)
    const quien = esTotal(etiqueta) ? etiqueta : (leerPeriodo(etiqueta, anio) || etiqueta)
    if (Math.abs(suma - dice) > TOL_PESOS + EPS) diferencias.push(`${quien} ${String(enc[iTotal]).trim()}: dice ${fmt(dice)}, la suma de los locales da ${fmt(suma)}`)
  }
  // El resto de las columnas se lee como un histórico del total (solo para verificar).
  const resto = enc.map((_, i) => i).filter((i) => i !== iTotal && !usadas.has(i))
  const sub = filas.map((f, k) => (k === hIdx
    ? ['PERIODO', 'VENTAS', ...resto.map((i) => enc[i])]
    : [f?.[p] ?? '', f?.[iTotal] ?? '', ...resto.map((i) => f?.[i] ?? '')]))
  const r = interpretarHistorico(sub, { anio })
  r.diferencias.forEach((d) => diferencias.push(`total: ${d.replace(/\bVENTAS\b/, String(enc[iTotal]).trim())}`))
  r.sinMapear.filter((s) => !s.startsWith('fila')).forEach((s) => agregar(sinMapear, s))
  const { cols } = clasificar(sub[hIdx], anio)
  const ant = cols.find((c) => c.rol === 'anterior')
  if (ant) agregar(sinMapear, `${ant.h} (año anterior del total, no se reparte por local)`)
  return { porLocal, sinMapear, diferencias }
}
