import { test } from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { aceptarJsonVacio } from './jsonVacio.js'

async function app () {
  const a = Fastify()
  aceptarJsonVacio(a)
  a.delete('/linea/:id', async (req) => ({ ok: true, body: req.body ?? null }))
  a.put('/linea', async (req) => ({ ok: true, body: req.body }))
  a.post('/grande', { bodyLimit: 4 * 1024 * 1024 }, async (req) => ({ largo: req.body.s.length }))
  await a.ready()
  return a
}
const JSON_CT = { 'content-type': 'application/json' }

// #296: el front mandaba Content-Type JSON en el DELETE sin cuerpo de "Borrar la línea" /
// "Volver al de gestión" y Fastify respondía 400 "Bad Request" sin llegar a la ruta.
test('un DELETE con Content-Type JSON y sin cuerpo llega a la ruta', async () => {
  const a = await app()
  const r = await a.inject({ method: 'DELETE', url: '/linea/5', headers: JSON_CT })
  assert.equal(r.statusCode, 200)
  assert.deepEqual(r.json(), { ok: true, body: null })
})

test('un cuerpo JSON normal se sigue leyendo igual', async () => {
  const a = await app()
  const r = await a.inject({ method: 'PUT', url: '/linea', headers: JSON_CT, payload: JSON.stringify({ mes: '2026-09', monto: 10 }) })
  assert.deepEqual(r.json(), { ok: true, body: { mes: '2026-09', monto: 10 } })
})

test('un JSON roto sigue siendo 400 y se sigue bloqueando __proto__', async () => {
  const a = await app()
  assert.equal((await a.inject({ method: 'PUT', url: '/linea', headers: JSON_CT, payload: '{roto' })).statusCode, 400)
  assert.equal((await a.inject({ method: 'PUT', url: '/linea', headers: JSON_CT, payload: '{"__proto__":{"x":1}}' })).statusCode, 400)
})

test('se respeta el límite de tamaño propio de la ruta (cierre del mes, 4 MB)', async () => {
  const a = await app()
  const s = 'x'.repeat(2 * 1024 * 1024)
  const r = await a.inject({ method: 'POST', url: '/grande', headers: JSON_CT, payload: JSON.stringify({ s }) })
  assert.equal(r.statusCode, 200)
  assert.equal(r.json().largo, s.length)
})
