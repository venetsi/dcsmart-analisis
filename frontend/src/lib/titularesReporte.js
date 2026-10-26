// Titulares del Reporte de Ventas: frases cortas armadas solo con los números de la
// hoja (sin opinión). Si falta el dato, la frase lo dice o se omite esa parte.
import { fmtAR } from './reporteVentas.js'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']

const esNum = (v) => v != null && Number.isFinite(v)
const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1)
const nombreMes = (mes) => MESES[Number(mes.slice(5, 7)) - 1]
function mesPrevio(mes) {
  const [a, m] = mes.split('-').map(Number)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
}

// 151736690 → '$ 151,7 millones'; por debajo del millón, el importe entero.
export function enMillones(v) {
  if (!esNum(v)) return '—'
  if (Math.abs(v) < 1e6) return `$ ${fmtAR(Math.round(v))}`
  return `$ ${fmtAR(v / 1e6, 1)} millones`
}

// Porcentaje redondeado al entero, sin signo: 47,39 → '47%'.
const pctEntero = (v) => `${fmtAR(Math.round(Math.abs(v)))}%`

// "Septiembre cerró en $ 151,7 millones: 47% más que hace un año y casi en línea con agosto."
export function titularSintesis({ mes, venta, varAnual, varPct }) {
  const nombre = mayus(nombreMes(mes))
  if (!esNum(venta)) return `Falta la venta de ${nombreMes(mes)} para armar el resumen.`
  const partes = []
  if (esNum(varAnual)) {
    if (Math.abs(varAnual) < 1) partes.push('casi igual que hace un año')
    else partes.push(`${pctEntero(varAnual)} ${varAnual > 0 ? 'más' : 'menos'} que hace un año`)
  }
  if (esNum(varPct)) {
    const prev = nombreMes(mesPrevio(mes))
    if (Math.abs(varPct) < 5) partes.push(`casi en línea con ${prev}`)
    else partes.push(`${pctEntero(varPct)} ${varPct > 0 ? 'arriba' : 'abajo'} de ${prev}`)
  }
  const base = `${nombre} cerró en ${enMillones(venta)}`
  return partes.length ? `${base}: ${partes.join(' y ')}.` : `${base}.`
}

// Canal (o local) que más vende y cuánto pesa: [{ nombre, valor, inc }].
function primero(filas) {
  return [...filas].filter((f) => esNum(f.valor) && esNum(f.inc))
    .sort((a, b) => b.valor - a.valor)[0] || null
}

export function titularCanales(canales) {
  const p = primero(canales)
  if (!p) return 'Ventas por canal'
  if (p.inc >= 99.995) return `${p.nombre} concentra toda la venta`
  if (p.inc >= 95) return `${p.nombre} concentra casi toda la venta`
  if (p.inc >= 60) return `${p.nombre} concentra la mayor parte de la venta`
  return `${p.nombre} es el canal que más vende`
}

export function titularConsolidado(filas) {
  const p = primero(filas)
  if (!p) return 'Venta por local'
  return `${p.nombre} hizo el ${pctEntero(p.inc)} de la venta del grupo`
}

// filas: [{ mes, venta, anterior }]
export function titularComparativo(filas, anio) {
  const pares = filas.filter((f) => esNum(f.venta) && esNum(f.anterior))
  if (!pares.length) return `Venta mes a mes ${anio}`
  const arriba = pares.filter((f) => f.venta > f.anterior).length
  if (pares.length === 1) {
    const m = mayus(nombreMes(pares[0].mes))
    return arriba ? `${m} ${anio} supera al mismo mes de ${anio - 1}` : `${m} ${anio} queda debajo del mismo mes de ${anio - 1}`
  }
  if (arriba === pares.length) return `Todos los meses de ${anio} superan a ${anio - 1}`
  if (arriba === 0) return `Ningún mes de ${anio} supera a ${anio - 1}`
  return `${arriba} de ${pares.length} meses de ${anio} superan a ${anio - 1}`
}
