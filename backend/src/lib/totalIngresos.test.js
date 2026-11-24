// Trello #374: tests del cuadro "Total ingresos" (espejo de gestión 2.0).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarTotalIngresos, nombreApp, ES_APP_CANAL } from './totalIngresos.js'

const fila = (r, clave) => r.filas.find((f) => f.clave === clave)

test('las apps salen del punto de venta: su total, su efectivo y su parte del Z', () => {
  const r = armarTotalIngresos({
    cajas: [{ id: 'c1', tipo_turno: 'Noche', total: 1000, efectivo: 300, fiscal: 800 }],
    cobros: [
      { id_caja: 'c1', nombre: 'Rappi', monto: 100 },
      { id_caja: 'c1', nombre: 'PEYA EFECTIVO', monto: 50 },
      { id_caja: 'c1', nombre: 'MP QR', monto: 400 },
    ],
  })
  const pv = fila(r, 'punto_venta')
  assert.equal(pv.total, 850)
  assert.equal(pv.efectivo, 250)
  assert.equal(pv.digital, 600)
  assert.equal(pv.fiscal, 650)
  const apps = fila(r, 'aplicaciones')
  assert.equal(apps.total, 150)
  assert.equal(apps.efectivo, 50)
  assert.equal(apps.pct_fiscal, 100)
  assert.equal(apps.cantidad, 1) // una caja, aunque tenga dos apps
  assert.deepEqual(apps.hijos.map((h) => [h.nombre, h.total]), [['Rappi', 100], ['PedidosYa', 50]])
  // El total del cuadro es el de las cajas: nada se cuenta dos veces.
  assert.equal(r.total.total, 1000)
  assert.equal(r.total.efectivo, 300)
})

test('eventos: por caja de turno Evento y por rubro o categoría de gestión, cada uno en su sub-fila', () => {
  const r = armarTotalIngresos({
    cajas: [
      { id: 'e1', tipo_turno: 'Evento', total: 500, efectivo: 0, fiscal: 500 },
      { id: 'c1', tipo_turno: 'Mañana', total: 200, efectivo: 200, fiscal: 0 },
    ],
    partes: [
      { importe: 810, id_tipo: 'A', metodo: 'Transferencia', rubro: 'Eventos', categoria: 'Evento', clasificacion_pyl: 'Gastos Operativos' },
      { importe: 90, id_tipo: 'DC_1', metodo: 'Efectivo', rubro: 'Honorarios', categoria: 'Eventos', clasificacion_pyl: 'Gastos Operativos' },
    ],
  })
  const ev = fila(r, 'eventos')
  assert.deepEqual(ev.hijos.map((h) => [h.nombre, h.total, h.cantidad]), [
    ['En caja (turno Evento)', 500, 1], ['En gestión (rubro Eventos)', 900, 2],
  ])
  assert.equal(ev.total, 1400)
  // El cobro DC_1 en efectivo no es fiscal: es avión.
  assert.equal(ev.hijos[1].avion, 90)
  assert.equal(fila(r, 'otros').total, 0)
})

test('otros: el resto de gestión por Clasificación P&L, de mayor a menor', () => {
  const r = armarTotalIngresos({
    partes: [
      { importe: 1300000, id_tipo: 'DC_1', metodo: 'Mercado Pago', rubro: 'Ventas', clasificacion_pyl: 'Ventas' },
      { importe: 4757348, id_tipo: 'OTROS', metodo: 'Cuenta Cte.', rubro: 'CMV Alimentos', clasificacion_pyl: 'CMV' },
      { importe: 30000, id_tipo: 'B', metodo: 'Efectivo', rubro: 'CMV Alimentos', clasificacion_pyl: 'CMV' },
      { importe: 796100, id_tipo: 'OTROS', metodo: 'Efectivo', rubro: 'Instalaciones/Otros', clasificacion_pyl: 'Gastos Operativos' },
      { importe: 10, id_tipo: 'X', metodo: null, rubro: 'Raro', clasificacion_pyl: null },
    ],
  })
  const otros = fila(r, 'otros')
  assert.deepEqual(otros.hijos.map((h) => h.nombre), ['CMV', 'Ventas', 'Gastos Operativos', 'Sin Clasificación P&L'])
  const cmv = otros.hijos[0]
  assert.equal(cmv.efectivo, 30000)
  assert.equal(cmv.pct_fiscal, 100) // B en efectivo es fiscal; cuenta corriente no es efectivo
  const go = otros.hijos[2]
  assert.equal(go.pct_avion, 100) // efectivo sin comprobante fiscal
  assert.equal(otros.total, 6883458)
})

test('filtrado por turno: gestión no entra (los pagos no tienen turno)', () => {
  const r = armarTotalIngresos({
    cajas: [{ id: 'c1', tipo_turno: 'Noche', total: 100, efectivo: 0, fiscal: 100 }],
    partes: [],
    conGestion: false,
  })
  assert.equal(r.con_gestion, false)
  assert.deepEqual(fila(r, 'eventos').hijos.map((h) => h.nombre), ['En caja (turno Evento)'])
})

test('sin datos los % van en null, no en cero', () => {
  const r = armarTotalIngresos({})
  assert.equal(r.total.total, 0)
  assert.equal(r.total.pct_fiscal, null)
  assert.equal(r.total.pct_avion, null)
})

test('el Z no queda negativo cuando las apps superan lo fiscal de la caja', () => {
  const r = armarTotalIngresos({
    cajas: [{ id: 'c1', tipo_turno: null, total: 300, efectivo: null, fiscal: null }],
    cobros: [{ id_caja: 'c1', nombre: 'Online Rappi', monto: 100 }],
  })
  assert.equal(fila(r, 'punto_venta').fiscal, 0)
  assert.equal(fila(r, 'aplicaciones').hijos[0].nombre, 'Rappi')
})

test('apps: la misma lista que el Reporte de Ventas, y los "Vaciado" no son cobros de app', () => {
  for (const s of ['Rappi', 'PedidosYa', 'Pedido Ya', 'PEDIDOS YA', 'Online Rappi', 'MpDelivery', 'Uber Eats', 'PEYA EFECTIVO']) {
    assert.ok(ES_APP_CANAL.test(s), s)
  }
  for (const s of ['Vaciado · Rappi', 'Mercado Pago', 'MP QR', 'PedidosYa Voucher']) {
    assert.ok(!ES_APP_CANAL.test(s), s)
  }
  assert.equal(nombreApp('PEDIDOS YA'), 'PedidosYa')
  assert.equal(nombreApp('MpDelivery'), 'MP Delivery')
})
