// Reglas puras del Reporte de Ventas mensual (sin base ni red, para poder testearlas).

export const okMes = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '')

// Interno = personal de DCSMART. El is_admin de un usuario externo no cuenta.
export const esInterno = (user) => {
  const roles = Array.isArray(user?.roles) ? user.roles : []
  return roles.includes('super_admin') || roles.includes('dcsmart')
}

// Datos que se pueden cargar a mano. "canal:Local" es calculado (venta - resto).
export function normalizarDato (d) {
  if (typeof d !== 'string') return null
  if (d === 'venta' || d === 'cubiertos' || d === 'ordenes') return d
  const m = /^(canal|tickets):(.+)$/s.exec(d)
  if (!m) return null
  const nombre = m[2].trim()
  if (!nombre || nombre.length > 40) return null
  if (m[1] === 'canal' && nombre === 'Local') return null
  return `${m[1]}:${nombre}`
}
export const okDato = (d) => normalizarDato(d) !== null

// Solo se cierra un mes ya terminado (en hora UTC, como el resto del sistema).
export const mesCerrable = (mes, hoy = new Date()) => okMes(mes) && mes < hoy.toISOString().slice(0, 7)

// Primer día de enero del año anterior a `mes`, y último día de `mes`.
export function rangoReporte (mes) {
  const [y, m] = mes.split('-').map(Number)
  return { desde: `${y - 1}-01-01`, hasta: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
}

// Nombres para mostrar: { local: texto 1-60 }, solo de los locales del cliente.
// undefined si no vino (no se toca); null si es inválido.
export function nombresOk (v, locales) {
  if (v === undefined) return undefined
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const out = {}
  for (const [k, t] of Object.entries(v)) {
    if (!locales.includes(k)) continue
    if (typeof t !== 'string') return null
    const n = t.trim()
    if (!n) continue
    if (n.length > 60) return null
    out[k] = n
  }
  return out
}

// Logos de los locales ({ local: data URL }). undefined = no se tocan; null = inválido.
// Solo imágenes en base64 (PNG, JPG o WEBP) de hasta 400 KB cada una.
export const LOGO_MAX = 400 * 1024
const RE_LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/
export function logosOk (v, locales) {
  if (v === undefined) return undefined
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const out = {}
  for (const [k, t] of Object.entries(v)) {
    if (!locales.includes(k)) continue
    if (t === null || t === '') continue
    if (typeof t !== 'string' || t.length > LOGO_MAX || !RE_LOGO.test(t)) return null
    out[k] = t
  }
  return out
}

// Foto de un cierre: { locales: { L: {...} } }, con locales objeto (no arreglo).
export function snapshotOk (s) {
  const plano = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
  return plano(s) && plano(s.locales)
}

// ¿La foto del mes cerrado ya trae ese dato del local? Lo que trae no se edita
// sin reabrir; lo que no trae se puede completar a mano. `dato` normalizado.
export function datoEnSnapshot (snapshot, local, dato) {
  const l = snapshot?.locales?.[local]
  if (!l || typeof l !== 'object') return false
  const m = /^(canal|tickets):(.+)$/s.exec(dato)
  if (!m) return l[dato] != null
  const grupo = m[1] === 'canal' ? l.canales : l.tickets
  return grupo != null && typeof grupo === 'object' && grupo[m[2]] != null
}

// Las reglas por origen de caja son solo para la carga manual (DCSMART): las
// cajas de TapTap o Fudo ya traen sus cobros por método y se contarían dos veces.
export const ORIGEN_MANUAL = 'DCSMART'
export const okOrigenRegla = (valor) => typeof valor === 'string' && valor.trim().toUpperCase() === ORIGEN_MANUAL

// Datos de operación que se corrigen libremente, aunque el mes esté cerrado:
// cubiertos, órdenes y tickets de cada app. Lo corregido a mano le gana a la foto.
export const datoLibre = (dato) => dato === 'cubiertos' || dato === 'ordenes' || /^tickets:/.test(dato || '')

// Observación de una hoja: texto de hasta OBS_MAX caracteres (vacío = borrarla).
// pagina = el id de la hoja ('sintesis', 'mes:LOCAL', 'pyl_acumulado:LOCAL:1', ...).
export const OBS_MAX = 280
export const paginaOk = (p) => typeof p === 'string' && /^[a-zA-Z][a-zA-Z_]*(:[^\n]{1,120})?$/.test(p)
export function obsOk (v) {
  if (typeof v !== 'string') return null
  const t = v.replace(/\r\n?/g, '\n').trim()
  return t.length <= OBS_MAX ? t : null
}

// Inflación mensual cargada a mano: % entre -50 y 100 (null = volver a la de INDEC).
export const ipcOk = (v) => v === null || (typeof v === 'number' && Number.isFinite(v) && v > -50 && v < 100)

// Serie del índice ([['2025-01-01', 7864.1], ...], ordenada) → variación mensual en %
// por mes: { '2025-01': 2.2109 }. El primer punto solo sirve de base.
export function variacionesIpc (serie) {
  const out = {}
  const pts = (serie || []).filter((p) => Array.isArray(p) && typeof p[0] === 'string' && Number.isFinite(p[1]) && p[1] > 0)
  for (let i = 1; i < pts.length; i++) {
    const mes = pts[i][0].slice(0, 7)
    const previo = pts[i - 1][0].slice(0, 7)
    if (mesSiguiente(previo) !== mes) continue // un hueco en la serie no se salta
    out[mes] = Math.round((pts[i][1] / pts[i - 1][1] - 1) * 1e6) / 1e4
  }
  return out
}
function mesSiguiente (mes) {
  const [y, m] = mes.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
