// Formatos del Informe mensual. Regla de oro: un dato que no está es null y se muestra "—",
// nunca 0. Por eso no se usan fmtPct / fmtMonto de lib/informe.js, que imprimen 0.
import { fmtAR } from './reporteVentas.js'

export const MENOS = '−'
const NBSP = String.fromCharCode(160) // el $ no se separa del número

const esNum = (v) => v != null && Number.isFinite(v)

// Signo de un número ya formateado: el menos solo si queda algún dígito distinto de cero.
function signoDe(v, abs, signo) {
  if (v < 0 && /[1-9]/.test(abs)) return MENOS
  return signo && v > 0 ? '+' : ''
}

// Número entero (o con decimales). null → "—".
export function fmtNumIm(v, { dec = 0, signo = false } = {}) {
  if (!esNum(v)) return '—'
  const abs = fmtAR(Math.abs(v), dec)
  return `${signoDe(v, abs, signo)}${abs}`
}

// Pesos: "$ 1.234" y, en negativo, "−$ 1.234". null → "—".
export function fmtPesosIm(v, { signo = false } = {}) {
  if (!esNum(v)) return '—'
  const abs = fmtAR(Math.abs(Math.round(v)))
  return `${signoDe(v, abs, signo)}$${NBSP}${abs}`
}

// Porcentaje con 2 decimales y coma: "26,42%". null → "—".
export function fmtPctIm(v, { signo = false } = {}) {
  if (!esNum(v)) return '—'
  const abs = fmtAR(Math.abs(v), 2)
  return `${signoDe(v, abs, signo)}${abs}%`
}

// Puntos porcentuales: "1,02 pts", con signo "+1,02 pts". null → "—".
export function fmtPtsIm(v, { signo = false } = {}) {
  if (!esNum(v)) return '—'
  const abs = fmtAR(Math.abs(v), 2)
  return `${signoDe(v, abs, signo)}${abs} pts`
}

// Flecha de una diferencia. Sin diferencia (null) no hay flecha.
export function flechaIm(dif) {
  if (!esNum(dif)) return ''
  return dif > 0 ? '▲' : dif < 0 ? '▼' : '='
}

// Color de una diferencia: 'pos' (verde), 'neg' (rojo) o null.
// Costos: que suban es malo (rojo). Resultados y ventas: al revés.
export function tonoIm(dif, sentido = 'resultado') {
  if (!esNum(dif) || dif === 0) return null
  const sube = dif > 0
  return (sentido === 'costo' ? !sube : sube) ? 'pos' : 'neg'
}

// ---------------------------------------------------------------------------
// Meses

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export const nombreMesIm = (mes) => MESES[Number(String(mes).slice(5, 7)) - 1] || ''
// '2026-09' → 'Septiembre 2026'
export const mesEnPalabrasIm = (mes) => (mes ? `${nombreMesIm(mes)} ${String(mes).slice(0, 4)}` : '')
export const mesSiguienteIm = (mes) => {
  const [a, m] = mes.split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}
// '2026-09' → '01/09/2026 – 30/09/2026'
export function periodoIm(mes) {
  const [a, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  return `01/${mm}/${a} – ${ultimo}/${mm}/${a}`
}
