import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esInterno, okDato, normalizarDato, mesCerrable, okMes, rangoReporte, nombresOk } from './reporteVentas.js'

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
test('okDato: el nombre no puede ser vacio ni solo espacios', () => {
  assert.equal(okDato('canal: '), false)
  assert.equal(okDato('tickets:   '), false)
  assert.equal(okDato('canal: Local'), false)
})
test('normalizarDato: devuelve la clave canonica o null', () => {
  assert.equal(normalizarDato('canal: Eventos '), 'canal:Eventos')
  assert.equal(normalizarDato('tickets: Rappi'), 'tickets:Rappi')
  assert.equal(normalizarDato('venta'), 'venta')
  assert.equal(normalizarDato('canal: '), null)
  assert.equal(normalizarDato('canal: Local '), null)
  assert.equal(normalizarDato(5), null)
})
test('okMes', () => {
  for (const m of ['2026-01', '2026-12']) assert.equal(okMes(m), true)
  for (const m of ['2026-00', '2026-13', '2026-1', '', null, undefined, '2026-10-01']) assert.equal(okMes(m), false)
})
test('rangoReporte', () => {
  assert.deepEqual(rangoReporte('2026-01'), { desde: '2025-01-01', hasta: '2026-01-31' })
  assert.equal(rangoReporte('2026-12').hasta, '2026-12-31')
  assert.equal(rangoReporte('2024-02').hasta, '2024-02-29')
})

test('nombresOk: recorta, descarta locales ajenos y valida el largo', () => {
  const locales = ['A', 'B']
  assert.equal(nombresOk(undefined, locales), undefined)
  assert.deepEqual(nombresOk({ A: '  Togni\'s  ', B: '   ', C: 'x' }, locales), { A: "Togni's" })
  assert.equal(nombresOk({ A: 'x'.repeat(61) }, locales), null)
  assert.equal(nombresOk({ A: 5 }, locales), null)
  assert.equal(nombresOk(['A'], locales), null)
  assert.equal(nombresOk(null, locales), null)
  assert.deepEqual(nombresOk({ A: 'x'.repeat(60) }, locales), { A: 'x'.repeat(60) })
})
