// Reporte de Ventas mensual. Lógica pura (sin React ni DOM), testeable con node:test.

// Lee un número como lo escriben los decks: '55.114.440', '(14.352.110)' (negativo),
// '-4,34%', '81,26%'. El punto es separador de miles y la coma el decimal.
// Devuelve null si no es un número ('N/A', vacío).
export function parseNumeroAR(s) {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null
  if (typeof s !== 'string') return null
  let t = s.trim().replace(/%$/, '').trim()
  if (!t) return null
  let neg = false
  const par = t.match(/^\((.*)\)$/)
  if (par) {
    neg = true; t = par[1].trim()
    if (t.startsWith('-')) return null // '(-5)': dos signos, no se adivina
  }
  if (!/^-?\d+(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(t)) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

// Formato de los decks: miles con punto, decimal con coma. Los importes enteros
// negativos van entre paréntesis; con decimales (porcentajes) llevan signo '-'.
export function fmtAR(n, decimales = 0) {
  if (n == null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
  if (n < 0 && Number(abs.replace(/\./g, '').replace(',', '.')) !== 0) return decimales > 0 ? `-${abs}` : `(${abs})`
  return abs
}

// ---------------------------------------------------------------------------
// Motor del reporte. Regla de oro: un dato que no está es null con fuente
// 'falta', nunca 0. Los porcentajes van en unidades de % con 2 decimales
// (17.44 = 17,44%).

// Métodos de cobro que son apps de delivery (misma lista que gestión).
export const ES_APP_RE = /^(rappi|pedidos\s*ya|peya|mp\s*delivery|uber\s*eats)(\s+efectivo)?$/i

const LOCAL = 'Local'

// Fudo escribe 'Pedido Ya' (singular), que ES_APP_RE (igual a gestión) no toma.
const ALIAS_APP_RE = /^pedido\s*ya(\s+efectivo)?$/i

// ¿El método de cobro es una app de delivery?
function esApp(metodo) {
  return ES_APP_RE.test(metodo) || ALIAS_APP_RE.test(metodo)
}

// Número que viene de la base o de BigQuery (number o string '123.45').
// Los textos con formato AR van por parseNumeroAR; acá no.
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v)
  return null
}

// Redondeo simétrico a 2 decimales (el -0 se devuelve como 0).
function r2(x) {
  if (x == null || !Number.isFinite(x)) return null
  const r = (Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-9)) / 100
  return r === 0 ? 0 : r
}

// a / b en %, o null si falta alguno o el divisor es 0.
function pct(a, b) {
  if (a == null || b == null || b === 0) return null
  return r2((a / b) * 100)
}

// Variación de a respecto de b en %, o null.
function variacion(a, b) {
  if (a == null || b == null || b === 0) return null
  return r2(((a - b) / b) * 100)
}

function dividir(a, b) {
  if (a == null || b == null || b === 0) return null
  return a / b
}

function nombreApp(metodo) {
  const base = metodo.trim().replace(/\s+efectivo$/i, '').toLowerCase().replace(/\s+/g, '')
  if (base === 'rappi') return 'Rappi'
  if (base === 'pedidosya' || base === 'pedidoya' || base === 'peya') return 'Pedidos Ya'
  if (base === 'mpdelivery') return 'MP Delivery'
  if (base === 'ubereats') return 'Uber Eats'
  return metodo.trim()
}

function mismoTexto(a, b) {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
}

// Canales automáticos del mes a partir de los cobros y de las cajas.
// Lo que no tiene regla ni es app queda dentro de "Local" (no se lista).
export function canalesAuto({ detalles = [], cajasOrigen = [], reglas = [] }) {
  const out = new Map()
  const sumar = (nombre, valor, delivery) => {
    const v = num(valor)
    if (v == null) return
    const c = out.get(nombre)
    if (c) c.valor = r2(c.valor + v)
    else out.set(nombre, { nombre, valor: r2(v), delivery: !!delivery })
  }
  for (const d of detalles) {
    const metodo = String(d.metodo ?? '').trim()
    const regla = reglas.find((r) => r.match === 'metodo' && mismoTexto(r.valor, metodo))
    if (regla) sumar(regla.canal, d.monto, regla.delivery)
    else if (esApp(metodo)) sumar(nombreApp(metodo), d.monto, true)
  }
  for (const c of cajasOrigen) {
    const regla = reglas.find((r) => r.match === 'origen' && mismoTexto(r.valor, c.origin))
    if (regla) sumar(regla.canal, c.total, regla.delivery)
  }
  return [...out.values()]
}

function mesDe(anio, m) { return `${anio}-${String(m).padStart(2, '0')}` }
function mesPrevio(mes) {
  const [a, m] = mes.split('-').map(Number)
  return m === 1 ? mesDe(a - 1, 12) : mesDe(a, m - 1)
}
function mesAnioAnterior(mes) {
  const [a, m] = mes.split('-').map(Number)
  return mesDe(a - 1, m)
}

// Arma un local para el mes: venta, cubiertos, órdenes, canales con incidencia,
// histórico del año y delivery por app. Ver la forma de LocalMes en el plan.
//   auto: { meses: { 'YYYY-MM': { venta, cubiertos, ordenes, tickets? } }, canales: { 'YYYY-MM': [{ nombre, valor, delivery }] } }
//   `tickets` (opcional) es { [app]: n }: tickets de delivery por app, para el
//   ticket promedio de cada app. NO es un alias de `ordenes` (órdenes del local).
//   Hoy no hay fuente automática (caja_detalles.cantidad no se expone): se
//   cargan a mano como dato `tickets:<app>`; el campo queda para cuando exista.
export function armarLocal({ local, mes, auto = {}, valores = [], cierres = [] }) {
  const autoMeses = auto.meses || {}
  const autoCanales = auto.canales || {}

  const snap = (m) => {
    const c = cierres.find((x) => x.mes === m)
    return c ? (c.snapshot?.locales?.[local] ?? null) : undefined // undefined = mes sin cerrar
  }
  const mano = (m, dato) => valores.find((v) => v.local === local && v.mes === m && v.dato === dato)
  const datoMano = (row, autoValor) => {
    const d = { valor: num(row.valor), fuente: 'mano' }
    const original = row.original != null ? num(row.original) : autoValor
    if (original != null) d.original = original
    if (row.actualizado_por) d.por = row.actualizado_por
    if (row.actualizado_at) d.at = row.actualizado_at
    return d
  }

  // Resuelve un dato: cerrado > mano > auto > falta. En un mes cerrado, lo que
  // la foto no trae se puede cargar a mano; si no, falta (no se toma lo de hoy).
  const resolver = (m, dato, valorCerrado, autoValor) => {
    const s = snap(m)
    if (s !== undefined && num(valorCerrado) != null) return { valor: num(valorCerrado), fuente: 'cerrado' }
    const row = mano(m, dato)
    if (row) return datoMano(row, s !== undefined ? null : autoValor)
    if (s === undefined && autoValor != null) return { valor: autoValor, fuente: 'auto' }
    return { valor: null, fuente: 'falta' }
  }

  const datoBase = (m, campo) => resolver(m, campo, snap(m)?.[campo], num(autoMeses[m]?.[campo]))

  // Delivery de un canal sin bandera propia: el de algún mes automático, o si es app.
  const deliveryDe = (nombre) => {
    for (const lista of Object.values(autoCanales)) {
      const c = (lista || []).find((x) => x.nombre === nombre)
      if (c) return !!c.delivery
    }
    return esApp(nombre)
  }

  // Canales del mes, con "Local" último.
  const canalesDe = (m, venta) => {
    const s = snap(m)
    const auto = s === undefined ? (autoCanales[m] || []) : []
    const nombres = []
    const agregar = (n) => { if (n && n !== LOCAL && !nombres.includes(n)) nombres.push(n) }
    if (s) Object.keys(s.canales || {}).forEach(agregar)
    auto.forEach((c) => agregar(c.nombre))
    valores.filter((v) => v.local === local && v.mes === m && String(v.dato).startsWith('canal:'))
      .forEach((v) => agregar(v.dato.slice('canal:'.length)))

    const lista = nombres.map((nombre) => {
      const a = auto.find((c) => c.nombre === nombre)
      const d = resolver(m, `canal:${nombre}`, s?.canales?.[nombre], a ? num(a.valor) : null)
      return { nombre, ...d, delivery: a ? !!a.delivery : deliveryDe(nombre) }
    })

    // "Local" de la foto vale solo si nada se cargó a mano después del cierre;
    // si hay un canal a mano, Local lo absorbe y se recalcula. Un canal sin
    // valor no cuenta como 0: Local queda en falta.
    let localDato
    const localCerrado = num(s?.canales?.[LOCAL])
    const hayMano = lista.some((c) => c.fuente === 'mano')
    if (localCerrado != null && !hayMano) localDato = { valor: localCerrado, fuente: 'cerrado' }
    else if (venta.valor == null || lista.some((c) => c.valor == null)) localDato = { valor: null, fuente: 'falta' }
    else {
      const otros = lista.reduce((t, c) => t + (c.valor ?? 0), 0)
      localDato = { valor: r2(venta.valor - otros), fuente: 'calc' }
    }
    lista.push({ nombre: LOCAL, ...localDato, delivery: false })
    return lista.map((c) => ({ ...c, inc: pct(c.valor, venta.valor) }))
  }

  const ticketsDe = (m, app) => resolver(m, `tickets:${app}`, snap(m)?.tickets?.[app], num(autoMeses[m]?.tickets?.[app]))

  const anio = Number(mes.slice(0, 4))
  const hasta = Number(mes.slice(5, 7))
  const meses = Array.from({ length: hasta }, (_, i) => mesDe(anio, i + 1))

  const historico = meses.map((m) => {
    const venta = datoBase(m, 'venta')
    const cubiertos = datoBase(m, 'cubiertos')
    const ordenes = datoBase(m, 'ordenes')
    const previo = datoBase(mesPrevio(m), 'venta').valor
    const anterior = datoBase(mesAnioAnterior(m), 'venta').valor
    return {
      mes: m, venta, anterior, previo,
      varPesos: venta.valor != null && previo != null ? r2(venta.valor - previo) : null,
      varPct: variacion(venta.valor, previo),
      varAnual: variacion(venta.valor, anterior),
      cubiertos, ordenes,
      promCubierto: dividir(venta.valor, cubiertos.valor),
      promOrden: dividir(venta.valor, ordenes.valor),
    }
  })
  const actual = historico[historico.length - 1]

  const deliveryMes = (m) => {
    const venta = datoBase(m, 'venta')
    const apps = {}
    let total = null
    for (const c of canalesDe(m, venta)) {
      if (!c.delivery || c.valor == null) continue
      const tickets = ticketsDe(m, c.nombre).valor
      apps[c.nombre] = { venta: c.valor, tickets, prom: dividir(c.valor, tickets) }
      total = r2((total ?? 0) + c.valor)
    }
    return { mes: m, apps, total }
  }
  let prevDelivery = deliveryMes(mesPrevio(meses[0])).total
  const delivery = meses.map((m) => {
    const d = deliveryMes(m)
    const fila = { ...d, varPct: variacion(d.total, prevDelivery) }
    prevDelivery = d.total
    return fila
  })

  const canales = canalesDe(mes, actual.venta)
  const alertas = []
  if (actual.venta.valor == null) alertas.push(`${local}: falta la venta del mes`)
  const localCanal = canales[canales.length - 1]
  if (localCanal.valor != null && localCanal.valor < 0) alertas.push(`${local}: Local queda negativo`)

  return {
    local,
    venta: actual.venta, cubiertos: actual.cubiertos, ordenes: actual.ordenes,
    promCubierto: actual.promCubierto, promOrden: actual.promOrden,
    canales, historico, delivery, alertas,
  }
}

function mesDeFecha(d) {
  return mesDe(d.getFullYear(), d.getMonth() + 1)
}

// Suma que no inventa: si falta un sumando, el total falta.
function sumaEstricta(vals) {
  return vals.length && vals.every((v) => v != null) ? r2(vals.reduce((t, v) => t + v, 0)) : null
}

// Arma el reporte del cliente: locales, consolidado (si hay más de uno),
// páginas y si se puede cerrar el mes. `hoy` decide si el mes terminó.
// También acepta `cierres` (parte de la interfaz), pero no lo usa: los cierres
// ya entran en cada LocalMes por armarLocal.
export function armarReporte({ cliente, mes, porLocal, hoy = new Date() }) {
  const nombres = (cliente?.locales?.length ? cliente.locales : Object.keys(porLocal)).filter((l) => porLocal[l])
  const locales = nombres.map((l) => porLocal[l])

  let consolidado = null
  if (locales.length > 1) {
    const total = sumaEstricta(locales.map((l) => l.venta.valor))
    const filas = locales.map((l) => ({ local: l.local, valor: l.venta.valor, inc: pct(l.venta.valor, total) }))
    const historico = locales[0].historico.map((h0, i) => {
      const filasMes = locales.map((l) => l.historico[i])
      const totalMes = sumaEstricta(filasMes.map((h) => h.venta.valor))
      const previo = sumaEstricta(filasMes.map((h) => h.previo))
      const anterior = sumaEstricta(filasMes.map((h) => h.anterior))
      return {
        mes: h0.mes,
        porLocal: Object.fromEntries(locales.map((l) => [l.local, l.historico[i].venta.valor])),
        total: totalMes, anterior,
        varPct: variacion(totalMes, previo), varAnual: variacion(totalMes, anterior),
      }
    })
    consolidado = { filas, total, historico }
  }

  const paginas = [{ id: 'portada', tipo: 'portada' }]
  if (consolidado) paginas.push({ id: 'consolidado', tipo: 'consolidado' })
  for (const l of locales) {
    paginas.push({ id: `mes:${l.local}`, tipo: 'mes', local: l.local })
    paginas.push({ id: `historico:${l.local}`, tipo: 'historico', local: l.local })
    const hayDelivery = l.delivery.some((d) => Object.values(d.apps).some((a) => a.venta != null && a.venta !== 0))
    if (hayDelivery) paginas.push({ id: `delivery:${l.local}`, tipo: 'delivery', local: l.local })
  }
  paginas.push({ id: 'contraportada', tipo: 'contraportada' })

  const motivos = []
  if (!(mes < mesDeFecha(hoy))) motivos.push(`El mes ${mes} todavía no terminó`)
  for (const l of locales) {
    const c = l.canales.find((x) => x.nombre === LOCAL)
    if (c && c.valor != null && c.valor < 0) motivos.push(`${l.local}: Local queda negativo`)
  }

  return { cliente, mes, locales, consolidado, paginas, puedeCerrar: motivos.length === 0, motivos }
}

// Foto del mes para guardar al cerrar: solo valores, sin fuentes.
export function snapshotDe(reporte) {
  const locales = {}
  for (const l of reporte.locales) {
    const del = l.delivery.find((d) => d.mes === reporte.mes)
    const tickets = {}
    for (const [app, a] of Object.entries(del?.apps || {})) if (a.tickets != null) tickets[app] = a.tickets
    locales[l.local] = {
      venta: l.venta.valor, cubiertos: l.cubiertos.valor, ordenes: l.ordenes.valor,
      canales: Object.fromEntries(l.canales.filter((c) => c.valor != null).map((c) => [c.nombre, c.valor])),
      tickets,
    }
  }
  return { locales }
}
