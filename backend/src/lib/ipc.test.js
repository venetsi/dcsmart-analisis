import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearIpc, mesesEntre } from './ipc.js'

// Base falsa: guarda filas de rv_ipc en memoria y entiende las dos consultas del módulo.
function baseFalsa (inicial = []) {
  const filas = new Map(inicial.map((f) => [f.mes, { ...f }]))
  return {
    filas,
    async query (sql, p) {
      if (sql.startsWith('SELECT')) {
        return { rows: [...filas.values()].filter((f) => f.mes >= p[0] && f.mes <= p[1]).sort((a, b) => a.mes.localeCompare(b.mes)) }
      }
      const [mes, variacion] = p
      const prev = filas.get(mes)
      if (!prev) filas.set(mes, { mes, variacion, fuente: 'indec', actualizado_por: 'INDEC' })
      else if (prev.fuente === 'indec') prev.variacion = variacion
      return { rows: [] }
    },
  }
}
const serie = { data: [['2025-07-01', 9023.973], ['2025-08-01', 9193.2441], ['2025-09-01', 9384.0922]] }

test('meses entre dos fechas', () => {
  assert.deepEqual(mesesEntre('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02'])
})
test('si falta un mes terminado consulta INDEC y no pisa lo cargado a mano', async () => {
  const db = baseFalsa([{ mes: '2025-09', variacion: 2.1, fuente: 'mano', actualizado_por: 'yo' }])
  const urls = []
  const ipc = crearIpc({ db, pedir: async (u) => { urls.push(u); return serie } })
  const r = await ipc.leer('2025-08', '2025-09', new Date('2025-10-20'))
  assert.equal(urls.length, 1)
  assert.match(urls[0], /start_date=2025-07-01/)
  assert.deepEqual(r['2025-08'], { variacion: 1.8758, fuente: 'indec', por: 'INDEC', at: undefined })
  assert.equal(r['2025-09'].variacion, 2.1)
  assert.equal(r['2025-09'].fuente, 'mano')
})
test('INDEC caído: devuelve lo que hay y no vuelve a intentar enseguida', async () => {
  const db = baseFalsa()
  let n = 0
  const ipc = crearIpc({ db, pedir: async () => { n++; throw new Error('caído') }, log: { warn () {} } })
  assert.deepEqual(await ipc.leer('2025-08', '2025-09', new Date('2025-10-20')), {})
  await ipc.leer('2025-08', '2025-09', new Date('2025-10-20'))
  assert.equal(n, 1)
})
test('el mes en curso no se busca', async () => {
  const db = baseFalsa([{ mes: '2025-09', variacion: 2, fuente: 'indec' }])
  let n = 0
  const ipc = crearIpc({ db, pedir: async () => { n++; return serie } })
  await ipc.leer('2025-09', '2025-10', new Date('2025-10-20'))
  assert.equal(n, 0)
})
