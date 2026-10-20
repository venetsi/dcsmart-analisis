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
