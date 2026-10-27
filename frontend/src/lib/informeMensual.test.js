import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveLinea } from './informe.js'
import { armarPorLocal, armarReporte, autoDeLocal } from './reporteVentas.js'
import { datosDeLineas, ventasDeLocal, pylMes, armarInformeMensual, pct, fotoDeMes } from './informeMensual.js'

const HOY = new Date('2026-10-20T12:00:00')
const MES = '2026-02'

// Respuesta de GET /api/reporte-ventas/:id: L1 vende en enero y febrero (Rappi aparte),
// L2 solo en febrero. Del año anterior L1 tiene enero y no febrero.
const rvDataDe = (locales) => ({
  cliente: { locales }, mes: MES, reglas: [], valores: [], cierres: [],
  auto: {
    L1: {
      meses: { '2026-01': { venta: 1000 }, '2026-02': { venta: 1200 }, '2025-01': { venta: 800 } },
      detalles: { '2026-01': [{ metodo: 'Rappi', monto: 200 }], '2026-02': [{ metodo: 'Rappi', monto: 300 }] },
      cajasOrigen: {}, cantidades: {},
    },
    L2: {
      meses: { '2026-02': { venta: 500 } },
      detalles: {}, cajasOrigen: {}, cantidades: {},
    },
  },
})
const rvDe = (rvData) => armarReporte({ cliente: rvData.cliente, mes: MES, porLocal: armarPorLocal(rvData), hoy: HOY })

const vacio = () => ({ efectivo: 0, dias: 0, pax: 0, gastos: [], cajaGastos: 0 })
const g = (rubro, categoria, tipo, total) => ({ rubro, categoria, tipo, total })

// Respuesta de GET /api/informe-mensual/:id armada a mano.
const imDe = (locales = ['L1']) => {
  const auto = {}
  for (const l of locales) {
    auto[l] = {}
    for (const m of ['2025-01', '2025-02', '2025-12', '2026-01', '2026-02']) auto[l][m] = vacio()
  }
  auto.L1['2026-01'] = { efectivo: 100, dias: 20, pax: 50, gastos: [g('CMV Alimentos', 'Carnes', 'A', 300), g('Sueldos', 'Sueldos', 'B', 200)], cajaGastos: 0 }
  auto.L1['2026-02'] = { efectivo: 150, dias: 22, pax: 60, gastos: [g('CMV Alimentos', 'Carnes', 'A', 400), g('Sueldos', 'Sueldos', 'B', 250)], cajaGastos: 0 }
  if (auto.L2) auto.L2['2026-02'] = { efectivo: 50, dias: 10, pax: 20, gastos: [g('CMV Alimentos', 'Carnes', 'A', 100)], cajaGastos: 0 }
  return {
    cliente: { id: 1, nombre: 'Cliente', locales, nombres: { L1: 'Local Uno' }, logosLocal: {}, razon_social: null },
    mes: MES, razonSocialGestion: null, hojas: null, auto,
    lineas: [], textos: [], valores: [], observaciones: {}, cierres: [], reglas: [],
  }
}
const informeDe = (locales = ['L1'], cambiar = (im) => im) => {
  const rvData = rvDataDe(locales)
  return armarInformeMensual({ im: cambiar(imDe(locales)), rv: rvDe(rvData), rvData, mes: MES })
}
const rvDeL1 = () => {
  const rvData = rvDataDe(['L1'])
  const rv = rvDe(rvData)
  return { rvLocal: rv.locales[0], rvAuto: autoDeLocal(rvData, 'L1') }
}
const linea = (seccion, concepto, informeMes) =>
  informeMes.secciones.find((s) => s.key === seccion).lineas.find((l) => l.clave === claveLinea(seccion, concepto))

test('pct: null si la base es 0 o falta; nunca 0% inventado', () => {
  assert.equal(pct(5, 0), null)
  assert.equal(pct(5, null), null)
  assert.equal(pct(null, 10), null)
  assert.equal(pct(50, 200), 25)
})

test('datosDeLineas convierte una corrección y una manual (solo hoja pyl del local y mes)', () => {
  const lineas = [
    { id: 1, local: 'L1', mes: MES, hoja: 'pyl', seccion: 'cmv', concepto: 'Carnes', monto: 350, monto2: null, corrige: 'cmv|carnes', oculta: false },
    { id: 2, local: 'L1', mes: MES, hoja: 'pyl', seccion: 'publicidad', concepto: 'Volantes', monto: 10, monto2: 5, corrige: null, oculta: false },
    { id: 3, local: 'L2', mes: MES, hoja: 'pyl', seccion: 'cmv', concepto: 'Carnes', monto: 1, monto2: 1, corrige: 'cmv|carnes', oculta: false },
    { id: 4, local: 'L1', mes: '2026-01', hoja: 'pyl', seccion: 'cmv', concepto: 'Carnes', monto: 1, monto2: 1, corrige: 'cmv|carnes', oculta: false },
    { id: 5, local: null, mes: MES, hoja: 'cashflow', seccion: 'disponible', concepto: 'Banco', monto: 9, monto2: null, corrige: null, oculta: false },
  ]
  assert.deepEqual(datosDeLineas(lineas, 'L1', MES), {
    ajustes: { 'cmv|carnes': { col1: 350, col2: null, oculto: false, id: 1, seccion: 'cmv', concepto: 'Carnes', sub: 'alimentos' } },
    manuales: [{ id: 2, seccion: 'publicidad', concepto: 'Volantes', col1: 10, col2: 5, sub: null }],
  })
})

test('ventasDeLocal: el efectivo va en la columna 2 de "Local"; los otros canales en la 1', () => {
  const rvLocal = { venta: { valor: 1200 }, canales: [{ nombre: 'Rappi', valor: 200, delivery: true }, { nombre: 'Local', valor: 1000 }] }
  const { lineas } = ventasDeLocal({ rvLocal, rvAuto: null, efectivo: 100, mes: MES, esMesInforme: true })
  assert.deepEqual(lineas.find((l) => l.canal === 'Local'), { canal: 'Local', total: 1000, col1: 900, col2: 100 })
  assert.deepEqual(lineas.find((l) => l.canal === 'Rappi'), { canal: 'Rappi', total: 200, col1: 200, col2: 0 })
})

test('ventasDeLocal: otros meses usan la venta del histórico y los canales automáticos; sin venta → []', () => {
  const { rvLocal, rvAuto } = rvDeL1()
  const { lineas } = ventasDeLocal({ rvLocal, rvAuto, efectivo: 100, mes: '2026-01', esMesInforme: false })
  assert.deepEqual(lineas.find((l) => l.canal === 'Local'), { canal: 'Local', total: 800, col1: 700, col2: 100 })
  assert.deepEqual(lineas.find((l) => l.canal === 'Rappi'), { canal: 'Rappi', total: 200, col1: 200, col2: 0 })
  assert.deepEqual(ventasDeLocal({ rvLocal, rvAuto, efectivo: 0, mes: '2025-02', esMesInforme: false }).lineas, [])
  assert.deepEqual(ventasDeLocal({ rvLocal: null, rvAuto: null, efectivo: 100, mes: MES, esMesInforme: true }).lineas, [])
})

test('pylMes abierto: ventas por canal, gastos de gestión y pax/días de rv_valor', () => {
  const im = imDe()
  im.valores = [{ local: 'L1', mes: MES, dato: 'pax', valor: 75, original: 60 }]
  const m = pylMes({ local: 'L1', mes: MES, im, rv: rvDeL1() })
  assert.equal(m.cerrado, false)
  assert.deepEqual(m.totales.ventas, { total: 1200, col1: 1050, col2: 150 })
  assert.deepEqual(m.canales.map((c) => c.canal).sort(), ['Local', 'Rappi'])
  assert.equal(m.ventaSalon, 900)
  assert.equal(m.valores.pax, 75)
  assert.equal(m.valores.dias, 22)
  assert.equal(m.valores.cmv.alimentos, 400)
  assert.equal(m.valores.egresos.labor, 250)
  assert.equal(m.indicadores.promPax, 12) // 900 / 75: venta del canal Local / pax
  assert.equal(m.indicadores.eerr, 550)
})

test('pylMes con el mes cerrado devuelve la foto aunque gestión cambie', () => {
  const abierto = pylMes({ local: 'L1', mes: MES, im: imDe(), rv: rvDeL1() })
  const im = imDe()
  im.cierres = [{ mes: MES, cerrado: true, snapshot: { locales: { L1: fotoDeMes(abierto) } } }]
  im.auto.L1[MES].gastos = [g('CMV Alimentos', 'Carnes', 'A', 99999)]
  im.auto.L1[MES].efectivo = 7
  im.valores = [{ local: 'L1', mes: MES, dato: 'pax', valor: 1, original: 60 }]
  const m = pylMes({ local: 'L1', mes: MES, im, rv: rvDeL1() })
  assert.equal(m.cerrado, true)
  assert.deepEqual(m.valores, abierto.valores)
  assert.deepEqual(m.totales, abierto.totales)
  assert.deepEqual(m.canales, abierto.canales)
  assert.equal(linea('cmv', 'Carnes', m).total, 400)
  assert.equal(linea('cmv', 'Carnes', m).origen, 'auto')
})

test('corrección huérfana (gestión ya no trae la línea): sigue sumando y queda marcada', () => {
  const im = imDe()
  im.lineas = [{ id: 9, local: 'L1', mes: MES, hoja: 'pyl', seccion: 'alquiler', concepto: 'Edenor', monto: 50, monto2: 10, corrige: claveLinea('alquiler', 'Edenor'), oculta: false, actualizado_por: 'ana@x', actualizado_at: '2026-10-01' }]
  const m = pylMes({ local: 'L1', mes: MES, im, rv: rvDeL1() })
  const l = linea('alquiler', 'Edenor', m)
  assert.equal(l.huerfana, true)
  assert.equal(l.total, 60)
  assert.equal(l.editado, true)
  assert.equal(m.valores.egresos.fijos, 60)
  assert.equal(m.indicadores.eerr, 1200 - 400 - 250 - 60)
  assert.equal(m.editadoEnLineas[claveLinea('alquiler', 'Edenor')].id, 9)
  // Oculta: se lista (para poder volver a mostrarla) pero no suma.
  im.lineas = [{ ...im.lineas[0], oculta: true }]
  const oculta = pylMes({ local: 'L1', mes: MES, im, rv: rvDeL1() })
  assert.equal(linea('alquiler', 'Edenor', oculta).oculto, true)
  assert.equal(linea('alquiler', 'Edenor', oculta).huerfana, true)
  assert.equal(oculta.valores.egresos.fijos, 0)
  // Una corrección que sí encuentra su línea no queda marcada.
  im.lineas = [{ id: 10, local: 'L1', mes: MES, hoja: 'pyl', seccion: 'cmv', concepto: 'Carnes', monto: 450, monto2: null, corrige: 'cmv|carnes', oculta: false }]
  const m2 = pylMes({ local: 'L1', mes: MES, im, rv: rvDeL1() })
  assert.equal(linea('cmv', 'Carnes', m2).huerfana, undefined)
  assert.equal(linea('cmv', 'Carnes', m2).total, 450)
})

test('pylMes: null si el mes no tiene ventas ni gastos', () => {
  assert.equal(pylMes({ local: 'L1', mes: '2025-02', im: imDe(), rv: rvDeL1() }), null)
})

test('armarInformeMensual: acumulado de dos meses = suma; año anterior con el mes faltante en null', () => {
  const inf = informeDe()
  assert.deepEqual(inf.meses, ['2026-01', '2026-02'])
  const l = inf.locales[0]
  assert.equal(l.local, 'L1')
  assert.equal(l.nombre, 'Local Uno')
  assert.deepEqual(Object.keys(l.meses), ['2026-01', '2026-02'])
  assert.equal(l.acumulado.total.ventasLocal, 2200)
  assert.equal(l.acumulado.total.cmv.alimentos, 700)
  assert.equal(l.acumulado.total.egresos.labor, 450)
  assert.equal(l.acumulado.total.pax, 110)
  assert.equal(l.acumulado.ventaSalon, 800 + 900)
  assert.equal(l.acumulado.indicadores.eerr, 2200 - 700 - 450)
  assert.equal(l.anioAnterior.meses['2025-02'], null)
  assert.equal(l.anioAnterior.total.ventasLocal, 800)
  assert.deepEqual(l.anioAnterior.faltan, ['2025-02'])
  assert.ok(inf.avisos.some((a) => a.local === 'L1' && a.tipo === 'anioAnterior'))
  assert.equal(l.mesAnterior.mes, '2026-01')
  assert.equal(inf.grupo, null)
  assert.equal(inf.cerrado, false)
})

test('armarInformeMensual: consolidado de 2 locales suma valores; local sin datos en un mes → null', () => {
  const inf = informeDe(['L1', 'L2'])
  const l2 = inf.locales.find((l) => l.local === 'L2')
  assert.equal(l2.meses['2026-01'], null)
  assert.equal(l2.nombre, 'L2')
  assert.equal(l2.meses[MES].valores.ventasLocal, 500)
  const gm = inf.grupo.meses[MES]
  assert.equal(gm.valores.ventasLocal, 1200 + 500)
  assert.equal(gm.valores.cmv.alimentos, 400 + 100)
  assert.equal(gm.valores.pax, 60 + 20)
  assert.deepEqual(gm.totales.ventas, { total: 1700, col1: 1050 + 450, col2: 150 + 50 })
  const carnes = gm.secciones.find((s) => s.key === 'cmv').lineas.find((x) => x.clave === 'cmv|carnes')
  assert.equal(carnes.total, 500)
  assert.deepEqual(carnes.porLocal, { L1: 400, L2: 100 })
  // Enero solo tiene L1.
  assert.equal(inf.grupo.meses['2026-01'].valores.ventasLocal, 1000)
  assert.equal(inf.grupo.acumulado.total.ventasLocal, 2200 + 500)
  assert.deepEqual(Object.keys(inf.grupo.porLocalMes), ['L1', 'L2'])
  assert.equal(inf.grupo.porLocalMes.L2.valores.ventasLocal, 500)
})

test('armarInformeMensual: datos del cliente, líneas del cliente y estado de cierre', () => {
  const inf = informeDe(['L1'], (im) => ({
    ...im,
    hojas: { hojas: [], indicadores: { L1: [{ clave: 'x', nombre: 'X', formato: 'numero' }] } },
    lineas: [{ id: 1, local: null, mes: MES, hoja: 'cashflow', seccion: 'disponible', concepto: 'Banco', monto: 9, monto2: null, corrige: null, oculta: false }],
    textos: [{ local: 'L1', mes: MES, clave: 'resumen:venta', texto: 'Hola' }],
    cierres: [{ mes: MES, cerrado: true, snapshot: { locales: {} } }],
  }))
  assert.deepEqual(inf.indicadoresConfig, { L1: [{ clave: 'x', nombre: 'X', formato: 'numero' }] })
  assert.equal(inf.lineasCliente.length, 1)
  assert.equal(inf.textos.length, 1)
  assert.equal(inf.cerrado, true)
  // Mes cerrado sin foto del local: no se inventa.
  assert.equal(inf.locales[0].meses[MES], null)
})

test('indicadores sin base dan null, no 0', () => {
  const inf = informeDe(['L1', 'L2'])
  const ind = inf.locales.find((l) => l.local === 'L2').meses[MES].indicadores
  assert.equal(ind.promDias, 50)
  const im = imDe()
  im.auto.L1[MES].dias = 0
  im.auto.L1[MES].pax = 0
  const m = pylMes({ local: 'L1', mes: MES, im, rv: rvDeL1() })
  assert.equal(m.indicadores.promDias, null)
  assert.equal(m.indicadores.promPax, null)
})

test('sub del CMV: manuales y correcciones huérfanas usan im_linea.sub (alimentos si es null)', () => {
  const base = { local: 'L1', mes: MES, hoja: 'pyl', seccion: 'cmv', monto2: null, oculta: false }
  const lineas = [
    { ...base, id: 1, concepto: 'Vinos', monto: 70, corrige: null, sub: 'bebidas' },
    { ...base, id: 2, concepto: 'Ajuste stock', monto: 30, corrige: null, sub: 'movstock' },
    { ...base, id: 3, concepto: 'Pan', monto: 5, corrige: null, sub: null },
    { ...base, id: 4, concepto: 'Cervezas', monto: 40, corrige: claveLinea('cmv', 'Cervezas'), sub: 'bebidas' },
  ]
  const d = datosDeLineas(lineas, 'L1', MES)
  assert.deepEqual(d.manuales.map((m) => m.sub), ['bebidas', 'movstock', 'alimentos'])
  assert.equal(d.ajustes[claveLinea('cmv', 'Cervezas')].sub, 'bebidas')
  const im = imDe()
  im.lineas = lineas
  const m = pylMes({ local: 'L1', mes: MES, im, rv: rvDeL1() })
  assert.deepEqual(m.valores.cmv, { alimentos: 400 + 5, bebidas: 70 + 40, movstock: 30 })
  assert.equal(linea('cmv', 'Cervezas', m).huerfana, true)
  assert.equal(linea('cmv', 'Cervezas', m).sub, 'bebidas')
})

test('promedios del acumulado: Prom. pax solo con los meses que tienen pax', () => {
  const inf = informeDe(['L1'], (im) => { im.auto.L1[MES].pax = 0; return im })
  const l = inf.locales[0]
  assert.equal(l.meses[MES].valores.pax, null)
  assert.equal(l.meses[MES].indicadores.pax, null)
  assert.equal(l.meses[MES].indicadores.promPax, null)
  assert.equal(l.acumulado.total.pax, 50)
  assert.equal(l.acumulado.indicadores.pax, 50)
  assert.equal(l.acumulado.indicadores.promPax, 800 / 50) // solo enero (Local 800 / 50 pax)
  assert.equal(l.acumulado.indicadores.promDias, (1000 + 1200) / (20 + 22))
})

test('promedios del grupo: un local sin pax no infla el promedio', () => {
  const inf = informeDe(['L1', 'L2'], (im) => { im.auto.L2[MES].pax = 0; return im })
  const ind = inf.grupo.meses[MES].indicadores
  assert.equal(ind.pax, 60)
  assert.equal(ind.promPax, 900 / 60) // solo L1
  assert.equal(ind.venta, 1700)
  // Sin pax en ningún mes ni local: null.
  const sinPax = informeDe(['L1'], (im) => { im.auto.L1['2026-01'].pax = 0; im.auto.L1[MES].pax = 0; return im })
  assert.equal(sinPax.locales[0].acumulado.total.pax, null)
  assert.equal(sinPax.locales[0].acumulado.indicadores.promPax, null)
})

test('mes con gastos y sin ventas: la venta y lo que depende de ella son null, no 0', () => {
  const im = imDe()
  im.auto.L1['2025-12'] = { efectivo: 0, dias: 0, pax: 0, gastos: [g('CMV Alimentos', 'Carnes', 'A', 300)], cajaGastos: 0 }
  const m = pylMes({ local: 'L1', mes: '2025-12', im, rv: rvDeL1() })
  assert.equal(m.indicadores.venta, null)
  assert.equal(m.indicadores.cmv, 300)
  assert.equal(m.indicadores.cmvPct, null)
  assert.equal(m.indicadores.eerr, null)
  assert.equal(m.indicadores.rf, null)
  assert.equal(m.resumen.ventas.find((f) => f.clave === 'subtotal').monto, null)
  assert.equal(m.resumen.economico.find((f) => f.clave === 'eerr').monto, null)
  assert.equal(m.resumen.cmv.find((f) => f.clave === 'subtotal').pct, null)
})
