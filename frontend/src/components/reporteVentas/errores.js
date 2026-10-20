// Mensajes de error del Reporte de Ventas: en castellano y sin códigos ni jerga.
export function msgError(e) {
  const m = e?.message || ''
  if (e?.status === 0) return 'No se pudo conectar con el servidor. Revisá tu conexión y probá de nuevo.'
  if (e?.status === 401) return 'Tu sesión venció. Volvé a entrar.'
  if (e?.status === 403) return 'Solo el equipo DC puede hacer esto.'
  if (!m || /^Error \d+$/.test(m) || e?.status >= 500) return 'No se pudo completar la operación. Probá de nuevo en un momento.'
  return m
}
