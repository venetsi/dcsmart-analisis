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

// '2026-08' -> 'Agosto 2026' (para los chips de los encabezados).
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
export function fmtMesLargo(mes) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes || ''))
  if (!m) return mes || ''
  return `${MESES[Number(m[2]) - 1]} ${m[1]}`
}

// Pesos con separador argentino: '$ 792.270.211'.
export function fmtPesos(v) {
  const n = Number(v)
  if (v === undefined || v === null || Number.isNaN(n)) return '—'
  return (n < 0 ? '-$ ' : '$ ') + Math.round(Math.abs(n)).toLocaleString('es-AR')
}

// Pesos abreviados para tarjetas y gráficos: '$ 792,3 M'. Debajo del millón,
// el importe entero.
export function fmtPesosCorto(v) {
  const n = Number(v)
  if (v === undefined || v === null || Number.isNaN(n)) return '—'
  const abs = Math.abs(n)
  if (abs < 1e6) return fmtPesos(n)
  const m = (abs / 1e6).toLocaleString('es-AR', { maximumFractionDigits: abs >= 1e8 ? 0 : 1 })
  return (n < 0 ? '-$ ' : '$ ') + m + ' M'
}

// Porcentaje con coma: 25.2 -> '25,2%'.
export function fmtPct(v, dec = 1) {
  const n = Number(v)
  if (v === undefined || v === null || Number.isNaN(n)) return '—'
  return n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%'
}
