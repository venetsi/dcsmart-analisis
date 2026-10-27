import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quincenaAnterior, quincenasEntre, hoyEnArgentina, sumarDias } from './fechas.js'

test('el día 18 revisa la 1ª quincena del mes', () => {
  assert.deepEqual(quincenaAnterior('2026-10-18'), {
    desde: '2026-10-01', hasta: '2026-10-15', nombre: '1ª quincena de octubre de 2026',
  })
})

test('el día 3 revisa la 2ª quincena del mes anterior, hasta el último día', () => {
  assert.deepEqual(quincenaAnterior('2026-03-03'), {
    desde: '2026-02-16', hasta: '2026-02-28', nombre: '2ª quincena de febrero de 2026',
  })
  assert.equal(quincenaAnterior('2027-01-03').desde, '2026-12-16')
  assert.equal(quincenaAnterior('2027-01-03').hasta, '2026-12-31')
})

test('quincenas entre dos fechas', () => {
  assert.deepEqual(quincenasEntre('2026-11-16', '2027-01-01').map((q) => q.desde),
    ['2026-11-16', '2026-12-01', '2026-12-16', '2027-01-01'])
})

test('hoy en Argentina: a las 23:30 de Argentina ya es el día siguiente en UTC', () => {
  assert.equal(hoyEnArgentina(new Date('2026-10-16T02:30:00Z')), '2026-10-15')
})

test('sumar días cruza meses y años', () => {
  assert.equal(sumarDias('2026-12-28', 7), '2027-01-04')
  assert.equal(sumarDias('2026-03-01', -1), '2026-02-28')
})
