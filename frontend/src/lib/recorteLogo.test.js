import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cajaDelDibujo } from './recorteLogo.js'

// Lienzo de ancho×alto con fondo `fondo` ([r,g,b,a]) y los píxeles de `dibujo` en negro.
function lienzo (ancho, alto, fondo, dibujo) {
  const d = new Uint8ClampedArray(ancho * alto * 4)
  for (let i = 0; i < ancho * alto; i++) d.set(fondo, i * 4)
  for (const [x, y] of dibujo) d.set([0, 0, 0, 255], (y * ancho + x) * 4)
  return d
}

test('encuentra el dibujo sobre fondo transparente', () => {
  const d = lienzo(10, 8, [0, 0, 0, 0], [[2, 3], [6, 5]])
  assert.deepEqual(cajaDelDibujo(d, 10, 8), { x: 2, y: 3, w: 5, h: 3 })
})

test('el blanco cuenta como fondo', () => {
  const d = lienzo(10, 8, [255, 255, 255, 255], [[4, 1]])
  assert.deepEqual(cajaDelDibujo(d, 10, 8), { x: 4, y: 1, w: 1, h: 1 })
})

test('sin dibujo devuelve null', () => {
  assert.equal(cajaDelDibujo(lienzo(4, 4, [255, 255, 255, 255], []), 4, 4), null)
  assert.equal(cajaDelDibujo(lienzo(4, 4, [0, 0, 0, 0], []), 4, 4), null)
})
