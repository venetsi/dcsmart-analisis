// Comparación robusta contra el histórico: mediana y MAD (desvío absoluto
// mediano) en lugar de promedio y desvío estándar, para que un día raro del
// pasado no corra la vara con la que se mide el día de hoy.
import { sumarDias, diasEntre } from './fechas.js'

export function mediana (valores) {
  if (!valores.length) return null
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

export function mad (valores, med = mediana(valores)) {
  if (!valores.length) return null
  return mediana(valores.map((x) => Math.abs(x - med)))
}

// Cuántos "desvíos robustos" se aleja `valor` de lo habitual. 1,4826 × MAD
// equivale al desvío estándar cuando los datos son normales. Si el histórico
// es casi constante (MAD 0) se usa el 5 % de la mediana como escala, para no
// dividir por cero ni marcar diferencias de centavos.
export function puntajeRobusto (valor, historial) {
  const med = mediana(historial)
  const escala = Math.max(1.4826 * mad(historial, med), Math.abs(med) * 0.05, 1)
  return { mediana: med, puntaje: (valor - med) / escala }
}

// Decide si `valor` está fuera de lo normal. Pide las dos cosas: que se aleje
// del histórico más de `umbral` desvíos robustos Y que el cambio relativo sea
// grande, porque en un local muy parejo un 10 % ya da un puntaje alto y no le
// sirve a nadie. `cambioMinimo` es para las subas (1 = el doble) y
// `caidaMinima` para las bajas (0,6 = quedó en el 40 % o menos).
export function fueraDeLoNormal (valor, historial, {
  umbral = 3.5, minHistoria = 8, cambioMinimo = 0.4, caidaMinima = cambioMinimo, direccion = 'ambas',
} = {}) {
  if (historial.length < minHistoria) return null
  const { mediana: med, puntaje } = puntajeRobusto(valor, historial)
  if (!(med > 0)) return null
  const cambio = (valor - med) / med
  const sube = puntaje > umbral && cambio >= cambioMinimo
  const baja = puntaje < -umbral && cambio <= -caidaMinima
  if (sube && direccion !== 'baja') return { mediana: med, puntaje, cambio, sentido: 'sube' }
  if (baja && direccion !== 'sube') return { mediana: med, puntaje, cambio, sentido: 'baja' }
  return null
}

const DIAS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados']
function diaDeLaSemana (dia) {
  return DIAS[new Date(`${dia}T12:00:00Z`).getUTCDay()]
}

function veces (valor, med) {
  const r = valor / med
  return r >= 10 ? `${Math.round(r)} veces` : `${r.toFixed(1).replace('.', ',')} veces`
}

// Ventas por local y día contra el mismo día de la semana de las 12 semanas
// anteriores. Los días sin venta no entran: de eso se ocupa caja_dia_sin_caja.
// Se marca desde el doble de lo habitual o desde el 40 % para abajo: con
// márgenes más chicos el backtest se llenaba de fines de semana largos.
// Si el mismo día se mueve en el mismo sentido en muchos locales a la vez
// (al menos 5 y un cuarto de los evaluados), es un feriado o un evento general
// y no un error de carga: se informa como una sola línea.
export function evaluarVentas (filas, { desde, hasta, opciones = {} }) {
  const porLocal = new Map()
  for (const f of filas) {
    if (!porLocal.has(f.id_local)) porLocal.set(f.id_local, { local: f.local, grupo: f.grupo, dias: new Map() })
    porLocal.get(f.id_local).dias.set(f.dia, f.total)
  }
  const out = []
  const evaluados = new Map()
  for (const { local, grupo, dias } of porLocal.values()) {
    for (const dia of diasEntre(desde, hasta)) {
      const valor = dias.get(dia)
      if (!(valor > 0)) continue
      const historial = []
      for (let s = 1; s <= 12; s++) {
        const v = dias.get(sumarDias(dia, -7 * s))
        if (v > 0) historial.push(v)
      }
      if (historial.length >= 8) evaluados.set(dia, (evaluados.get(dia) ?? 0) + 1)
      const r = fueraDeLoNormal(valor, historial, { cambioMinimo: 1, caidaMinima: 0.6, ...opciones })
      if (!r) continue
      const cuando = `los ${diaDeLaSemana(dia)}`
      out.push({
        regla: 'venta_fuera_de_lo_normal', severidad: 'media', local, grupo,
        referencia: r.sentido === 'sube' ? 'pico' : 'caída', ref_id: null, fecha: dia,
        valor, esperado: r.mediana, cantidad: 1,
        detalle: r.sentido === 'sube'
          ? `${veces(valor, r.mediana)} lo habitual de ${cuando}`
          : `${Math.round(valor / r.mediana * 100)} % de lo habitual de ${cuando}`,
      })
    }
  }
  return agruparDiasGenerales(out, evaluados)
}

function agruparDiasGenerales (hallazgos, evaluados) {
  const porDia = new Map()
  for (const h of hallazgos) {
    const k = `${h.fecha}|${h.referencia}`
    if (!porDia.has(k)) porDia.set(k, [])
    porDia.get(k).push(h)
  }
  const out = []
  for (const lista of porDia.values()) {
    const { fecha, referencia } = lista[0]
    const total = evaluados.get(fecha) ?? 0
    if (lista.length < 5 || lista.length < total / 4) { out.push(...lista); continue }
    const nombres = lista.map((h) => h.local).sort()
    out.push({
      regla: 'venta_dia_atipico_general', severidad: 'baja', local: null, grupo: 'Varios grupos',
      referencia: `${referencia} en ${lista.length} de ${total} locales`, ref_id: null, fecha,
      valor: null, esperado: null, cantidad: lista.length,
      detalle: `¿feriado o evento? ${nombres.slice(0, 8).join(', ')}${nombres.length > 8 ? ` y ${nombres.length - 8} más` : ''}`,
    })
  }
  return out
}

// Gasto de la quincena por local y rubro contra las mismas quincenas (1ª con
// 1ª, 2ª con 2ª) de los 8 meses anteriores: los sueldos y otros gastos
// mensuales caen siempre en la misma mitad del mes, y comparar contra las dos
// mitades los marcaba todos los meses.
// Solo se marcan los picos: las facturas se cargan con atraso, así que una
// quincena reciente "baja" es lo normal y no un error.
export function evaluarEgresos (filas, { desde, montoMinimo = 1_000_000, opciones = {} }) {
  const mismaMitad = (q) => q.slice(8) === desde.slice(8)
  const grupos = new Map()
  for (const f of filas) {
    const k = `${f.local}|${f.rubro}`
    if (!grupos.has(k)) grupos.set(k, { local: f.local, grupo: f.grupo, rubro: f.rubro, q: new Map() })
    grupos.get(k).q.set(f.quincena, f.total)
  }
  const out = []
  for (const { local, grupo, rubro, q } of grupos.values()) {
    const valor = q.get(desde)
    if (!(valor > 0)) continue
    const anteriores = [...q.keys()].filter((k) => k < desde && mismaMitad(k)).sort().slice(-8)
    const historial = anteriores.map((k) => q.get(k)).filter((v) => v > 0)
    const r = fueraDeLoNormal(valor, historial, { direccion: 'sube', cambioMinimo: 1, minHistoria: 6, ...opciones })
    if (!r || valor - r.mediana < montoMinimo) continue
    out.push({
      regla: 'egreso_fuera_de_lo_normal', severidad: 'media', local, grupo,
      referencia: rubro, ref_id: null, fecha: null,
      valor, esperado: r.mediana, cantidad: 1,
      detalle: `${veces(valor, r.mediana)} lo habitual en la ${desde.slice(8) === '01' ? '1ª' : '2ª'} quincena`,
    })
  }
  return out
}

// Cantidad de pagos y cajas cargados por grupo y día contra el mismo día de la
// semana de las 12 semanas anteriores. Los días sin cargas cuentan como 0
// desde el primer día con datos del grupo. Si el pico son en su mayoría
// pagos con fecha vieja, se informa como posible migración.
// Cargar facturas de a tandas es lo normal: solo se marca desde 40 cargas en
// el día y 4 veces lo habitual.
export function evaluarCargas (filas, { desde, hasta, minimo = 40, opciones = {} }) {
  const series = new Map()
  for (const f of filas) {
    const k = `${f.grupo}|${f.tipo}`
    if (!series.has(k)) series.set(k, { grupo: f.grupo, tipo: f.tipo, dias: new Map(), primero: f.dia })
    const s = series.get(k)
    s.dias.set(f.dia, { n: f.n, viejos: f.viejos })
    if (f.dia < s.primero) s.primero = f.dia
  }
  const out = []
  for (const { grupo, tipo, dias, primero } of series.values()) {
    for (const dia of diasEntre(desde, hasta)) {
      const hoy = dias.get(dia)
      if (!hoy || hoy.n < minimo) continue
      const historial = []
      for (let s = 1; s <= 12; s++) {
        const d = sumarDias(dia, -7 * s)
        if (d >= primero) historial.push(dias.get(d)?.n ?? 0)
      }
      // con muchos ceros la mediana es 0; fueraDeLoNormal pide mediana > 0,
      // así que se compara contra al menos 1 carga diaria
      const r = fueraDeLoNormal(hoy.n, historial.map((v) => Math.max(v, 1)), { direccion: 'sube', cambioMinimo: 3, ...opciones })
      if (!r) continue
      const migracion = hoy.viejos / hoy.n >= 0.5
      out.push({
        regla: migracion ? 'carga_masiva_datos_viejos' : 'pico_de_cargas', severidad: 'baja',
        local: null, grupo, referencia: tipo, ref_id: null, fecha: dia,
        valor: hoy.n, esperado: r.mediana, cantidad: hoy.n,
        detalle: migracion
          ? `${hoy.viejos} de ${hoy.n} con fecha de hace más de 60 días`
          : `${veces(hoy.n, r.mediana)} lo habitual`,
      })
    }
  }
  return juntarDiasDelGrupo(out)
}

// Varios días con pico en el mismo grupo van en una sola línea (con el día
// más alto como valor), para que una semana de carga atrasada no ocupe medio mail.
function juntarDiasDelGrupo (hallazgos) {
  const grupos = new Map()
  for (const h of hallazgos) {
    const k = `${h.regla}|${h.grupo}|${h.referencia}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(h)
  }
  return [...grupos.values()].map((lista) => {
    if (lista.length === 1) return lista[0]
    const mayor = lista.reduce((a, b) => (b.valor > a.valor ? b : a))
    const dias = lista.map((h) => `${h.fecha.slice(8)}/${h.fecha.slice(5, 7)} (${h.valor})`).join(', ')
    return {
      ...mayor, fecha: lista[0].fecha, cantidad: lista.reduce((s, h) => s + h.cantidad, 0),
      detalle: `${lista.length} días: ${dias}`,
    }
  })
}
