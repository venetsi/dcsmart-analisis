import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPyl, waterfallSteps, repartoVentas, variacion, mesAnterior, ventasDelCuadro, claseDe } from './pyl.js'

const fila = (clave, nombre, total, fiscal = total, efectivo = 0, hijos = []) => ({ clave, nombre, total, fiscal, efectivo, hijos })
const datos = {
  ventas: { total: 900, fiscal: 700, efectivo: 200, tickets: 50, comensales: 80, por_origen: [] },
  ingresos: {
    filas: [
      fila('punto_venta', 'Punto de venta', 800, 600, 200),
      fila('eventos', 'Eventos', 100),
      fila('aplicaciones', 'Aplicaciones', 0),
      fila('otros', 'Otros', 150, 150, 0, [
        { nombre: 'Ventas', total: 120, fiscal: 120, efectivo: 0 },
        { nombre: 'CMV', total: 30, fiscal: 30, efectivo: 0 },
      ]),
    ],
  },
  gastos: [
    { clasificacion: 'Ventas', rubro: 'Ajustes de Ventas', categoria: 'Ajustes', total: 20, fiscal: 20, efectivo: 0 },
    { clasificacion: 'CMV', rubro: 'CMV Alimentos', categoria: 'Carnes', total: 300, fiscal: 300, efectivo: 0 },
    { clasificacion: 'CMV', rubro: 'CMV Bebidas', categoria: 'Vinos', total: 50, fiscal: 50, efectivo: 0 },
    { clasificacion: 'Labor', rubro: 'Sueldos', categoria: 'Sueldos', total: 200, fiscal: 200, efectivo: 0 },
    { clasificacion: 'Gastos Operativos', rubro: 'Fijos/Variables', categoria: 'Alquiler', total: 100, fiscal: 50, efectivo: 50 },
    { clasificacion: null, rubro: 'Nuevo', categoria: 'Raro', total: 10, fiscal: 10, efectivo: 0 },
    { clasificacion: 'Resultado Financiero', rubro: 'Costos Financieros', categoria: 'Comisiones', total: 40, fiscal: 40, efectivo: 0 },
    { clasificacion: 'Imp. Ganancias', rubro: 'Impositivo', categoria: 'Ganancias', total: 30, fiscal: 30, efectivo: 0 },
    { clasificacion: 'Capex', rubro: 'Instalaciones/Otros', categoria: 'Obra', total: 25, fiscal: 25, efectivo: 0 },
    { clasificacion: 'Retiro Socios', rubro: 'Socios', categoria: 'Retiro', total: 60, fiscal: 60, efectivo: 0 },
    { clasificacion: 'Aportes de Capital', rubro: 'Aportes', categoria: 'Capital', total: 15, fiscal: 15, efectivo: 0 },
    { clasificacion: 'Impuestos', rubro: 'Impositivo', categoria: 'IIBB', total: 5, fiscal: 5, efectivo: 0 },
    { clasificacion: 'No P&L', rubro: 'Caja Mayor', categoria: 'Retiro $', total: 999, fiscal: 0, efectivo: 999 },
  ],
}

test('ventas: cuadro de ingresos sin los "Otros" que no son venta, menos los ajustes de Ventas', () => {
  const p = buildPyl(datos)
  assert.deepEqual(p.ventas.lineas.map((l) => [l.key, l.total]), [['punto_venta', 800], ['eventos', 100], ['gestion', 120], ['ajustes', -20]])
  assert.equal(p.totales.ventas, 1000)
  assert.equal(p.ventas.tickets, 50)
})

test('totales en el orden del pedido, con D&A en 0 y No P&L afuera', () => {
  const t = buildPyl(datos).totales
  assert.equal(t.cmv, 350)
  assert.equal(t.resultadoBruto, 650)
  assert.equal(t.gastosOperativos, 310) // labor 200 + operativos 100 + sin clasificar 10
  assert.equal(t.ebitda, 340)
  assert.equal(t.depreciaciones, 0)
  assert.equal(t.ebit, 340)
  assert.equal(t.rfn, 300)
  assert.equal(t.utilidad, 270)
  assert.equal(t.remanente, 270 - 25 - 60 + 15 - 5)
  assert.equal(t.foodCostPct, 35)
  assert.equal(t.primeCostPct, 55)
})

test('cada sección agrupa por rubro y adentro por categoría', () => {
  const p = buildPyl(datos)
  const cmv = p.sec('CMV')
  assert.deepEqual(cmv.rubros.map((r) => [r.rubro, r.total, r.categorias.length]), [['CMV Alimentos', 300, 1], ['CMV Bebidas', 50, 1]])
  assert.equal(p.sec('No P&L').total, 999)
  assert.equal(p.noOperativas.at(-1).memo, true)
})

test('sin clasificación o con una desconocida va a "Sin Clasificación P&L"', () => {
  assert.equal(claseDe({ clasificacion: null }), 'Sin Clasificación P&L')
  assert.equal(claseDe({ clasificacion: 'Otra cosa' }), 'Sin Clasificación P&L')
  assert.equal(claseDe({ clasificacion: 'Capex' }), 'Capex')
})

test('el waterfall usa nombres cortos y termina en el EBITDA', () => {
  const pasos = waterfallSteps(buildPyl(datos))
  assert.deepEqual(pasos.map((p) => p.label), ['Ventas', 'CMV', 'Bruto', 'Labor', 'Gastos op.', 'Sin clasif.', 'EBITDA'])
  assert.equal(pasos.at(-1).valor, 340)
})

test('el reparto ordena las secciones operativas y deja afuera lo no operativo', () => {
  const r = repartoVentas(buildPyl(datos))
  assert.deepEqual(r.filas.map((f) => [f.label, f.pct]), [['CMV', 35], ['Labor', 20], ['Gastos op.', 10], ['Sin clasif.', 1]])
  assert.deepEqual(r.resultado, { valor: 340, pct: 34 })
})

test('respuesta vieja sin cuadro de ingresos: la venta es la de las cajas', () => {
  assert.equal(buildPyl({ ventas: { total: 500 }, gastos: [] }).totales.ventas, 500)
  assert.deepEqual(ventasDelCuadro(undefined), [])
})

test('variación contra el mes anterior', () => {
  assert.equal(variacion(110, 100), 10)
  assert.equal(variacion(-50, -100), 50)
  assert.equal(variacion(100, 0), null)
  assert.equal(variacion(100, null), null)
})

test('mes anterior cruza el año', () => {
  assert.equal(mesAnterior('2026-09'), '2026-08')
  assert.equal(mesAnterior('2026-01'), '2025-12')
})

test('sueldos de las tarjetas: Labor más el rubro Sueldos que quedó en gastos operativos', () => {
  const d = { ...datos, gastos: [...datos.gastos, { clasificacion: 'Gastos Operativos', rubro: 'Sueldos', categoria: 'Cargas', total: 50, fiscal: 50, efectivo: 0 }] }
  const t = buildPyl(d).totales
  assert.equal(t.labor, 200)
  assert.equal(t.laborKpi, 250)
  assert.equal(t.primeCostPct, 60)
})
