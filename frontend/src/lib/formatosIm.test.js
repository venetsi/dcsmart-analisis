import test from 'node:test'
import assert from 'node:assert/strict'
import { fmtNumIm, fmtMontoIm, fmtPesosIm, fmtPctIm, fmtPtsIm, flechaIm, tonoIm, mesEnPalabrasIm, periodoIm, mesSiguienteIm } from './formatosIm.js'

const NB = String.fromCharCode(160)

test('formatos: lo que no hay es "—", nunca 0', () => {
  for (const f of [fmtNumIm, fmtPesosIm, fmtPctIm, fmtPtsIm]) {
    assert.equal(f(null), '—')
    assert.equal(f(undefined), '—')
    assert.equal(f(NaN), '—')
  }
  assert.equal(fmtPctIm(0), '0,00%')
  assert.equal(fmtNumIm(0), '0')
})

test('formatos: pesos, porcentajes y puntos', () => {
  assert.equal(fmtPesosIm(155999936), `$${NB}155.999.936`)
  assert.equal(fmtPesosIm(-8628394), `−$${NB}8.628.394`)
  assert.equal(fmtPesosIm(5199391.4, { signo: true }), `+$${NB}5.199.391`)
  assert.equal(fmtPctIm(26.4156), '26,42%')
  assert.equal(fmtPctIm(-1.014, { signo: true }), '−1,01%')
  assert.equal(fmtPtsIm(1.02), '1,02 pts')
  assert.equal(fmtPtsIm(5.01, { signo: true }), '+5,01 pts')
  assert.equal(fmtNumIm(3874), '3.874')
  assert.equal(fmtNumIm(-0.2), '0') // no hay "−0"
})

test('flecha y color según el sentido', () => {
  assert.equal(flechaIm(5), '▲')
  assert.equal(flechaIm(-5), '▼')
  assert.equal(flechaIm(0), '=')
  assert.equal(flechaIm(null), '')
  assert.equal(tonoIm(10, 'costo'), 'neg')
  assert.equal(tonoIm(-10, 'costo'), 'pos')
  assert.equal(tonoIm(10, 'resultado'), 'pos')
  assert.equal(tonoIm(-10, 'resultado'), 'neg')
  assert.equal(tonoIm(0, 'costo'), null)
  assert.equal(tonoIm(null, 'costo'), null)
})

test('meses', () => {
  assert.equal(mesEnPalabrasIm('2026-09'), 'Septiembre 2026')
  assert.equal(periodoIm('2026-09'), '01/09/2026 – 30/09/2026')
  assert.equal(periodoIm('2028-02'), '01/02/2028 – 29/02/2028')
  assert.equal(mesSiguienteIm('2026-12'), '2027-01')
})

test('fmtMontoIm: millones con la M al lado; por debajo del millón, el número completo', () => {
  const M = `${String.fromCharCode(160)}M`
  assert.equal(fmtMontoIm(4469210), `4,5${M}`)
  assert.equal(fmtMontoIm(133111122), `133,1${M}`)
  assert.equal(fmtMontoIm(65000), '65.000')
  assert.equal(fmtMontoIm(999949), '999.949')
  assert.equal(fmtMontoIm(999950), `1,0${M}`)
  assert.equal(fmtMontoIm(-7263909), `−7,3${M}`)
  assert.equal(fmtMontoIm(0), '0')
  assert.equal(fmtMontoIm(null), '—')
})
