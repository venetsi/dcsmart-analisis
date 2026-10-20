import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esInterno, okDato, mesCerrable } from './reporteVentas.js'

test('esInterno: el is_admin externo no alcanza', () => {
  assert.equal(esInterno({ roles: ['dcsmart'] }), true)
  assert.equal(esInterno({ roles: ['super_admin'] }), true)
  assert.equal(esInterno({ roles: ['externo'], admin: true }), false)
})
test('okDato', () => {
  for (const d of ['venta', 'cubiertos', 'ordenes', 'canal:Eventos', 'tickets:Rappi']) assert.equal(okDato(d), true)
  for (const d of ['canal:Local', 'canal:', 'otra', 'canal:' + 'x'.repeat(41)]) assert.equal(okDato(d), false)
})
test('mesCerrable: solo meses terminados', () => {
  assert.equal(mesCerrable('2026-09', new Date('2026-10-20')), true)
  assert.equal(mesCerrable('2026-10', new Date('2026-10-20')), false)
})
