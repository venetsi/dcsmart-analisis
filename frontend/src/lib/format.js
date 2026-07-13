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

// BigQuery DATE ("2026-07-13") o TIMESTAMP ISO — muestra DD/MM/AAAA en vez del
// formato ISO/inglés crudo que devuelve el backend.
export function fmtDate(v) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  // Un DATE de BigQuery ("2026-07-13", sin hora) se interpreta en UTC — usar
  // getUTCDate/Month/FullYear evita que timezones negativos lo corran un día.
  const hasTime = typeof v === 'string' && v.includes('T')
  const day   = String(hasTime ? d.getDate()      : d.getUTCDate()).padStart(2, '0')
  const month = String((hasTime ? d.getMonth()    : d.getUTCMonth()) + 1).padStart(2, '0')
  const year  = hasTime ? d.getFullYear() : d.getUTCFullYear()
  return `${day}/${month}/${year}`
}

// Igual que fmtDate pero agrega hora:minuto (para columnas con hora real, ej.
// fecha_inicio/fecha_cierre de un turno de caja).
export function fmtDateTime(v) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  const date = fmtDate(v)
  const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return `${date} ${time}`
}
