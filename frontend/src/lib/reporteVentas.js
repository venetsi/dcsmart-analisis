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
  if (par) { neg = true; t = par[1].trim() }
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
