// Fechas como texto 'AAAA-MM-DD' (días de Argentina, sin hora): así no hay
// corrimientos por zona horaria al sumar días ni al compararlas.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function hoyEnArgentina (ahora = new Date()) {
  // en-CA da el formato AAAA-MM-DD
  return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

export function sumarDias (dia, n) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function diasEntre (desde, hasta) {
  const out = []
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) out.push(d)
  return out
}

function ultimoDiaDelMes (anio, mes) {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

// La quincena calendario que terminó antes de `hoy`: del 1 al 15 o del 16 a
// fin de mes. El job corre los días 3 y 18, dos días después del cierre, para
// que las cajas manuales de los últimos días ya estén cargadas.
export function quincenaAnterior (hoy) {
  const [a, m, d] = hoy.split('-').map(Number)
  if (d > 15) {
    return quincena(a, m, 1)
  }
  const anio = m === 1 ? a - 1 : a
  const mes = m === 1 ? 12 : m - 1
  return quincena(anio, mes, 16)
}

export function quincena (anio, mes, primerDia) {
  const mm = String(mes).padStart(2, '0')
  const fin = primerDia === 1 ? 15 : ultimoDiaDelMes(anio, mes)
  return {
    desde: `${anio}-${mm}-${String(primerDia).padStart(2, '0')}`,
    hasta: `${anio}-${mm}-${String(fin).padStart(2, '0')}`,
    nombre: `${primerDia === 1 ? '1ª' : '2ª'} quincena de ${MESES[mes - 1]} de ${anio}`,
  }
}

// Todas las quincenas que empiezan entre dos fechas (para el backtest).
export function quincenasEntre (desde, hasta) {
  const out = []
  let [a, m] = desde.split('-').map(Number)
  let primer = Number(desde.slice(8)) <= 1 ? 1 : 16
  while (true) {
    const q = quincena(a, m, primer)
    if (q.desde > hasta) break
    if (q.desde >= desde) out.push(q)
    if (primer === 1) primer = 16
    else { primer = 1; m++; if (m > 12) { m = 1; a++ } }
  }
  return out
}

export function fechaCorta (dia) {
  if (!dia) return ''
  const [a, m, d] = dia.split('-')
  return `${d}/${m}/${a}`
}
