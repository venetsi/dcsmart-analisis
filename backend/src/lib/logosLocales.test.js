import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearLogosLocales, parseGs, tipoDe } from './logosLocales.js'

const png = Buffer.from('89504e47', 'hex')
const fila = (nombre, logo_url) => ({ nombre, logo_url })

test('parseGs y tipoDe', () => {
  assert.deepEqual(parseGs('gs://b/locales/X/logo.png'), { bucket: 'b', archivo: 'locales/X/logo.png' })
  assert.equal(parseGs('https://x/y.png'), null)
  assert.equal(parseGs('gs://solo'), null)
  assert.equal(tipoDe('a/b/logo.WEBP'), 'image/webp')
  assert.equal(tipoDe('a/b/logo.svg'), null)
})

test('devuelve el logo de cada local como data URL y omite los que no tienen', async () => {
  const logosDe = crearLogosLocales({
    consultar: async () => [fila('A', 'gs://b/locales/A/l.png'), fila('B', null), fila('C', 'gs://b/locales/C/l.jpg')],
    descargar: async () => png,
  })
  const r = await logosDe('G', ['A', 'B', 'C'])
  assert.deepEqual(Object.keys(r).sort(), ['A', 'C'])
  assert.equal(r.A, `data:image/png;base64,${png.toString('base64')}`)
  assert.match(r.C, /^data:image\/jpeg;base64,/)
})

test('un archivo que falla, no es imagen o es enorme deja ese local sin logo y no tira el reporte', async () => {
  const logosDe = crearLogosLocales({
    consultar: async () => [fila('A', 'gs://b/A/l.png'), fila('B', 'gs://b/B/l.svg'), fila('C', 'gs://b/C/l.png'), fila('D', 'gs://b/D/l.png')],
    descargar: async ({ archivo }) => {
      if (archivo.startsWith('A')) throw new Error('GCS caído')
      if (archivo.startsWith('C')) return Buffer.alloc(2 * 1024 * 1024)
      return png
    },
  })
  assert.deepEqual(Object.keys(await logosDe('G', ['A', 'B', 'C', 'D'])), ['D'])
})

test('sin acceso a gestión devuelve vacío', async () => {
  const logosDe = crearLogosLocales({ consultar: async () => { throw new Error('sin permiso') }, descargar: async () => png })
  assert.deepEqual(await logosDe('G', ['A']), {})
  assert.deepEqual(await logosDe('G', []), {})
})

test('descarga cada archivo una sola vez, y reintenta si falló', async () => {
  let llamadas = 0, falla = true
  const logosDe = crearLogosLocales({
    consultar: async () => [fila('A', 'gs://b/A/l.png')],
    descargar: async () => { llamadas++; if (falla) { falla = false; throw new Error('red') } return png },
  })
  assert.deepEqual(await logosDe('G', ['A']), {})
  assert.equal(Object.keys(await logosDe('G', ['A'])).length, 1)
  await logosDe('G', ['A'])
  assert.equal(llamadas, 2)
})
