import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseNumeroAR, fmtAR, canalesAuto, armarLocal, armarReporte, snapshotDe } from './reporteVentas.js'

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
  assert.equal(parseNumeroAR('(-5)'), null)
  assert.equal(parseNumeroAR('abc'), null)
  assert.equal(parseNumeroAR('-'), null)
})

test('fmtAR', () => {
  assert.equal(fmtAR(316106840), '316.106.840')
  assert.equal(fmtAR(-14352110), '(14.352.110)')
  assert.equal(fmtAR(-4.34, 2), '-4,34')
  assert.equal(fmtAR(null), '—')
})

const HOY = new Date('2026-10-20T12:00:00')

const pizzaAuto = { meses: { '2026-08': { venta: 330458950 }, '2026-09': { venta: 316106840 }, '2025-09': { venta: 242799580 } },
  canales: { '2026-09': canalesAuto({ detalles: [{ metodo: 'Rappi', monto: 55114440 }, { metodo: 'PedidosYa', monto: 39544560 }, { metodo: 'MP QR', monto: 77167295 }], cajasOrigen: [], reglas: [] }) } }

test('Togni\'s Pizza sep-26 reproduce el deck al peso', () => {
  const l = armarLocal({ local: 'TOGNIS-PIZZA', mes: '2026-09', auto: pizzaAuto, valores: [], cierres: [] })
  const c = Object.fromEntries(l.canales.map((x) => [x.nombre, x]))
  assert.equal(c['Local'].valor, 221447840); assert.equal(c['Local'].fuente, 'calc')
  assert.equal(c['Rappi'].valor, 55114440); assert.equal(c['Rappi'].inc, 17.44)
  assert.equal(c['Pedidos Ya'].valor, 39544560); assert.equal(c['Pedidos Ya'].inc, 12.51)
  assert.equal(c['Local'].inc, 70.05)
  assert.equal(l.canales[l.canales.length - 1].nombre, 'Local')
  assert.equal(c['MP QR'], undefined)
  const sep = l.historico.find((h) => h.mes === '2026-09')
  assert.equal(sep.varPesos, -14352110); assert.equal(sep.varPct, -4.34); assert.equal(sep.varAnual, 30.19)
  assert.equal(sep.anterior, 242799580)
  assert.deepEqual(l.historico.map((h) => h.mes), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
  // Enero sin datos: falta, sin variaciones
  const ene = l.historico[0]
  assert.deepEqual([ene.venta.valor, ene.venta.fuente, ene.varPesos, ene.varPct, ene.varAnual], [null, 'falta', null, null, null])
})
test('Togni\'s Café: las cajas manuales van al canal de la regla', () => {
  const canales = canalesAuto({ detalles: [{ metodo: 'Rappi', monto: 6946500 }], cajasOrigen: [{ origin: 'DCSMART', total: 1504016 }],
    reglas: [{ match: 'origen', valor: 'DCSMART', canal: 'Cheaf', delivery: true }] })
  const l = armarLocal({ local: 'TOGNIS-CAFE', mes: '2026-09', auto: { meses: { '2026-09': { venta: 80003001 } }, canales: { '2026-09': canales } }, valores: [], cierres: [] })
  assert.equal(l.canales.find((x) => x.nombre === 'Local').valor, 71552485)
})
test('canalesAuto: nombres normalizados, efectivo suma a la app, la regla manda', () => {
  const c = canalesAuto({ detalles: [{ metodo: 'PedidosYa', monto: 100 }, { metodo: 'peya', monto: 50 }, { metodo: 'Pedidos Ya Efectivo', monto: 25 },
    { metodo: 'rappi', monto: 10 }, { metodo: 'MP Delivery', monto: 7 }, { metodo: 'Uber Eats', monto: 3 }, { metodo: 'Efectivo', monto: 999 },
    { metodo: 'BigBox', monto: 40 }], cajasOrigen: [{ origin: 'FUDO', total: 5000 }],
  reglas: [{ match: 'metodo', valor: 'bigbox', canal: 'BigBox', delivery: false }, { match: 'metodo', valor: 'MP Delivery', canal: 'Ecommerce', delivery: false }] })
  assert.deepEqual(c, [
    { nombre: 'Pedidos Ya', valor: 175, delivery: true },
    { nombre: 'Rappi', valor: 10, delivery: true },
    { nombre: 'Ecommerce', valor: 7, delivery: false },
    { nombre: 'Uber Eats', valor: 3, delivery: true },
    { nombre: 'BigBox', valor: 40, delivery: false },
  ])
})
test('canalesAuto: \'Pedido Ya\' de Fudo (singular) es Pedidos Ya y no queda en Local', () => {
  const c = canalesAuto({ detalles: [{ metodo: 'Pedido Ya', monto: 100 }, { metodo: 'Pedido Ya Efectivo', monto: 20 }, { metodo: 'PedidosYa', monto: 5 }], cajasOrigen: [], reglas: [] })
  assert.deepEqual(c, [{ nombre: 'Pedidos Ya', valor: 125, delivery: true }])
  const l = armarLocal({ local: 'F', mes: '2026-09', auto: { meses: { '2026-09': { venta: 1000 } }, canales: { '2026-09': c } }, valores: [], cierres: [] })
  assert.equal(l.canales.find((x) => x.nombre === 'Local').valor, 875)
})
test('mes cerrado con un canal a mano: Local se recalcula', () => {
  const l = armarLocal({ local: 'P', mes: '2026-09', auto: { meses: {}, canales: {} },
    valores: [{ local: 'P', mes: '2026-09', dato: 'canal:Eventos', valor: 20 }],
    cierres: [{ mes: '2026-09', origen: 'reporte', snapshot: { locales: { P: { venta: 100, canales: { Rappi: 30, Local: 70 } } } } }] })
  const c = Object.fromEntries(l.canales.map((x) => [x.nombre, x]))
  assert.deepEqual([c['Local'].valor, c['Local'].fuente], [50, 'calc'])
  assert.equal(l.canales.reduce((t, x) => t + x.inc, 0), 100)
})
test('un canal sin valor deja Local en falta, no lo cuenta como 0', () => {
  const l = armarLocal({ local: 'P', mes: '2026-09', auto: { meses: { '2026-09': { venta: 100 } }, canales: {} },
    valores: [{ local: 'P', mes: '2026-09', dato: 'canal:Eventos', valor: null }], cierres: [] })
  const c = Object.fromEntries(l.canales.map((x) => [x.nombre, x]))
  assert.deepEqual([c['Eventos'].valor, c['Eventos'].fuente], [null, 'mano'])
  assert.deepEqual([c['Local'].valor, c['Local'].fuente, c['Local'].inc], [null, 'falta', null])
})
test('Danzon: Eventos a mano baja Local, el total no se mueve', () => {
  const l = armarLocal({ local: 'GRAN-DANZON', mes: '2026-09', auto: { meses: { '2026-09': { venta: 144913430 } }, canales: { '2026-09': [] } },
    valores: [{ local: 'GRAN-DANZON', mes: '2026-09', dato: 'canal:Eventos', valor: 22358161 }, { local: 'GRAN-DANZON', mes: '2026-09', dato: 'canal:Rappi/PY', valor: 232608 }], cierres: [] })
  assert.equal(l.venta.valor, 144913430)
  assert.equal(l.canales.find((x) => x.nombre === 'Local').valor, 122322661)
  assert.equal(l.canales.find((x) => x.nombre === 'Eventos').fuente, 'mano')
})
test('Evelia: cubiertos corregidos guardan el original', () => {
  const l = armarLocal({ local: 'EVELIA', mes: '2026-09', auto: { meses: { '2026-09': { venta: 396160370, cubiertos: 6274 } }, canales: {} },
    valores: [{ local: 'EVELIA', mes: '2026-09', dato: 'cubiertos', valor: 6125, original: 6274, actualizado_por: 'x@dcsmart.app' }], cierres: [] })
  assert.deepEqual([l.cubiertos.valor, l.cubiertos.fuente, l.cubiertos.original], [6125, 'mano', 6274])
  assert.equal(l.cubiertos.por, 'x@dcsmart.app')
  assert.equal(Math.round(l.promCubierto), 64679)
})
test('un mes cerrado manda sobre lo automático', () => {
  const l = armarLocal({ local: 'TOGNIS-PIZZA', mes: '2026-09', auto: { meses: { '2026-08': { venta: 1 }, '2026-09': { venta: 316106840 } }, canales: {} },
    valores: [], cierres: [{ mes: '2026-08', origen: 'deck', snapshot: { locales: { 'TOGNIS-PIZZA': { venta: 330458950 } } } }] })
  const ago = l.historico.find((h) => h.mes === '2026-08')
  assert.deepEqual([ago.venta.valor, ago.venta.fuente], [330458950, 'cerrado'])
})
test('el año anterior sale del cierre si existe', () => {
  const l = armarLocal({ local: 'P', mes: '2026-09', auto: { meses: { '2025-09': { venta: 1 }, '2026-09': { venta: 200 } }, canales: {} },
    valores: [], cierres: [{ mes: '2025-09', origen: 'deck', snapshot: { locales: { P: { venta: 100 } } } }] })
  const sep = l.historico.find((h) => h.mes === '2026-09')
  assert.equal(sep.anterior, 100); assert.equal(sep.varAnual, 100)
})
test('sin cajas es falta, no cero; sin cubiertos no hay promedio', () => {
  const l = armarLocal({ local: 'X', mes: '2026-09', auto: { meses: {}, canales: {} }, valores: [], cierres: [] })
  assert.deepEqual([l.venta.valor, l.venta.fuente], [null, 'falta'])
  assert.equal(l.promCubierto, null)
  assert.equal(l.canales.find((x) => x.nombre === 'Local').valor, null)
  const l2 = armarLocal({ local: 'X', mes: '2026-09', auto: { meses: { '2026-09': { venta: 100, cubiertos: 0 } }, canales: {} }, valores: [], cierres: [] })
  assert.equal(l2.promCubierto, null)
})
test('Local negativo bloquea el cierre', () => {
  const l = armarLocal({ local: 'X', mes: '2026-09', auto: { meses: { '2026-09': { venta: 100 } }, canales: {} },
    valores: [{ local: 'X', mes: '2026-09', dato: 'canal:Eventos', valor: 150 }], cierres: [] })
  const r = armarReporte({ cliente: { nombre: 'X', locales: ['X'] }, mes: '2026-09', porLocal: { X: l }, cierres: [], hoy: HOY })
  assert.equal(r.puedeCerrar, false); assert.match(r.motivos[0], /X: Local queda negativo/)
})
test('un mes que no terminó no se puede cerrar', () => {
  const l = armarLocal({ local: 'X', mes: '2026-10', auto: { meses: { '2026-10': { venta: 100 } }, canales: {} }, valores: [], cierres: [] })
  const r = armarReporte({ cliente: { nombre: 'X', locales: ['X'] }, mes: '2026-10', porLocal: { X: l }, cierres: [], hoy: HOY })
  assert.equal(r.puedeCerrar, false)
  assert.equal(r.motivos.length, 1); assert.match(r.motivos[0], /no terminó/)
  assert.equal(r.consolidado, null)
  assert.deepEqual(r.paginas.map((p) => p.tipo), ['portada', 'mes', 'historico', 'contraportada'])
})
test('consolidado de Grupo Perros sep-26', () => {
  // Setup: Togni's Café con Rappi (delivery), Togni's Pizza con Rappi y Pedidos Ya (delivery),
  // Evelia sin canales. Esperado: página delivery solo en Café y Pizza.
  const cafe = armarLocal({ local: 'TOGNIS-CAFE', mes: '2026-09', auto: { meses: { '2026-09': { venta: 80003001 } },
    canales: { '2026-09': canalesAuto({ detalles: [{ metodo: 'Rappi', monto: 6946500 }], cajasOrigen: [], reglas: [] }) } }, valores: [], cierres: [] })
  const pizza = armarLocal({ local: 'TOGNIS-PIZZA', mes: '2026-09', auto: pizzaAuto, valores: [], cierres: [] })
  const evelia = armarLocal({ local: 'EVELIA', mes: '2026-09', auto: { meses: { '2026-09': { venta: 396160370 } }, canales: {} }, valores: [], cierres: [] })
  const r = armarReporte({ cliente: { nombre: 'Grupo Perros', locales: ['TOGNIS-CAFE', 'TOGNIS-PIZZA', 'EVELIA'] }, mes: '2026-09',
    porLocal: { 'TOGNIS-CAFE': cafe, 'TOGNIS-PIZZA': pizza, EVELIA: evelia }, cierres: [], hoy: HOY })
  assert.equal(r.consolidado.total, 792270211)
  assert.deepEqual(r.consolidado.filas.map((f) => [f.local, f.valor, f.inc]),
    [['TOGNIS-CAFE', 80003001, 10.10], ['TOGNIS-PIZZA', 316106840, 39.90], ['EVELIA', 396160370, 50.00]])
  assert.deepEqual(r.paginas.map((p) => [p.tipo, p.local]), [
    ['portada', undefined], ['consolidado', undefined],
    ['mes', 'TOGNIS-CAFE'], ['historico', 'TOGNIS-CAFE'], ['delivery', 'TOGNIS-CAFE'],
    ['mes', 'TOGNIS-PIZZA'], ['historico', 'TOGNIS-PIZZA'], ['comparativo', 'TOGNIS-PIZZA'], ['delivery', 'TOGNIS-PIZZA'],
    ['mes', 'EVELIA'], ['historico', 'EVELIA'],
    ['contraportada', undefined]])
  assert.equal(new Set(r.paginas.map((p) => p.id)).size, r.paginas.length)
  assert.equal(r.puedeCerrar, true); assert.deepEqual(r.motivos, [])
  assert.equal(r.consolidado.historico.find((h) => h.mes === '2026-09').total, 792270211)
  // Agosto falta en Café y Evelia: el total no se inventa
  assert.equal(r.consolidado.historico.find((h) => h.mes === '2026-08').total, null)
})
test('delivery por app con tickets a mano, y snapshotDe', () => {
  const l = armarLocal({ local: 'TOGNIS-PIZZA', mes: '2026-09', auto: pizzaAuto,
    valores: [{ local: 'TOGNIS-PIZZA', mes: '2026-09', dato: 'tickets:Rappi', valor: 1000 }, { local: 'TOGNIS-PIZZA', mes: '2026-09', dato: 'ordenes', valor: '2000' }], cierres: [] })
  const sep = l.delivery.find((d) => d.mes === '2026-09')
  const sinDato = ({ ticketsDato, ...x }) => x
  assert.deepEqual(sinDato(sep.apps['Rappi']), { venta: 55114440, tickets: 1000, prom: 55114.44 })
  assert.deepEqual(sinDato(sep.apps['Pedidos Ya']), { venta: 39544560, tickets: null, prom: null })
  assert.deepEqual([sep.apps['Rappi'].ticketsDato.valor, sep.apps['Rappi'].ticketsDato.fuente], [1000, 'mano'])
  assert.deepEqual(sep.apps['Pedidos Ya'].ticketsDato, { valor: null, fuente: 'falta' })
  assert.equal(sep.total, 94659000)
  assert.equal(l.ordenes.valor, 2000)
  const r = armarReporte({ cliente: { nombre: 'P', locales: ['TOGNIS-PIZZA'] }, mes: '2026-09', porLocal: { 'TOGNIS-PIZZA': l }, cierres: [], hoy: HOY })
  assert.deepEqual(snapshotDe(r), { locales: { 'TOGNIS-PIZZA': { venta: 316106840, cubiertos: null, ordenes: 2000,
    canales: { Rappi: 55114440, 'Pedidos Ya': 39544560, Local: 221447840 }, tickets: { Rappi: 1000 }, delivery: ['Rappi', 'Pedidos Ya'] } } })
})
test('un cierre armado con snapshotDe se relee igual', () => {
  const l = armarLocal({ local: 'TOGNIS-PIZZA', mes: '2026-09', auto: pizzaAuto, valores: [], cierres: [] })
  const r = armarReporte({ cliente: { nombre: 'P', locales: ['TOGNIS-PIZZA'] }, mes: '2026-09', porLocal: { 'TOGNIS-PIZZA': l }, cierres: [], hoy: HOY })
  const cierre = { mes: '2026-09', origen: 'reporte', snapshot: snapshotDe(r) }
  const l2 = armarLocal({ local: 'TOGNIS-PIZZA', mes: '2026-09', auto: { meses: {}, canales: {} }, valores: [], cierres: [cierre] })
  assert.deepEqual(l2.canales.map((c) => [c.nombre, c.valor, c.fuente, c.inc, c.delivery]), [
    ['Rappi', 55114440, 'cerrado', 17.44, true], ['Pedidos Ya', 39544560, 'cerrado', 12.51, true], ['Local', 221447840, 'cerrado', 70.05, false]])
  assert.deepEqual([l2.venta.valor, l2.venta.fuente], [316106840, 'cerrado'])
})

// ---- cubiertos / órdenes parciales (Ruling 21) ----
test('Pizza: cubiertos que suman 0 con venta son falta, no 0', () => {
  const l = armarLocal({ local: 'TOGNIS-PIZZA', mes: '2026-09', valores: [], cierres: [],
    auto: { meses: { '2026-09': { venta: 316106840, cubiertos: 0, ordenes: 0, cajas: 60, sinCubiertos: 60, sinOrdenes: 60 } }, canales: {} } })
  assert.deepEqual([l.cubiertos.valor, l.cubiertos.fuente], [null, 'falta'])
  assert.deepEqual(l.cubiertos.parcial, { valor: 0, cajas: 60, sin: 60 })
  assert.deepEqual([l.ordenes.valor, l.ordenes.fuente], [null, 'falta'])
  assert.equal(l.promCubierto, null)
  // Sin el conteo de cajas, la regla de suma 0 con venta alcanza.
  const l2 = armarLocal({ local: 'P', mes: '2026-09', valores: [], cierres: [], auto: { meses: { '2026-09': { venta: 100, cubiertos: 0 } }, canales: {} } })
  assert.deepEqual([l2.cubiertos.valor, l2.cubiertos.fuente], [null, 'falta'])
})
test('Café: 3 cubiertos con 59 de 66 cajas sin dato es falta, con el parcial como pista', () => {
  const l = armarLocal({ local: 'TOGNIS-CAFE', mes: '2026-09', valores: [], cierres: [],
    auto: { meses: { '2026-09': { venta: 80003001, cubiertos: 3, ordenes: 1500, cajas: 66, sinCubiertos: 59, sinOrdenes: 0 } }, canales: {} } })
  assert.deepEqual(l.cubiertos, { valor: null, fuente: 'falta', parcial: { valor: 3, cajas: 66, sin: 59 } })
  assert.equal(l.promCubierto, null)
  assert.deepEqual(l.ordenes, { valor: 1500, fuente: 'auto' })
  // Cargado a mano, manda la mano y no queda pista.
  const l2 = armarLocal({ local: 'TOGNIS-CAFE', mes: '2026-09', cierres: [],
    valores: [{ local: 'TOGNIS-CAFE', mes: '2026-09', dato: 'cubiertos', valor: 2900, original: null }],
    auto: { meses: { '2026-09': { venta: 80003001, cubiertos: 3, cajas: 66, sinCubiertos: 59 } }, canales: {} } })
  assert.deepEqual([l2.cubiertos.valor, l2.cubiertos.fuente, l2.cubiertos.parcial], [2900, 'mano', undefined])
})
test('datos completos de todas las cajas son automáticos', () => {
  const l = armarLocal({ local: 'EVELIA', mes: '2026-09', valores: [], cierres: [],
    auto: { meses: { '2026-09': { venta: 396160370, cubiertos: 6274, ordenes: 100, cajas: 60, sinCubiertos: 0, sinOrdenes: 0 } }, canales: {} } })
  assert.deepEqual(l.cubiertos, { valor: 6274, fuente: 'auto' })
  assert.deepEqual(l.ordenes, { valor: 100, fuente: 'auto' })
})
test('venta automática en 0 con cajas es falta', () => {
  const l = armarLocal({ local: 'X', mes: '2026-09', valores: [], cierres: [], auto: { meses: { '2026-09': { venta: 0, cajas: 3 } }, canales: {} } })
  assert.deepEqual([l.venta.valor, l.venta.fuente], [null, 'falta'])
})
test('un parcial no toca un mes cerrado: el valor del deck queda', () => {
  const l = armarLocal({ local: 'P', mes: '2026-09', valores: [],
    cierres: [{ mes: '2026-09', origen: 'deck', snapshot: { locales: { P: { venta: 100, cubiertos: 7 } } } }],
    auto: { meses: { '2026-09': { venta: 100, cubiertos: 3, cajas: 5, sinCubiertos: 2 } }, canales: {} } })
  assert.deepEqual(l.cubiertos, { valor: 7, fuente: 'cerrado' })
})

// ---- delivery de un mes cerrado (Ruling 23) ----
test('mes cerrado: la foto dice qué canales son delivery (Ecommerce incluido)', () => {
  const cierres = [{ mes: '2026-08', origen: 'deck', snapshot: { locales: { 'TOGNIS-CAFE': {
    venta: 80000000, canales: { Rappi: 6000000, Cheaf: 1500000, Ecommerce: 500000 }, tickets: { Rappi: 300 },
    delivery: ['Rappi', 'Cheaf', 'Ecommerce'] } } } }]
  const l = armarLocal({ local: 'TOGNIS-CAFE', mes: '2026-08', auto: { meses: {}, canales: {} }, valores: [], cierres })
  const ago = l.delivery.find((d) => d.mes === '2026-08')
  assert.deepEqual(Object.keys(ago.apps).sort(), ['Cheaf', 'Ecommerce', 'Rappi'])
  assert.equal(ago.total, 8000000)
  assert.deepEqual([ago.apps.Rappi.ticketsDato.valor, ago.apps.Rappi.ticketsDato.fuente], [300, 'cerrado'])
  // Una foto vieja sin lista: solo las apps conocidas.
  const viejo = [{ ...cierres[0], snapshot: { locales: { 'TOGNIS-CAFE': { ...cierres[0].snapshot.locales['TOGNIS-CAFE'], delivery: undefined } } } }]
  const l2 = armarLocal({ local: 'TOGNIS-CAFE', mes: '2026-08', auto: { meses: {}, canales: {} }, valores: [], cierres: viejo })
  assert.deepEqual(Object.keys(l2.delivery.find((d) => d.mes === '2026-08').apps), ['Rappi'])
  // Un canal de la foto que no está en la lista no es delivery aunque sea app.
  const noDel = [{ ...cierres[0], snapshot: { locales: { 'TOGNIS-CAFE': { ...cierres[0].snapshot.locales['TOGNIS-CAFE'], delivery: ['Cheaf'] } } } }]
  const l3 = armarLocal({ local: 'TOGNIS-CAFE', mes: '2026-08', auto: { meses: {}, canales: {} }, valores: [], cierres: noDel })
  assert.deepEqual(Object.keys(l3.delivery.find((d) => d.mes === '2026-08').apps), ['Cheaf'])
})
test('con año anterior, cada local suma una hoja aparte de comparación después del histórico', () => {
  const l = armarLocal({ local: 'P', mes: '2026-09', auto: { meses: { '2025-09': { venta: 1 }, '2026-09': { venta: 200 } }, canales: {} },
    valores: [], cierres: [{ mes: '2025-09', origen: 'deck', snapshot: { locales: { P: { venta: 100 } } } }] })
  const r = armarReporte({ cliente: { nombre: 'P', locales: ['P'] }, mes: '2026-09', porLocal: { P: l }, cierres: [], hoy: HOY })
  assert.deepEqual(r.paginas.map((p) => p.tipo), ['portada', 'mes', 'historico', 'comparativo', 'contraportada'])
  assert.equal(new Set(r.paginas.map((p) => p.id)).size, r.paginas.length)
})
test('sin ventas del año anterior no hay hoja de comparación', () => {
  const l = armarLocal({ local: 'P', mes: '2026-09', auto: { meses: { '2026-09': { venta: 200 } }, canales: {} }, valores: [], cierres: [] })
  const r = armarReporte({ cliente: { nombre: 'P', locales: ['P'] }, mes: '2026-09', porLocal: { P: l }, cierres: [], hoy: HOY })
  assert.ok(!r.paginas.some((p) => p.tipo === 'comparativo'))
})
