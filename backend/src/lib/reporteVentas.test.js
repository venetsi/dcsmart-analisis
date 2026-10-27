import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esInterno, okDato, normalizarDato, mesCerrable, okMes, rangoReporte, nombresOk, snapshotOk, datoEnSnapshot, okOrigenRegla, datoLibre, obsOk, paginaOk, ipcOk, variacionesIpc } from './reporteVentas.js'

test('esInterno: el is_admin externo no alcanza', () => {
  assert.equal(esInterno({ roles: ['dcsmart'] }), true)
  assert.equal(esInterno({ roles: ['super_admin'] }), true)
  assert.equal(esInterno({ roles: ['externo'], admin: true }), false)
})
test('okDato', () => {
  for (const d of ['venta', 'cubiertos', 'ordenes', 'canal:Eventos', 'tickets:Rappi']) assert.equal(okDato(d), true)
  for (const d of ['canal:Local', 'canal:', 'otra', 'canal:' + 'x'.repeat(41)]) assert.equal(okDato(d), false)
})
test('mesCerrable: solo meses terminados', () => {
  assert.equal(mesCerrable('2026-09', new Date('2026-10-20')), true)
  assert.equal(mesCerrable('2026-10', new Date('2026-10-20')), false)
})
test('okDato: el nombre no puede ser vacio ni solo espacios', () => {
  assert.equal(okDato('canal: '), false)
  assert.equal(okDato('tickets:   '), false)
  assert.equal(okDato('canal: Local'), false)
})
test('normalizarDato: devuelve la clave canonica o null', () => {
  assert.equal(normalizarDato('canal: Eventos '), 'canal:Eventos')
  assert.equal(normalizarDato('tickets: Rappi'), 'tickets:Rappi')
  assert.equal(normalizarDato('venta'), 'venta')
  assert.equal(normalizarDato('canal: '), null)
  assert.equal(normalizarDato('canal: Local '), null)
  assert.equal(normalizarDato(5), null)
})
test('okMes', () => {
  for (const m of ['2026-01', '2026-12']) assert.equal(okMes(m), true)
  for (const m of ['2026-00', '2026-13', '2026-1', '', null, undefined, '2026-10-01']) assert.equal(okMes(m), false)
})
test('rangoReporte', () => {
  assert.deepEqual(rangoReporte('2026-01'), { desde: '2025-01-01', hasta: '2026-01-31' })
  assert.equal(rangoReporte('2026-12').hasta, '2026-12-31')
  assert.equal(rangoReporte('2024-02').hasta, '2024-02-29')
})

test('nombresOk: recorta, descarta locales ajenos y valida el largo', () => {
  const locales = ['A', 'B']
  assert.equal(nombresOk(undefined, locales), undefined)
  assert.deepEqual(nombresOk({ A: '  Togni\'s  ', B: '   ', C: 'x' }, locales), { A: "Togni's" })
  assert.equal(nombresOk({ A: 'x'.repeat(61) }, locales), null)
  assert.equal(nombresOk({ A: 5 }, locales), null)
  assert.equal(nombresOk(['A'], locales), null)
  assert.equal(nombresOk(null, locales), null)
  assert.deepEqual(nombresOk({ A: 'x'.repeat(60) }, locales), { A: 'x'.repeat(60) })
})

test('snapshotOk: locales tiene que ser un objeto', () => {
  assert.equal(snapshotOk({ locales: { A: { venta: 1 } } }), true)
  assert.equal(snapshotOk({ locales: {} }), true)
  for (const s of [null, [], {}, { locales: null }, { locales: [] }, { locales: 'x' }]) assert.equal(snapshotOk(s), false)
})
test('datoEnSnapshot: solo lo que la foto trae con valor', () => {
  const s = { locales: { A: { venta: 100, cubiertos: null, canales: { Rappi: 10, Local: 90 }, tickets: { Rappi: 5 } } } }
  assert.equal(datoEnSnapshot(s, 'A', 'venta'), true)
  assert.equal(datoEnSnapshot(s, 'A', 'cubiertos'), false)
  assert.equal(datoEnSnapshot(s, 'A', 'ordenes'), false)
  assert.equal(datoEnSnapshot(s, 'A', 'canal:Rappi'), true)
  assert.equal(datoEnSnapshot(s, 'A', 'canal:Eventos'), false)
  assert.equal(datoEnSnapshot(s, 'A', 'tickets:Rappi'), true)
  assert.equal(datoEnSnapshot(s, 'A', 'tickets:Cheaf'), false)
  assert.equal(datoEnSnapshot(s, 'B', 'venta'), false)
})
test('okOrigenRegla: solo DCSMART', () => {
  assert.equal(okOrigenRegla('DCSMART'), true)
  assert.equal(okOrigenRegla(' dcsmart '), true)
  for (const v of ['TAPTAP', 'FFUDO', 'FUDO', '', null]) assert.equal(okOrigenRegla(v), false)
})

test('logosOk: acepta imágenes en base64, descarta locales ajenos y rechaza lo demás', async () => {
  const { logosOk } = await import('./reporteVentas.js')
  const png = 'data:image/png;base64,iVBORw0KGgo='
  const locales = ['A', 'B']
  assert.equal(logosOk(undefined, locales), undefined)
  assert.deepEqual(logosOk({ A: png, C: png, B: null }, locales), { A: png })
  assert.equal(logosOk({ A: 'data:text/html;base64,PHNjcmlwdD4=' }, locales), null)
  assert.equal(logosOk({ A: 'https://x.com/logo.png' }, locales), null)
  assert.equal(logosOk({ A: 'data:image/svg+xml;base64,PHN2Zz4=' }, locales), null)
  assert.equal(logosOk({ A: `data:image/png;base64,${'A'.repeat(400 * 1024)}` }, locales), null)
  assert.equal(logosOk([png], locales), null)
})

test('datos libres: cubiertos, órdenes y tickets; la venta y los canales no', () => {
  assert.equal(datoLibre('cubiertos'), true)
  assert.equal(datoLibre('ordenes'), true)
  assert.equal(datoLibre('tickets:Rappi'), true)
  assert.equal(datoLibre('venta'), false)
  assert.equal(datoLibre('canal:Rappi'), false)
})
test('observaciones: hasta 280 caracteres, recortadas; páginas con id válido', () => {
  assert.equal(obsOk('  Cerró por obra 5 días.  '), 'Cerró por obra 5 días.')
  assert.equal(obsOk(''), '')
  assert.equal(obsOk('x'.repeat(281)), null)
  assert.equal(obsOk(5), null)
  assert.equal(paginaOk('sintesis'), true)
  assert.equal(paginaOk('mes:LATINO TACUARI 185'), true)
  assert.equal(paginaOk('mes:'), false)
  assert.equal(paginaOk('../x'), false)
  // hojas del informe mensual: claves con guion bajo y varias partes
  assert.equal(paginaOk('pyl_acumulado:LATINO TACUARI 185:1'), true)
  assert.equal(paginaOk('ind_locales'), true)
  assert.equal(paginaOk('_x'), false)
  // detalle:<local largo>:<grupo>:2 pasa de 60 caracteres después de la clave
  assert.equal(paginaOk(`detalle:${'L'.repeat(80)}:impositivos:2`), true)
  assert.equal(paginaOk(`detalle:${'L'.repeat(121)}`), false)
})
test('IPC: variación mensual desde el índice de INDEC, sin saltar huecos', () => {
  const v = variacionesIpc([['2025-08-01', 9193.2441], ['2025-09-01', 9384.0922], ['2025-11-01', 9841.3581]])
  assert.deepEqual(v, { '2025-09': 2.0760 })
  assert.equal(ipcOk(2.1), true)
  assert.equal(ipcOk(null), true)
  assert.equal(ipcOk(150), false)
  assert.equal(ipcOk('2'), false)
})
