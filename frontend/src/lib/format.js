export function fmtMoney(v) {
  const n = Number(v)
  if (v === undefined || v === null || Number.isNaN(n)) return '—'
  const abs = Math.abs(n)
  return '$' + (abs >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : Math.round(n).toLocaleString('es-AR'))
}

export function fmtNum(v) {
  const n = Number(v)
  if (v === undefined || v === null || Number.isNaN(n)) return '—'
  return n.toLocaleString('es-AR')
}
