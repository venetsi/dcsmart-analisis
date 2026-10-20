import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseNumeroAR, fmtAR } from './reporteVentas.js'

test('parseNumeroAR lee los formatos de los decks', () => {
  assert.equal(parseNumeroAR('55.114.440'), 55114440)
  assert.equal(parseNumeroAR('(14.352.110)'), -14352110)
  assert.equal(parseNumeroAR('-4,34%'), -4.34)
  assert.equal(parseNumeroAR('81,26%'), 81.26)
  assert.equal(parseNumeroAR('2.026'), 2026)
  assert.equal(parseNumeroAR('N/A'), null)
  assert.equal(parseNumeroAR(''), null)
  assert.equal(parseNumeroAR(' 1.490 '), 1490)
  assert.equal(parseNumeroAR(316106840), 316106840)
})

test('fmtAR', () => {
  assert.equal(fmtAR(316106840), '316.106.840')
  assert.equal(fmtAR(-14352110), '(14.352.110)')
  assert.equal(fmtAR(-4.34, 2), '-4,34')
  assert.equal(fmtAR(null), '—')
})
