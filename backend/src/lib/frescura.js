// Frescura de los datos: cuándo fue el último movimiento de gestión que ya
// está en la réplica en vivo. Lo muestra la barra lateral ("Datos al HH:MM").

// Sin datos (consulta fallida o réplica vacía): el badge tolera ultimoDato null.
export const SIN_DATO = Object.freeze({ ultimoDato: null, demoraMin: null, fuente: 'cdc' })

// ultimoDato: Date | string ISO | null. ahora: para los tests.
export function armarFrescura(ultimoDato, ahora = new Date()) {
  if (!ultimoDato) return { ...SIN_DATO }
  const d = ultimoDato instanceof Date ? ultimoDato : new Date(ultimoDato)
  if (Number.isNaN(d.getTime())) return { ...SIN_DATO }
  const demoraMin = Math.max(0, Math.round((ahora.getTime() - d.getTime()) / 60000))
  return { ultimoDato: d.toISOString(), demoraMin, fuente: 'cdc' }
}
