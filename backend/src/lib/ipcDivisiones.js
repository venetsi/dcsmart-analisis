// IPC de INDEC para los indicadores del P&L (Trello #374): nivel general nacional y las divisiones COICOP que le
// corresponden a cada tipo de local. Series de la API de datos.gob.ar (base dic 2016, nacionales, mensuales).
// Decidido con el usuario el 24/11/2026: Gastronomía → 01, 02 y 11; Indumentaria → 03; otro tipo → solo nivel general.

export const SERIES_IPC = {
  general: { id: '148.3_INIVELNAL_DICI_M_26', nombre: 'Nivel general' },
  '01': { id: '146.3_IALIMENNAL_DICI_M_45', nombre: 'Alimentos y bebidas no alcohólicas' },
  '02': { id: '146.3_IBEBIDANAL_DICI_M_39', nombre: 'Bebidas alcohólicas y tabaco' },
  '03': { id: '146.3_IPRENDANAL_DICI_M_35', nombre: 'Prendas de vestir y calzado' },
  11: { id: '146.3_IRESTAUNAL_DICI_M_33', nombre: 'Restaurantes y hoteles' },
}

export const DIVISIONES_POR_TIPO = {
  Gastronomía: ['01', '02', '11'],
  Indumentaria: ['03'],
}

const URL = 'https://apis.datos.gob.ar/series/api/series/'
const CODIGOS = ['general', '01', '02', '03', '11']

export function divisionesDe (tiposLocal = []) {
  const out = []
  for (const t of tiposLocal) for (const c of DIVISIONES_POR_TIPO[t] || []) if (!out.includes(c)) out.push(c)
  return out.sort()
}

const r1 = (x) => Math.round(x * 10) / 10
const pct = (a, b) => (a > 0 && b > 0 ? r1((a / b - 1) * 100) : null)
function mesMenos (mes, n) {
  let [y, m] = mes.split('-').map(Number)
  m -= n
  while (m < 1) { m += 12; y-- }
  return `${y}-${String(m).padStart(2, '0')}`
}

// filas: [['2026-10-01', v_general, v_01, ...]] en el orden de CODIGOS. Devuelve el último mes con dato <= `mes`
// y, por serie: índice, variación mensual e interanual, y las del mes anterior (para los puntos de diferencia).
export function armarIpc (filas, mes, codigos = CODIGOS) {
  const porMes = new Map()
  for (const f of filas || []) if (Array.isArray(f) && typeof f[0] === 'string') porMes.set(f[0].slice(0, 7), f.slice(1))
  const meses = [...porMes.keys()].filter((m) => m <= mes).sort()
  const ultimo = meses.at(-1)
  if (!ultimo) return null
  const valor = (m, i) => { const v = porMes.get(m)?.[i]; return Number.isFinite(v) ? v : null }
  const serie = (i) => {
    const v = valor(ultimo, i)
    const ant = mesMenos(ultimo, 1)
    return {
      indice: v,
      mensual: pct(v, valor(ant, i)),
      interanual: pct(v, valor(mesMenos(ultimo, 12), i)),
      mensual_previo: pct(valor(ant, i), valor(mesMenos(ultimo, 2), i)),
      interanual_previo: pct(valor(ant, i), valor(mesMenos(ultimo, 13), i)),
    }
  }
  const general = { codigo: 'general', nombre: SERIES_IPC.general.nombre, ...serie(0) }
  const divisiones = codigos.slice(1).map((c, k) => {
    const s = { codigo: c, nombre: SERIES_IPC[c].nombre, ...serie(k + 1) }
    // Contra el nivel general, comparando como se muestra (un decimal).
    s.vs_general = s.mensual == null || general.mensual == null ? null
      : s.mensual > general.mensual ? 'sobre' : s.mensual < general.mensual ? 'bajo' : 'promedio'
    return s
  })
  return { mes_dato: ultimo, general, divisiones }
}

// pedir(url) → JSON. Cachea la respuesta de INDEC 6 horas (publica una vez por mes).
export function crearIpcDivisiones ({ pedir = pedirJson, ahora = () => Date.now() } = {}) {
  let cache = null
  return async function leer (mes, tiposLocal = []) {
    if (!cache || ahora() - cache.at > 6 * 60 * 60 * 1000) {
      const desde = `${mesMenos(new Date().toISOString().slice(0, 7), 30)}-01`
      const ids = CODIGOS.map((c) => SERIES_IPC[c].id).join(',')
      const json = await pedir(`${URL}?ids=${ids}&start_date=${desde}&format=json&limit=1000`)
      cache = { at: ahora(), filas: json?.data || [] }
    }
    const ipc = armarIpc(cache.filas, mes)
    if (!ipc) return null
    const quiero = divisionesDe(tiposLocal)
    return { ...ipc, divisiones: ipc.divisiones.filter((d) => quiero.includes(d.codigo)) }
  }
}

async function pedirJson (url) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 8000)
  try {
    const r = await fetch(url, { signal: ctl.signal })
    if (!r.ok) throw new Error(`INDEC respondió ${r.status}`)
    return await r.json()
  } finally { clearTimeout(t) }
}
