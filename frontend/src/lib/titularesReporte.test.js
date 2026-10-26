import test from 'node:test'
import assert from 'node:assert/strict'
import { enMillones, titularCanales, titularConsolidado, titularSintesis } from './titularesReporte.js'

test('síntesis de 3 Monos sep-26 (como el PDF de referencia)', () => {
  assert.equal(titularSintesis({ mes: '2026-09', venta: 151736690, varAnual: 47.39, varPct: -2.6 }),
    'Septiembre cerró en $ 151,7 millones: 47% más que hace un año y casi en línea con agosto.')
})
test('síntesis: bajas, enero contra diciembre y datos que faltan', () => {
  assert.equal(titularSintesis({ mes: '2026-01', venta: 90e6, varAnual: -12.4, varPct: -20.2 }),
    'Enero cerró en $ 90,0 millones: 12% menos que hace un año y 20% abajo de diciembre.')
  assert.equal(titularSintesis({ mes: '2026-09', venta: 5e6, varAnual: null, varPct: 8 }),
    'Septiembre cerró en $ 5,0 millones: 8% arriba de agosto.')
  assert.equal(titularSintesis({ mes: '2026-09', venta: 5e6, varAnual: null, varPct: null }), 'Septiembre cerró en $ 5,0 millones.')
  assert.match(titularSintesis({ mes: '2026-09', venta: null }), /Falta la venta de septiembre/)
})
test('en millones', () => {
  assert.equal(enMillones(1332625000), '$ 1.332,6 millones')
  assert.equal(enMillones(430500), '$ 430.500')
  assert.equal(enMillones(null), '—')
})
test('canales y consolidado: el que más vende', () => {
  assert.equal(titularCanales([{ nombre: 'Local', valor: 151306190, inc: 99.72 }, { nombre: 'Big Box', valor: 430500, inc: 0.28 }]),
    'Local concentra casi toda la venta')
  assert.equal(titularCanales([{ nombre: 'Local', valor: 60, inc: 60 }, { nombre: 'Rappi', valor: 40, inc: 40 }]),
    'Local concentra la mayor parte de la venta')
  assert.equal(titularCanales([{ nombre: 'Local', valor: 50, inc: 50 }, { nombre: 'Rappi', valor: 50.1, inc: 50 }]),
    'Rappi es el canal que más vende')
  assert.equal(titularCanales([{ nombre: 'Local', valor: null, inc: null }]), 'Ventas por canal')
  assert.equal(titularConsolidado([{ nombre: 'Evelia', valor: 396, inc: 50 }, { nombre: 'Pizza', valor: 316, inc: 39.9 }]),
    'Evelia hizo el 50% de la venta del grupo')
})
