import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  construirInforme, armarResumen, sumarValores, seccionPorDefecto, columnaDeTipo, subCmv,
  claveLinea, mesCorto, nombreMes, fmtPct, EXCLUIDO,
} from './informe.js'

const auto = (gastos, ventas = { total: 70479234, efectivo: 27406497, comensales: 2066, dias: 26 }, extra = {}) =>
  ({ ventas, gastos, ...extra })

test('ventas: la columna 2 es el efectivo de las cajas (Loreto 08-26)', () => {
  const inf = construirInforme({ auto: auto([]) })
  assert.deepEqual(inf.totales.ventas, { total: 70479234, col1: 43072737, col2: 27406497 })
})

test('secciones por defecto: lo que salió de comparar Loreto contra la planilla', () => {
  assert.equal(seccionPorDefecto('CMV Alimentos', 'Carnes'), 'cmv')
  assert.equal(seccionPorDefecto('Fijos/Variables', 'Edenor'), 'alquiler')
  assert.equal(seccionPorDefecto('Sueldos', 'Liquidacion final'), 'desvinculaciones')
  assert.equal(seccionPorDefecto('Sueldos', 'Sueldos'), 'sueldos')
  assert.equal(seccionPorDefecto('Socios', 'Sueldos'), 'sueldos')
  assert.equal(seccionPorDefecto('Socios', 'Socios'), 'dividendos')
  assert.equal(seccionPorDefecto('Plan de Pagos', 'Intereses'), 'pasivo')
  assert.equal(seccionPorDefecto('Caja Mayor', 'Retiro $ (Pesos)'), EXCLUIDO)
  assert.equal(seccionPorDefecto('Algo Nuevo', 'X'), 'otros')
})

test('columnas por tipo de comprobante: CM (Caja Mayor) es efectivo', () => {
  assert.equal(columnaDeTipo('A'), 1)
  assert.equal(columnaDeTipo('DC (1)'), 1)
  assert.equal(columnaDeTipo('B'), 2)
  assert.equal(columnaDeTipo('CM'), 2)
  assert.equal(columnaDeTipo('FF'), null)
})

test('la misma categoría en dos rubros es un solo renglón (Bebidas sin alcohol)', () => {
  const inf = construirInforme({ auto: auto([
    { rubro: 'CMV Alimentos', categoria: 'Bebidas sin alcohol', tipo: 'A', total: 369000 },
    { rubro: 'CMV Bebidas', categoria: 'Bebidas sin alcohol', tipo: 'A', total: 232188 },
  ]) })
  const cmv = inf.secciones.find((s) => s.key === 'cmv')
  assert.equal(cmv.lineas.length, 1)
  assert.equal(cmv.lineas[0].total, 601188)
})

test('una regla del grupo cambia sección y nombre', () => {
  const inf = construirInforme({
    auto: auto([{ rubro: 'CMV Bebidas', categoria: 'Cafeteria', tipo: 'A', total: 742492 }]),
    reglas: [{ rubro: 'CMV Bebidas', categoria: 'Cafeteria', seccion: 'cmv', concepto: 'Hielo' }],
  })
  const l = inf.secciones.find((s) => s.key === 'cmv').lineas[0]
  assert.equal(l.concepto, 'Hielo')
  assert.equal(l.total, 742492)
})

test('un ajuste pisa la columna de gestión y el total se recalcula', () => {
  const clave = claveLinea('alquiler', 'Edenor')
  const inf = construirInforme({
    auto: auto([{ rubro: 'Fijos/Variables', categoria: 'Edenor', tipo: 'B', total: 828389 }]),
    datos: { ajustes: { [clave]: { col1: 746899, col2: 0 } } },
  })
  const l = inf.secciones.find((s) => s.key === 'alquiler').lineas[0]
  assert.equal(l.total, 746899)
  assert.equal(l.editado, true)
})

test('una línea oculta no suma, pero sigue en la lista', () => {
  const clave = claveLinea('alquiler', 'Edenor')
  const inf = construirInforme({
    auto: auto([{ rubro: 'Fijos/Variables', categoria: 'Edenor', tipo: 'B', total: 100 }]),
    datos: { ajustes: { [clave]: { oculto: true } } },
  })
  const s = inf.secciones.find((x) => x.key === 'alquiler')
  assert.equal(s.lineas.length, 1)
  assert.equal(s.total, 0)
})

test('líneas manuales: impositivos y la apertura del efectivo', () => {
  const inf = construirInforme({
    auto: auto([]),
    datos: { manuales: [
      { id: 'a', seccion: 'impositivos', concepto: 'IVA 08-26', col1: 3454896 },
      { id: 'b', seccion: 'sueldos', concepto: 'Sueldos Extras', col2: 5633900 },
    ] },
  })
  assert.equal(inf.secciones.find((s) => s.key === 'impositivos').total, 3454896)
  assert.equal(inf.secciones.find((s) => s.key === 'sueldos').col2, 5633900)
  assert.equal(inf.valores.egresos.labor, 5633900)
})

test('Caja Mayor queda afuera del P&L y se lista como excluida', () => {
  const inf = construirInforme({ auto: auto([{ rubro: 'Caja Mayor', categoria: 'Retiro $ (Pesos)', tipo: 'CM', total: 7900000 }]) })
  assert.equal(inf.totales.egresos.total, 0)
  assert.equal(inf.excluidos.length, 1)
})

test('resumen: con los valores de la planilla de Loreto da sus mismos números', () => {
  const val = {
    ventasLocal: 70479234, ventasEvento: 0, dias: 26, pax: 2066,
    cmv: { alimentos: 16331644, bebidas: 1971980, movstock: 0 },
    egresos: { fijos: 2167201, publicidad: 0, representacion: 0, descartables: 1135521, instalaciones: 1388508, financieros: 1468258, labor: 15865837, desvinculaciones: 1078667, honorarios: 1996500, eventos: 0, impositivos: 6595943, otros: 0 },
    pasivo: 110024, dividendos: 2209050,
  }
  const r = armarResumen(val)
  assert.equal(r.resultadoBruto.monto, 52175610)
  assert.equal(r.egresos.at(-1).monto, 31696435)
  assert.equal(r.economico.find((f) => f.clave === 'egresos').monto, 50000059)
  assert.equal(r.economico.find((f) => f.clave === 'eerr').monto, 20479175)
  assert.equal(r.final.find((f) => f.clave === 'rf').monto, 18160101)
  assert.equal(Math.round(r.indicadores.promDias), 2710740)
  assert.equal(Math.round(r.indicadores.promPax), 34114)
  assert.equal(fmtPct(r.indicadores.cmvPct), '25,97%')
  assert.equal(fmtPct(r.indicadores.laborPct), '22,51%')
  assert.equal(fmtPct(r.indicadores.eerrPct), '29,06%')
})

test('acumulado: suma meses y recalcula promedios', () => {
  const mes = { ventasLocal: 100, ventasEvento: 0, dias: 10, pax: 5, cmv: { alimentos: 30 }, egresos: { labor: 20 }, pasivo: 0, dividendos: 0 }
  const acc = sumarValores([mes, mes])
  assert.equal(acc.ventasLocal, 200)
  assert.equal(acc.dias, 20)
  assert.equal(armarResumen(acc).indicadores.promDias, 10)
})

test('avisos: sin sección, tipos sin columna y gastos de caja sin detalle', () => {
  const inf = construirInforme({ auto: auto(
    [{ rubro: 'Algo Nuevo', categoria: 'X', tipo: 'FF', total: 500 }],
    undefined, { cajaGastos: 7591000 }) })
  const tipos = inf.avisos.map((a) => a.tipo).sort()
  assert.deepEqual(tipos, ['caja', 'otros', 'tipo'])
})

test('CMV se abre en alimentos, bebidas y mov. de stock para el resumen', () => {
  assert.equal(subCmv('CMV Alimentos'), 'alimentos')
  assert.equal(subCmv('CMV Bebidas'), 'bebidas')
  assert.equal(subCmv('CMV MovStock B2B'), 'movstock')
})

test('formatos de mes', () => {
  assert.equal(mesCorto('2026-08'), '08-26')
  assert.equal(nombreMes('2026-08'), 'agosto')
})
