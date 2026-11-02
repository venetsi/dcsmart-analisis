import test from 'node:test'
import assert from 'node:assert/strict'

// api.js usa localStorage y fetch del navegador: acá se simulan.
globalThis.localStorage = { getItem: () => 'tok', setItem() {}, removeItem() {} }
let pedidos = []
let respuesta = { status: 200, body: { ok: true } }
globalThis.fetch = async (url, init) => {
  pedidos.push({ url, init })
  const { status, body } = respuesta
  return { status, ok: status >= 200 && status < 300, json: async () => body }
}
const { api, ApiError } = await import('./api.js')

const reiniciar = (r = { status: 200, body: { ok: true } }) => { pedidos = []; respuesta = r }

// #296: Fastify rechaza con 400 "Bad Request" (FST_ERR_CTP_EMPTY_JSON_BODY) un pedido
// con Content-Type: application/json y sin cuerpo. Borrar una línea del informe es un
// DELETE sin cuerpo: no tiene que mandar ese encabezado.
test('un pedido sin cuerpo no manda Content-Type JSON (si no, Fastify responde 400)', async () => {
  reiniciar()
  await api.imDelLinea(7, 42)
  const { url, init } = pedidos[0]
  assert.equal(url, '/api/informe-mensual/7/linea/42')
  assert.equal(init.method, 'DELETE')
  assert.equal(init.body, undefined)
  assert.equal(init.headers['Content-Type'], undefined)
  assert.equal(init.headers.Authorization, 'Bearer tok')
})

test('un pedido con cuerpo sigue mandando JSON', async () => {
  reiniciar()
  await api.imPutLinea(7, { mes: '2026-09' })
  const { init } = pedidos[0]
  assert.equal(init.headers['Content-Type'], 'application/json')
  assert.equal(init.body, JSON.stringify({ mes: '2026-09' }))
})

test('el mensaje propio del servidor ({ error }) llega tal cual', async () => {
  reiniciar({ status: 400, body: { error: 'El concepto tiene que tener entre 1 y 80 caracteres.' } })
  await assert.rejects(api.imPutLinea(7, {}), (e) => e instanceof ApiError && e.status === 400 && e.message === 'El concepto tiene que tener entre 1 y 80 caracteres.')
})

test('un error del framework ("Bad Request", en inglés y con código) no se muestra: va uno en castellano', async () => {
  reiniciar({ status: 400, body: { statusCode: 400, code: 'FST_ERR_CTP_EMPTY_JSON_BODY', error: 'Bad Request', message: "Body cannot be empty when content-type is set to 'application/json'" } })
  await assert.rejects(api.imDelLinea(7, 42), (e) => {
    assert.equal(e.status, 400)
    assert.doesNotMatch(e.message, /Bad Request|Body cannot|FST_|\d{3}/)
    assert.match(e.message, /No se pudo/)
    return true
  })
})

test('sin cuerpo de error tampoco se muestra un código ("Error 400")', async () => {
  reiniciar({ status: 400, body: null })
  await assert.rejects(api.imDelLinea(7, 42), (e) => !/\d/.test(e.message) && /No se pudo/.test(e.message))
})
