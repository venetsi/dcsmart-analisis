import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarMail, secciones, formatearValor } from './mail.js'
import { normalizar } from './hallazgos.js'
import { armarCuerpo, enviarMail } from './envio.js'

const ventana = { desde: '2026-10-01', hasta: '2026-10-15', nombre: '1ª quincena de octubre de 2026' }
const h = (x) => normalizar({ local: 'ROMA', grupo: 'GRUPO LA FUERZA', referencia: 'OP 1', cantidad: 1, ...x })

test('pesos y cantidades en formato argentino', () => {
  assert.equal(formatearValor(1234567.4, 'pesos').replace(/\s/g, ' '), '$ 1.234.567')
  assert.equal(formatearValor(1500, 'cantidad'), '1.500')
  assert.equal(formatearValor(null, 'pesos'), '')
})

test('normaliza los tipos de BigQuery', () => {
  const n = normalizar({ regla: 'x', severidad: 'alta', fecha: { value: '2026-10-02' }, valor: '1500.50', cantidad: 2 })
  assert.equal(n.fecha, '2026-10-02')
  assert.equal(n.valor, 1500.5)
})

test('las secciones van por severidad y después por el orden del catálogo', () => {
  const s = secciones([
    h({ regla: 'pico_de_cargas', severidad: 'baja' }),
    h({ regla: 'caja_repetida', severidad: 'alta' }),
    h({ regla: 'pago_factura_repetida', severidad: 'alta' }),
    h({ regla: 'caja_repetida', severidad: 'alta', local: 'ADA' }),
  ])
  assert.deepEqual(s.map((x) => `${x.severidad}:${x.regla}:${x.filas.length}`),
    ['alta:pago_factura_repetida:1', 'alta:caja_repetida:2', 'baja:pico_de_cargas:1'])
})

test('el mail muestra las cifras tal cual, corta en el máximo por regla y escapa el HTML', () => {
  const hallazgos = [
    ...Array.from({ length: 30 }, (_, i) => h({ regla: 'caja_repetida', severidad: 'alta', fecha: '2026-10-02', valor: 1000 + i, detalle: `caja ${i}` })),
    h({ regla: 'pago_datos_faltantes', severidad: 'media', local: '<b>X</b>', valor: 5000, detalle: 'sin rubro' }),
  ]
  const m = armarMail({ hallazgos, ventana, maxPorRegla: 25 })
  assert.match(m.asunto, /1ª quincena de octubre de 2026 · 30 para revisar ya, 31 en total/)
  assert.match(m.html, /Ventas cargadas dos veces/)
  assert.match(m.html, /Y 5 más en la tabla de hallazgos/)
  assert.match(m.html, /&lt;b&gt;X&lt;\/b&gt;/)
  assert.doesNotMatch(m.html, /<b>X<\/b>/)
  assert.match(m.texto, /02\/10\/2026/)
})

test('sin hallazgos el mail lo dice', () => {
  const m = armarMail({ hallazgos: [], ventana })
  assert.match(m.asunto, /sin hallazgos/)
  assert.match(m.texto, /No se encontró nada/)
})

test('envío: arma el pedido a EnvíaloSimple y no expone la clave en el error', async () => {
  assert.deepEqual(armarCuerpo({ from: { email: 'a@b.c', name: 'DC' }, to: ['x@y.z'], subject: 's', html: 'h', text: 't' }),
    { from: { email: 'a@b.c', name: 'DC' }, to: [{ email: 'x@y.z' }], subject: 's', html: 'h', text: 't' })
  let pedido
  await enviarMail({
    apiKey: 'CLAVE', from: { email: 'a@b.c' }, to: ['x@y.z'], subject: 's', html: 'h', text: 't',
    fetchFn: async (url, op) => { pedido = { url, op }; return { ok: true, text: async () => '{}' } },
  })
  assert.equal(pedido.op.headers.Authorization, 'Bearer CLAVE')
  await assert.rejects(enviarMail({
    apiKey: 'CLAVE', from: { email: 'a@b.c' }, to: ['x@y.z'], subject: 's', html: 'h', text: 't',
    fetchFn: async () => ({ ok: false, status: 400, text: async () => '{"error":"to_invalid"}' }),
  }), (e) => /to_invalid/.test(e.message) && !/CLAVE/.test(e.message))
  await assert.rejects(enviarMail({ apiKey: '', from: { email: 'a' }, to: ['x'] }), /Falta ENVIALOSIMPLE_API_KEY/)
  await assert.rejects(enviarMail({ apiKey: 'k', from: { email: 'a' }, to: [] }), /entre 1 y 10/)
})
