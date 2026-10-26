import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPyl, waterfallSteps, repartoVentas, variacion, mesAnterior } from './pyl.js'

const datos = {
  ventas: { total: 1000, fiscal: 800, efectivo: 200, tickets: 50, comensales: 80, por_origen: [] },
  gastos: [
    { rubro: 'CMV Alimentos', categoria: 'Carnes', total: 300, fiscal: 300, efectivo: 0 },
    { rubro: 'Sueldos', categoria: 'Sueldos', total: 250, fiscal: 250, efectivo: 0 },
    { rubro: 'Fijos/Variables', categoria: 'Alquiler', total: 100, fiscal: 50, efectivo: 50 },
    { rubro: 'Socios', categoria: 'Socios', total: 90, fiscal: 90, efectivo: 0 }
  ]
}

test('el waterfall usa nombres cortos y termina en el resultado económico', () => {
  const pasos = waterfallSteps(buildPyl(datos))
  assert.deepEqual(pasos.map(p => p.label), ['Ventas', 'CMV', 'Bruto', 'Alquiler', 'Sueldos', 'Resultado'])
  assert.equal(pasos.at(-1).valor, 350)
})

test('el reparto ordena las secciones operativas y deja afuera lo no operativo', () => {
  const r = repartoVentas(buildPyl(datos))
  assert.deepEqual(r.filas.map(f => [f.label, f.pct]), [['CMV', 30], ['Sueldos', 25], ['Alquiler', 10]])
  assert.deepEqual(r.resultado, { valor: 350, pct: 35 })
})

test('variación contra el mes anterior', () => {
  assert.equal(variacion(110, 100), 10)
  assert.equal(variacion(-50, -100), 50)
  assert.equal(variacion(100, 0), null)
  assert.equal(variacion(100, null), null)
})

test('mes anterior cruza el año', () => {
  assert.equal(mesAnterior('2026-09'), '2026-08')
  assert.equal(mesAnterior('2026-01'), '2025-12')
})
