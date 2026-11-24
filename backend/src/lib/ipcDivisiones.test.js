import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarIpc, divisionesDe, crearIpcDivisiones } from './ipcDivisiones.js'

// 2026: valores reales de INDEC (datos.gob.ar, 24/11/2026). 2025: armados para que la interanual dé la del Word (33,1 / 33,6).
const fila = (mes, g, r) => [`${mes}-01`, g, 1, 1, 1, r]
const FILAS = [
  fila('2025-09', 9285.0, 11500), fila('2025-10', 9606.6, 11666.6),
  fila('2026-08', 12276.766, 15196.1764), fila('2026-09', 12514.1508, 15356.5986), fila('2026-10', 12785.9321, 15586.849),
]

test('IPC: último mes con dato, variación mensual, interanual y la del mes anterior', () => {
  const r = armarIpc(FILAS, '2026-10')
  assert.equal(r.mes_dato, '2026-10')
  assert.equal(r.general.indice, 12785.9321)
  assert.equal(r.general.mensual, 2.2) // como el Word del usuario: 2,2 %
  assert.equal(r.general.interanual, 33.1) // 33,1 %
  assert.equal(r.general.mensual_previo, 1.9)
  const rest = r.divisiones.find((d) => d.codigo === '11')
  assert.equal(rest.mensual, 1.5) // Restaurantes y hoteles 1,5 %
  assert.equal(rest.interanual, 33.6)
  assert.equal(rest.vs_general, 'bajo')
})

test('IPC: si el mes pedido todavía no salió, usa el último publicado', () => {
  assert.equal(armarIpc(FILAS, '2026-11').mes_dato, '2026-10')
  assert.equal(armarIpc(FILAS, '2026-09').mes_dato, '2026-09')
  assert.equal(armarIpc([], '2026-10'), null)
})

test('divisiones por tipo de local', () => {
  assert.deepEqual(divisionesDe(['Gastronomía']), ['01', '02', '11'])
  assert.deepEqual(divisionesDe(['Indumentaria', 'Gastronomía']), ['01', '02', '03', '11'])
  assert.deepEqual(divisionesDe(['Arquitectura', null]), [])
})

test('leer filtra las divisiones del tipo de local y cachea la consulta', async () => {
  let llamadas = 0
  const leer = crearIpcDivisiones({ pedir: async () => { llamadas++; return { data: FILAS } } })
  const g = await leer('2026-10', ['Gastronomía'])
  assert.deepEqual(g.divisiones.map((d) => d.codigo), ['01', '02', '11'])
  const otro = await leer('2026-10', [])
  assert.deepEqual(otro.divisiones, [])
  assert.equal(llamadas, 1)
})
