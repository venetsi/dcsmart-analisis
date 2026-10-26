// Inflación para el Reporte de Ventas. Entrada: la variación mensual del IPC de
// INDEC por mes, { 'YYYY-MM': { variacion: 2.08, fuente } } (en %). Lógica pura.
// Regla de oro: si falta la inflación de algún mes que hace falta, el resultado es null.

const esNum = (v) => v != null && Number.isFinite(v)
const r2 = (x) => (esNum(x) ? Math.round(x * 100) / 100 : null)

function mesPrevio(mes) {
  const [a, m] = mes.split('-').map(Number)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
}

const variacion = (ipc, mes) => {
  const v = ipc?.[mes]?.variacion
  return esNum(v) ? v : null
}

// Cuánto subieron los precios desde el mes `desde` (exclusivo) hasta `hasta` (inclusive),
// como factor (1,30 = 30%). null si falta algún mes.
export function factorEntre(ipc, desde, hasta) {
  let f = 1
  for (let m = hasta; m > desde; m = mesPrevio(m)) {
    const v = variacion(ipc, m)
    if (v == null) return null
    f *= 1 + v / 100
  }
  return f
}

// Inflación del mes, en %.
export const inflacionMes = (ipc, mes) => variacion(ipc, mes)

// Inflación acumulada del año hasta `mes` (diciembre anterior → mes), en %.
export function inflacionAnio(ipc, mes) {
  const f = factorEntre(ipc, `${Number(mes.slice(0, 4)) - 1}-12`, mes)
  return f == null ? null : r2((f - 1) * 100)
}

// Inflación interanual (mismo mes del año anterior → mes), como factor.
export function factorInteranual(ipc, mes) {
  const [a, m] = mes.split('-')
  return factorEntre(ipc, `${Number(a) - 1}-${m}`, mes)
}

// Venta del año anterior llevada a precios del mismo mes de este año.
export function anteriorActualizado(ipc, mes, anterior) {
  const f = factorInteranual(ipc, mes)
  return esNum(anterior) && f != null ? anterior * f : null
}

// Crecimiento real: cuánto creció la venta descontando la inflación, en %.
export function crecimientoReal(venta, anteriorAct) {
  if (!esNum(venta) || !esNum(anteriorAct) || anteriorAct === 0) return null
  return r2((venta / anteriorAct - 1) * 100)
}

// Resumen para el acumulado: filas = [{ mes, venta, anterior }] de enero al mes del reporte.
export function inflacionDelAcumulado(ipc, filas, mes) {
  const act = filas.map((f) => anteriorActualizado(ipc, f.mes, f.anterior))
  const ventas = filas.map((f) => f.venta)
  const todas = (xs) => xs.length > 0 && xs.every(esNum)
  const suma = (xs) => xs.reduce((t, v) => t + v, 0)
  const anteriorAct = todas(act) ? suma(act) : null
  return {
    mes: inflacionMes(ipc, mes),
    anio: inflacionAnio(ipc, mes),
    anteriorAct,
    real: todas(ventas) ? crecimientoReal(suma(ventas), anteriorAct) : null,
  }
}
