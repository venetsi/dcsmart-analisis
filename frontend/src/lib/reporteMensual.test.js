import { test } from 'node:test'
import assert from 'node:assert/strict'
import { columnaDeTipo, buildReporte } from './reporteMensual.js'

test('columnaDeTipo mapea confirmados y deja null los no asignados', () => {
  assert.equal(columnaDeTipo('A'), 1)
  assert.equal(columnaDeTipo('NCA'), 1)
  assert.equal(columnaDeTipo('DC (1)'), 1)   // valor real en BQ (con paréntesis)
  assert.equal(columnaDeTipo('B'), 2)
  assert.equal(columnaDeTipo('DC (2)'), 2)
  assert.equal(columnaDeTipo('STK'), 2)
  assert.equal(columnaDeTipo('DDJJ'), null) // sin asignar
  assert.equal(columnaDeTipo(''), null)
})

test('buildReporte separa gastos por columna segun tipo', () => {
  const r = buildReporte({
    ventas: { total: 1000, comensales: 10, tickets: 5, por_origen: [] },
    gastos: [
      { rubro: 'CMV Alimentos', categoria: 'Carnes', tipo: 'A', total: -100 },
      { rubro: 'CMV Alimentos', categoria: 'Carnes', tipo: 'B', total: -40 },
      { rubro: 'CMV MovStock', categoria: 'Merma', tipo: 'STK', total: -30 },
    ],
    manuales: [],
  })
  const cmv = r.secciones.find(s => s.key === 'cmv')
  assert.equal(cmv.col1, -100)   // A
  assert.equal(cmv.col2, -70)    // B + STK
  assert.equal(cmv.total, -170)
})

test('buildReporte suma manuales en su seccion y columna', () => {
  const r = buildReporte({
    ventas: { total: 1000, por_origen: [] },
    gastos: [],
    manuales: [{ seccion: 'impositivos', concepto: 'IVA', monto: -200, columna: 1 }],
  })
  const imp = r.secciones.find(s => s.key === 'impositivos')
  assert.equal(imp.col1, -200)
  assert.equal(imp.total, -200)
})

test('buildReporte acumula tipos sin asignar sin perderlos', () => {
  const r = buildReporte({
    ventas: { total: 1000, por_origen: [] },
    gastos: [{ rubro: 'CMV Alimentos', categoria: 'X', tipo: 'DDJJ', total: -50 }],
    manuales: [],
  })
  assert.equal(r.sinAsignar.total, -50)
  assert.ok(r.sinAsignar.tipos.includes('DDJJ'))
})

test('resultado bruto = ventas - cmv', () => {
  const r = buildReporte({
    ventas: { total: 1000, por_origen: [] },
    gastos: [{ rubro: 'CMV Alimentos', categoria: 'C', tipo: 'A', total: -300 }],
    manuales: [],
  })
  assert.equal(r.totales.ventas, 1000)
  assert.equal(r.totales.cmv, -300)
  assert.equal(r.totales.resultadoBruto, 700)
})

test('manual con seccion desconocida no se pierde: aparece en manualesSinUbicar', () => {
  const r = buildReporte({
    ventas: { total: 1000, por_origen: [] },
    gastos: [],
    // 'Impositivos' (mayúscula) NO matchea la key real 'impositivos'
    manuales: [{ seccion: 'Impositivos', concepto: 'IVA', monto: -200, columna: 1 }],
  })
  const imp = r.secciones.find(s => s.key === 'impositivos')
  assert.equal(imp.total, 0) // no cayó en la sección real
  assert.equal(r.manualesSinUbicar.length, 1)
  assert.deepEqual(r.manualesSinUbicar[0], {
    seccion: 'Impositivos', concepto: 'IVA', monto: -200, columna: 1,
  })
  // no debe aparecer huérfano en ninguna otra sección tampoco
  const totalSecciones = r.secciones.reduce((a, s) => a + s.total, 0)
  assert.equal(totalSecciones, 0) // no hay gastos ni manuales validos en este caso
})

test('gasto con total como string se suma numericamente (no concatena)', () => {
  const r = buildReporte({
    ventas: { total: 1000, por_origen: [] },
    gastos: [{ rubro: 'CMV Alimentos', categoria: 'Carnes', tipo: 'A', total: '-100' }],
    manuales: [],
  })
  assert.equal(r.totales.cmv, -100)
  assert.equal(typeof r.totales.cmv, 'number')
})

test('resultadoEconomico descuenta CMV y gastos operativos (ej. Sueldos)', () => {
  const r = buildReporte({
    ventas: { total: 1000, por_origen: [] },
    gastos: [
      { rubro: 'CMV Alimentos', categoria: 'Carnes', tipo: 'A', total: -100 },
      { rubro: 'Sueldos', categoria: 'Sueldos', tipo: 'A', total: -200 },
    ],
    manuales: [],
  })
  assert.equal(r.totales.resultadoEconomico, 700)
})
