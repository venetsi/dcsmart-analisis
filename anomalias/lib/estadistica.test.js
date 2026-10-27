import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mediana, mad, puntajeRobusto, fueraDeLoNormal, evaluarVentas, evaluarEgresos, evaluarCargas } from './estadistica.js'
import { sumarDias } from './fechas.js'

test('mediana y MAD', () => {
  assert.equal(mediana([3, 1, 2]), 2)
  assert.equal(mediana([4, 1, 2, 3]), 2.5)
  assert.equal(mediana([]), null)
  assert.equal(mad([1, 2, 3, 4, 100]), 1)
})

test('un valor raro en el histórico no corre la vara', () => {
  const historial = [100, 102, 98, 101, 99, 100, 103, 97, 1000]
  const { mediana: med, puntaje } = puntajeRobusto(100, historial)
  assert.equal(med, 100)
  assert.ok(Math.abs(puntaje) < 1)
})

test('histórico constante: no divide por cero ni marca centavos', () => {
  const historial = Array(10).fill(1000)
  assert.equal(fueraDeLoNormal(1001, historial), null)
  assert.equal(fueraDeLoNormal(3000, historial)?.sentido, 'sube')
})

test('pide historia mínima, puntaje alto Y cambio grande', () => {
  assert.equal(fueraDeLoNormal(500, [100, 100, 100]), null)
  const parejo = [100, 101, 99, 100, 100, 101, 99, 100]
  // 115 % de lo habitual: puntaje altísimo pero el cambio no llega al 40 %
  assert.equal(fueraDeLoNormal(115, parejo), null)
  assert.equal(fueraDeLoNormal(150, parejo)?.sentido, 'sube')
  assert.equal(fueraDeLoNormal(30, parejo)?.sentido, 'baja')
  assert.equal(fueraDeLoNormal(30, parejo, { direccion: 'sube' }), null)
  assert.equal(fueraDeLoNormal(50, parejo, { caidaMinima: 0.6 }), null)
})

// 13 martes seguidos con venta pareja y el último con el triple
function martes (ultimo) {
  const filas = []
  let dia = '2026-07-14'
  for (let i = 0; i < 13; i++) {
    filas.push({ id_local: 'L1', local: 'ROMA', grupo: 'GRUPO LA FUERZA', dia, total: i === 12 ? ultimo : 1_000_000 + i * 1000 })
    dia = sumarDias(dia, 7)
  }
  return { filas, dia: filas[12].dia }
}

test('ventas: marca el pico contra los mismos días de la semana', () => {
  const { filas, dia } = martes(3_000_000)
  const r = evaluarVentas(filas, { desde: dia, hasta: dia })
  assert.equal(r.length, 1)
  assert.equal(r[0].regla, 'venta_fuera_de_lo_normal')
  assert.equal(r[0].referencia, 'pico')
  assert.equal(r[0].valor, 3_000_000)
  assert.match(r[0].detalle, /los martes/)
})

test('ventas: un 50 % más no alcanza (pide el doble)', () => {
  const { filas, dia } = martes(1_500_000)
  assert.deepEqual(evaluarVentas(filas, { desde: dia, hasta: dia }), [])
})

test('ventas: un local nuevo, con menos de 8 semanas, no se evalúa', () => {
  const { filas, dia } = martes(3_000_000)
  assert.deepEqual(evaluarVentas(filas.slice(6), { desde: dia, hasta: dia }), [])
})

test('ventas: si muchos locales caen el mismo día es un feriado y sale en una sola línea', () => {
  const filas = []
  for (let l = 0; l < 8; l++) {
    const { filas: f } = martes(l < 6 ? 200_000 : 1_000_000)
    filas.push(...f.map((x) => ({ ...x, id_local: `L${l}`, local: `LOCAL ${l}` })))
  }
  const dia = filas[12].dia
  const r = evaluarVentas(filas, { desde: dia, hasta: dia })
  assert.equal(r.length, 1)
  assert.equal(r[0].regla, 'venta_dia_atipico_general')
  assert.equal(r[0].referencia, 'caída en 6 de 8 locales')
})

test('egresos: compara con la misma mitad del mes y solo marca subas', () => {
  const filas = []
  for (let m = 1; m <= 9; m++) {
    const mm = String(m).padStart(2, '0')
    // sueldos en la 1ª quincena; en la 2ª casi nada
    filas.push({ local: 'UAT', grupo: 'MONOS', rubro: 'Sueldos', quincena: `2026-${mm}-01`, total: m === 9 ? 20_000_000 : 10_000_000 })
    filas.push({ local: 'UAT', grupo: 'MONOS', rubro: 'Sueldos', quincena: `2026-${mm}-16`, total: 500_000 })
  }
  // la 1ª de septiembre es el doble de las 1ª anteriores
  const r = evaluarEgresos(filas, { desde: '2026-09-01' })
  assert.equal(r.length, 1)
  assert.equal(r[0].esperado, 10_000_000)
  // la 1ª de agosto es igual a las anteriores 1ª: no se marca aunque sea 20 veces las 2ª
  assert.deepEqual(evaluarEgresos(filas, { desde: '2026-08-01' }), [])
})

test('cargas: un pico de pagos viejos se informa como posible migración', () => {
  const filas = []
  let dia = '2026-07-01'
  for (let i = 0; i < 13; i++) {
    filas.push({ grupo: 'GRUPO TITA', tipo: 'pagos', dia, n: i === 12 ? 400 : 10, viejos: i === 12 ? 380 : 0 })
    dia = sumarDias(dia, 7)
  }
  const ultimo = filas[12].dia
  const r = evaluarCargas(filas, { desde: ultimo, hasta: ultimo })
  assert.equal(r.length, 1)
  assert.equal(r[0].regla, 'carga_masiva_datos_viejos')
  assert.match(r[0].detalle, /380 de 400/)
})

test('cargas: varios días con pico en el mismo grupo van en una línea', () => {
  const filas = []
  for (let d = 0; d < 100; d++) {
    const dia = sumarDias('2026-07-01', d)
    filas.push({ grupo: 'GRUPO LATINO', tipo: 'pagos', dia, n: d >= 98 ? 90 + d : 10, viejos: 0 })
  }
  const r = evaluarCargas(filas, { desde: sumarDias('2026-07-01', 98), hasta: sumarDias('2026-07-01', 99) })
  assert.equal(r.length, 1)
  assert.equal(r[0].regla, 'pico_de_cargas')
  assert.equal(r[0].valor, 189)
  assert.equal(r[0].cantidad, 188 + 189)
  assert.match(r[0].detalle, /^2 días: /)
})
