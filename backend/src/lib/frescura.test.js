import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarFrescura } from './frescura.js'

const ahora = new Date('2026-11-02T20:18:00Z')

test('devuelve el último dato en ISO y la demora en minutos redondeada', () => {
  assert.deepEqual(armarFrescura('2026-11-02T20:12:33.517Z', ahora),
    { ultimoDato: '2026-11-02T20:12:33.517Z', demoraMin: 5, fuente: 'cdc' })
})

test('acepta un Date (lo que devuelve BigQuery ya aplanado también sirve)', () => {
  assert.equal(armarFrescura(new Date('2026-11-02T19:48:00Z'), ahora).demoraMin, 30)
})

test('un dato del futuro (reloj corrido) no da demora negativa', () => {
  assert.equal(armarFrescura('2026-11-02T20:30:00Z', ahora).demoraMin, 0)
})

test('sin dato o con basura responde null sin romper', () => {
  assert.deepEqual(armarFrescura(null, ahora), { ultimoDato: null, demoraMin: null, fuente: 'cdc' })
  assert.deepEqual(armarFrescura('no es fecha', ahora), { ultimoDato: null, demoraMin: null, fuente: 'cdc' })
})
