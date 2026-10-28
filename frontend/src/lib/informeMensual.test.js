import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveLinea } from './informe.js'
import { armarPorLocal, armarReporte } from './reporteVentas.js'
import {
  datosDeLineas, ventasDeLocal, pylMes, armarInformeMensual, pct, fotoDeMes,
  HOJAS_DEFECTO, GRUPOS_SECCION, hojasDe, paginasDe, resumenDe, detalleDe, aperturaDe, cmvDe, cashflowDe, deudaDe, snapshotIm, buscarLineas,
} from './informeMensual.js'

const HOY = new Date('2026-10-20T12:00:00')
const MES = '2026-02'

// Respuesta de GET /api/reporte-ventas/:id: L1 vende en enero y febrero (Rappi aparte),
// L2 solo en febrero. Del año anterior L1 tiene enero y no febrero. Los cubiertos (el pax
// del informe) salen de acá, resueltos por el Reporte de Ventas.
const rvDataDe = (locales) => ({
  cliente: { locales }, mes: MES, reglas: [], valores: [], cierres: [],
  auto: {
    L1: {
      meses: { '2026-01': { venta: 1000, cubiertos: 50 }, '2026-02': { venta: 1200, cubiertos: 60 }, '2025-01': { venta: 800 } },
      detalles: { '2026-01': [{ metodo: 'Rappi', monto: 200 }], '2026-02': [{ metodo: 'Rappi', monto: 300 }] },
      cajasOrigen: {}, cantidades: {},
    },
    L2: {
      meses: { '2026-02': { venta: 500, cubiertos: 20 } },
      detalles: {}, cajasOrigen: {}, cantidades: {},
    },
  },
})
const rvDe = (rvData) => armarReporte({ cliente: rvData.cliente, mes: MES, porLocal: armarPorLocal(rvData), hoy: HOY })

const vacio = () => ({ efectivo: 0, dias: 0, gastos: [], cajaGastos: 0 })
const g = (rubro, categoria, tipo, total) => ({ rubro, categoria, tipo, total })

// Respuesta de GET /api/informe-mensual/:id armada a mano.
const imDe = (locales = ['L1']) => {
  const auto = {}
  for (const l of locales) {
    auto[l] = {}
    for (const m of ['2025-01', '2025-02', '2025-12', '2026-01', '2026-02']) auto[l][m] = vacio()
  }
  auto.L1['2026-01'] = { efectivo: 100, dias: 20, gastos: [g('CMV Alimentos', 'Carnes', 'A', 300), g('Sueldos', 'Sueldos', 'B', 200)], cajaGastos: 0 }
  auto.L1['2026-02'] = { efectivo: 150, dias: 22, gastos: [g('CMV Alimentos', 'Carnes', 'A', 400), g('Sueldos', 'Sueldos', 'B', 250)], cajaGastos: 0 }
  if (auto.L2) auto.L2['2026-02'] = { efectivo: 50, dias: 10, gastos: [g('CMV Alimentos', 'Carnes', 'A', 100)], cajaGastos: 0 }
  return {
    cliente: { id: 1, nombre: 'Cliente', locales, nombres: { L1: 'Local Uno' }, logosLocal: {}, razon_social: null },
    mes: MES, razonSocialGestion: null, hojas: null, auto,
    lineas: [], textos: [], valores: [], observaciones: {}, cierres: [], reglas: [],
  }
}
const informeDe = (locales = ['L1'], cambiar = (im) => im, cambiarRv = (d) => d) => {
  const rvData = cambiarRv(rvDataDe(locales))
  return armarInformeMensual({ im: cambiar(imDe(locales)), rv: rvDe(rvData), mes: MES })
}
const rvDeL1 = (cambiarRv = (d) => d) => {
  const rvData = cambiarRv(rvDataDe(['L1']))
  return { rvLocal: rvDe(rvData).locales[0] }
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
  const rvMes = { venta: { valor: 1200 }, canales: [{ nombre: 'Rappi', valor: 200, delivery: true }, { nombre: 'Local', valor: 1000 }] }
  const { lineas } = ventasDeLocal({ rvMes, efectivo: 100 })
  assert.deepEqual(lineas.find((l) => l.canal === 'Local'), { canal: 'Local', total: 1000, col1: 900, col2: 100 })
  assert.deepEqual(lineas.find((l) => l.canal === 'Rappi'), { canal: 'Rappi', total: 200, col1: 200, col2: 0 })
})

test('ventasDeLocal: cualquier mes usa la venta y los canales resueltos del Reporte de Ventas (porMes); sin venta → []', () => {
  const { rvLocal } = rvDeL1()
  const { lineas, localNegativo } = ventasDeLocal({ rvMes: rvLocal.porMes['2026-01'], efectivo: 100 })
  assert.deepEqual(lineas.find((l) => l.canal === 'Local'), { canal: 'Local', total: 800, col1: 700, col2: 100 })
  assert.deepEqual(lineas.find((l) => l.canal === 'Rappi'), { canal: 'Rappi', total: 200, col1: 200, col2: 0 })
  assert.equal(localNegativo, false)
  assert.deepEqual(ventasDeLocal({ rvMes: rvLocal.porMes['2025-02'], efectivo: 0 }).lineas, [])
  assert.deepEqual(ventasDeLocal({ rvMes: undefined, efectivo: 100 }).lineas, [])
})

test('pylMes abierto: ventas por canal, gastos de gestión, pax = cubiertos del Reporte de Ventas y días', () => {
  const im = imDe()
  const rv = rvDeL1((d) => ({ ...d, valores: [{ local: 'L1', mes: MES, dato: 'cubiertos', valor: 75, original: 60 }] }))
  const m = pylMes({ local: 'L1', mes: MES, im, rv })
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
  // Cubiertos corregidos después en el Reporte de Ventas: el mes cerrado no cambia.
  const rv = rvDeL1((d) => ({ ...d, valores: [{ local: 'L1', mes: MES, dato: 'cubiertos', valor: 1, original: 60 }] }))
  const m = pylMes({ local: 'L1', mes: MES, im, rv })
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
  const sinCub = (d) => { d.auto.L1.meses[MES].cubiertos = 0; return d }
  const m = pylMes({ local: 'L1', mes: MES, im, rv: rvDeL1(sinCub) })
  assert.equal(m.indicadores.pax, null)
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
  const inf = informeDe(['L1'], undefined, (d) => { d.auto.L1.meses[MES].cubiertos = null; return d })
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
  const inf = informeDe(['L1', 'L2'], undefined, (d) => { d.auto.L2.meses[MES].cubiertos = null; return d })
  const ind = inf.grupo.meses[MES].indicadores
  assert.equal(ind.pax, 60)
  assert.equal(ind.promPax, 900 / 60) // solo L1
  assert.equal(ind.venta, 1700)
  // Sin pax en ningún mes ni local: null.
  const sinPax = informeDe(['L1'], undefined, (d) => { d.auto.L1.meses['2026-01'].cubiertos = null; d.auto.L1.meses[MES].cubiertos = null; return d })
  assert.equal(sinPax.locales[0].acumulado.total.pax, null)
  assert.equal(sinPax.locales[0].acumulado.indicadores.promPax, null)
})

test('mes con gastos y sin ventas: la venta y lo que depende de ella son null, no 0', () => {
  const im = imDe()
  im.auto.L1['2025-12'] = { efectivo: 0, dias: 0, gastos: [g('CMV Alimentos', 'Carnes', 'A', 300)], cajaGastos: 0 }
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

// ── Task 5: hojas ────────────────────────────────────────────────────────────

// CMV de ATTE (agosto → septiembre del lienzo) puesto en enero → febrero de L1.
const conCmvAtte = (im) => {
  im.auto.L1['2026-01'].gastos = [
    g('CMV Alimentos', 'Carnes', 'A', 30000000), g('CMV Bebidas', 'Vinos', 'A', 14000000),
    g('CMV Alimentos', 'Lácteos', 'B', 209493), g('Sueldos', 'Sueldos', 'B', 200),
  ]
  im.auto.L1[MES].gastos = [
    g('CMV Alimentos', 'Carnes', 'A', 20000000), g('CMV Alimentos', 'Carnes', 'B', 8000000),
    g('CMV Alimentos', 'Quesos', 'A', 9000000), g('CMV Bebidas', 'Vinos', 'A', 4209956),
    g('Sueldos', 'Sueldos', 'B', 250),
  ]
  return im
}
let idLinea = 100
const cl = (seccion, concepto, monto, extra = {}) => ({
  id: idLinea++, local: null, mes: MES, hoja: seccion === 'deuda' || seccion === 'venta_periodo' ? 'deuda' : 'cashflow',
  seccion, concepto, monto, monto2: null, corrige: null, oculta: false, orden: 0, ...extra,
})
const ids = (pags) => pags.map((p) => p.id)

test('HOJAS_DEFECTO en el orden del spec; GRUPOS_SECCION con las secciones del P&L', () => {
  assert.deepEqual(HOJAS_DEFECTO.map((h) => h.clave), ['portada', 'indice', 'indicadores', 'ind_locales', 'historico', 'pyl_acumulado',
    'pyl_historico', 'consolidado', 'cmv', 'detalle', 'apertura', 'cashflow', 'deuda', 'resumen', 'contraportada'])
  assert.deepEqual(GRUPOS_SECCION.map((x) => x.key), ['cmv', 'fijos', 'generales', 'financieros', 'sueldos', 'impositivos'])
  assert.deepEqual(GRUPOS_SECCION.find((x) => x.key === 'generales').secciones, ['publicidad', 'descartables', 'instalaciones', 'representacion'])
  assert.deepEqual(GRUPOS_SECCION.find((x) => x.key === 'sueldos').secciones, ['sueldos', 'sueldos_socios', 'desvinculaciones', 'honorarios'])
})

test('paginasDe con un local: indicadores (no ind_locales), detalle/apertura por sección con datos, sin cash flow ni deuda vacíos', () => {
  const inf = informeDe()
  const pags = paginasDe(inf)
  const p = ids(pags)
  assert.equal(p[0], 'portada')
  assert.ok(p.includes('indicadores'))
  assert.ok(!p.includes('ind_locales'))
  assert.ok(!p.includes('consolidado'))
  assert.ok(!p.includes('cashflow'))
  assert.ok(!p.includes('deuda'))
  assert.ok(p.includes('historico:L1'))
  assert.ok(p.includes('pyl_acumulado:L1:1') && p.includes('pyl_acumulado:L1:2'))
  assert.ok(!p.some((x) => x.startsWith('pyl_acumulado:grupo')))
  assert.ok(p.includes('detalle:L1:cmv') && p.includes('detalle:L1:sueldos'))
  assert.ok(!p.includes('detalle:L1:fijos')) // sin alquiler en el mes
  assert.ok(p.includes('apertura:L1:cmv')) // un solo local: apertura visible
  assert.equal(p.at(-1), 'contraportada')
  assert.equal(new Set(p).size, p.length)
  const det = pags.find((x) => x.id === 'detalle:L1:cmv')
  assert.deepEqual({ clave: det.clave, local: det.local, seccion: det.seccion, parte: det.parte }, { clave: 'detalle', local: 'L1', seccion: 'cmv', parte: 1 })
  assert.equal(pags.find((x) => x.id === 'pyl_acumulado:L1:2').parte, 2)
})

test('paginasDe con 2 locales: ind_locales, consolidado y P&L acumulado del grupo; sin indicadores ni apertura', () => {
  const inf = informeDe(['L1', 'L2'])
  const p = ids(paginasDe(inf))
  assert.ok(p.includes('ind_locales'))
  assert.ok(!p.includes('indicadores'))
  assert.ok(p.includes('consolidado'))
  assert.ok(p.includes('cmv:L1') && p.includes('cmv:L2'))
  assert.ok(p.includes('pyl_acumulado:grupo:1') && p.includes('pyl_acumulado:grupo:2'))
  assert.ok(p.indexOf('pyl_acumulado:L2:2') < p.indexOf('pyl_acumulado:grupo:1'))
  assert.ok(!p.some((x) => x.startsWith('apertura:'))) // oculta por defecto con varios locales
  assert.equal(paginasDe(inf).find((x) => x.id === 'pyl_acumulado:grupo:1').grupo, true)
  // La configuración la puede prender.
  assert.ok(ids(paginasDe(inf, { hojas: [{ clave: 'apertura', visible: true }] })).includes('apertura:L2:cmv'))
})

test('paginasDe: config.hojas pisa visible y orden; cash flow y deuda entran con líneas', () => {
  const inf = informeDe()
  const sinCmv = ids(paginasDe(inf, { hojas: [{ clave: 'cmv', visible: false, orden: 8 }] }))
  assert.ok(!sinCmv.some((x) => x.startsWith('cmv:')))
  assert.ok(ids(paginasDe(inf)).includes('cmv:L1'))
  const resumenPrimero = ids(paginasDe(inf, { hojas: [{ clave: 'resumen', visible: true, orden: -1 }] }))
  assert.equal(resumenPrimero[0], 'resumen:L1')
  // Sin config explícita se usa la guardada (informe.hojasConfig).
  assert.ok(!ids(paginasDe({ ...inf, hojasConfig: [{ clave: 'portada', visible: false }] })).includes('portada'))

  const conDatos = informeDe(['L1'], (im) => ({ ...im, lineas: [cl('disponible', 'Banco', 10), cl('deuda', 'AFIP', 5)] }))
  const p = ids(paginasDe(conDatos))
  assert.ok(p.includes('cashflow') && p.includes('deuda'))
  assert.ok(p.indexOf('cashflow') < p.indexOf('deuda'))
  // El editor sabe por qué una hoja no sale.
  const cf = hojasDe(inf).find((h) => h.clave === 'cashflow')
  assert.equal(cf.visible, true)
  assert.equal(cf.aplica, false)
  assert.ok(cf.motivo)
})

test('detalleDe CMV: agosto 44.209.493 vs septiembre 41.209.956 → diferencia −2.999.537', () => {
  const inf = informeDe(['L1'], conCmvAtte)
  const d = detalleDe(inf, 'L1', 'cmv')
  assert.equal(d.totales.anterior, 44209493)
  assert.equal(d.totales.actual, 41209956)
  assert.equal(d.totales.diferencia, -2999537)
  assert.equal(d.totales.pctActual, pct(41209956, 1200))
  assert.equal(d.totales.pctAnterior, pct(44209493, 1000))
  const fila = (c) => d.filas.find((f) => f.concepto === c)
  const { concepto, anterior, actual, diferencia, bloque } = fila('Carnes')
  assert.deepEqual({ concepto, anterior, actual, diferencia, bloque }, { concepto: 'Carnes', anterior: 30000000, actual: 28000000, diferencia: -2000000, bloque: 'alimentos' })
  // Un concepto que no está en un mes es null ("—"), no 0.
  assert.equal(fila('Quesos').anterior, null)
  assert.equal(fila('Quesos').pctAnterior, null)
  assert.equal(fila('Quesos').diferencia, 9000000)
  assert.equal(fila('Lácteos').actual, null)
  assert.equal(fila('Lácteos').diferencia, -209493)
  assert.equal(fila('Vinos').bloque, 'bebidas')
  // Alimentos primero, de mayor a menor; después bebidas.
  assert.deepEqual(d.filas.map((f) => f.concepto), ['Carnes', 'Quesos', 'Lácteos', 'Vinos'])
  assert.deepEqual(d.bloques.map((b) => b.key), ['alimentos', 'bebidas'])
  assert.equal(d.resultadoBruto.actual, 1200 - 41209956)
  // Sueldos y honorarios: otro grupo.
  const s = detalleDe(inf, 'L1', 'sueldos')
  assert.deepEqual(s.filas.map((f) => [f.concepto, f.anterior, f.actual, f.diferencia]), [['Sueldos', 200, 250, 50]])
  assert.equal(s.resultadoBruto, null)
})

test('detalleDe sin mes anterior: anterior y diferencia en null', () => {
  const inf = informeDe(['L1', 'L2'])
  const d = detalleDe(inf, 'L2', 'cmv') // L2 no tiene enero
  assert.equal(d.totales.anterior, null)
  assert.equal(d.totales.diferencia, null)
  assert.equal(d.filas[0].diferencia, null)
  assert.equal(d.totales.actual, 100)
})

test('aperturaDe: columnas 1 y 2 con % sobre la venta de cada columna y reparto', () => {
  const inf = informeDe(['L1'], conCmvAtte)
  const a = aperturaDe(inf, 'L1', 'cmv')
  assert.deepEqual(a.venta, { total: 1200, col1: 1050, col2: 150 })
  const carnes = a.filas.find((f) => f.concepto === 'Carnes')
  assert.equal(carnes.total, 28000000)
  assert.equal(carnes.col1, 20000000)
  assert.equal(carnes.col2, 8000000)
  assert.equal(carnes.pct, pct(28000000, 1200))
  assert.equal(carnes.pct1, pct(20000000, 1050))
  assert.equal(carnes.pct2, pct(8000000, 150))
  assert.equal(carnes.reparto, pct(20000000, 28000000))
  // Sin monto en una columna: null (la hoja muestra "—").
  const quesos = a.filas.find((f) => f.concepto === 'Quesos')
  assert.equal(quesos.col2, null)
  assert.equal(quesos.pct2, null)
  assert.equal(quesos.reparto, 100)
  // Orden alfabético dentro de cada bloque; Lácteos (solo enero) no está.
  assert.deepEqual(a.filas.map((f) => f.concepto), ['Carnes', 'Quesos', 'Vinos'])
  assert.equal(a.totales.total, 41209956)
  assert.equal(a.totales.col2, 8000000)
  assert.equal(a.resultadoBruto.col2, 150 - 8000000)
})

test('cmvDe: total, partes con pts vs mes anterior y categorías de mayor a menor', () => {
  const inf = informeDe(['L1'], conCmvAtte)
  const c = cmvDe(inf, 'L1')
  assert.equal(c.total, 41209956)
  assert.equal(c.pct, pct(41209956, 1200))
  assert.equal(c.venta, 1200)
  assert.equal(c.anterior.total, 44209493)
  assert.equal(c.porSub.alimentos.total, 37000000)
  assert.equal(c.porSub.alimentos.pct, pct(37000000, 1200))
  assert.equal(c.porSub.alimentos.pts, pct(37000000, 1200) - pct(30209493, 1000))
  assert.equal(c.porSub.bebidas.total, 4209956)
  assert.equal(c.porSub.movstock.total, null)
  assert.equal(c.porSub.movstock.pts, null)
  assert.deepEqual(c.categorias.alimentos.map((x) => x.concepto), ['Carnes', 'Quesos'])
  assert.equal(c.categorias.alimentos[0].barra, 100)
  assert.deepEqual(c.categorias.movstock, [])
  // Local sin mes anterior: pts null.
  const l2 = cmvDe(informeDe(['L1', 'L2']), 'L2')
  assert.equal(l2.porSub.alimentos.total, 100)
  assert.equal(l2.porSub.alimentos.pts, null)
})

test('paginasDe: sección con datos solo en el mes anterior → detalle sí, apertura no', () => {
  const inf = informeDe(['L1'], (im) => { im.auto.L1['2026-01'].gastos.push(g('Fijos / Variables', 'Edenor', 'A', 100)); return im })
  const p = ids(paginasDe(inf))
  assert.ok(p.includes('detalle:L1:fijos'))
  assert.ok(!p.includes('apertura:L1:fijos'))
  assert.deepEqual(detalleDe(inf, 'L1', 'fijos').filas.map((f) => [f.concepto, f.anterior, f.actual, f.diferencia]), [['Edenor', 100, null, -100]])
})

test('paginasDe: un concepto que da total 0 (+5 / −5) no arma una hoja de detalle vacía', () => {
  const inf = informeDe(['L1'], (im) => {
    im.auto.L1[MES].gastos.push(g('Publicidad', 'Volantes', 'A', 5), g('Publicidad', 'Volantes', 'B', -5))
    return im
  })
  assert.equal(detalleDe(inf, 'L1', 'generales').filas.length, 0)
  const p = ids(paginasDe(inf))
  assert.ok(!p.includes('detalle:L1:generales'))
  // La apertura sí tiene renglón: columna 1 = 5, columna 2 = −5.
  assert.ok(p.includes('apertura:L1:generales'))
})

test('cmvDe: con venta 0 en un mes los pts son null, no un número inventado', () => {
  const inf = informeDe(['L1'], conCmvAtte)
  inf.locales[0].mesAnterior.bases.venta = 0
  const c = cmvDe(inf, 'L1')
  assert.equal(c.pts, null)
  assert.equal(c.porSub.alimentos.pts, null)
  assert.equal(c.porSub.bebidas.pts, null)
  assert.equal(c.anterior.pct, null)
  assert.equal(c.pct, pct(41209956, 1200))
})

test('resumenDe: CMV bajó → diferencia < 0, sentido costo; comentario desde textos', () => {
  const inf = informeDe(['L1'], (im) => {
    im.auto.L1[MES].gastos = [g('CMV Alimentos', 'Carnes', 'A', 250), g('Sueldos', 'Sueldos', 'B', 250)]
    im.textos = [{ local: 'L1', mes: MES, clave: 'resumen:cmv', texto: 'Bajó por compras de agosto.' },
      { local: 'L2', mes: MES, clave: 'resumen:venta', texto: 'otro local' }]
    return im
  })
  const r = resumenDe(inf, 'L1')
  const f = (k) => r.find((x) => x.clave === k)
  assert.deepEqual(r.slice(0, 8).map((x) => x.clave), ['venta', 'dias', 'pax', 'prom_pax', 'cmv', 'cmv_alimentos', 'cmv_bebidas', 'cmv_movstock'])
  assert.equal(f('cmv').actual, 250)
  assert.equal(f('cmv').anterior, 300)
  assert.ok(f('cmv').diferencia < 0)
  assert.equal(f('cmv').sentido, 'costo')
  assert.equal(f('cmv').diferenciaPts, pct(250, 1200) - pct(300, 1000))
  assert.equal(f('cmv').comentario, 'Bajó por compras de agosto.')
  assert.equal(f('venta').sentido, 'resultado')
  assert.equal(f('venta').diferencia, 200)
  assert.equal(f('venta').diferenciaPts, null)
  assert.equal(f('venta').comentario, null)
  assert.equal(f('dias').diferencia, 2)
  assert.equal(f('labor').sentido, 'costo') // egreso con dato
  assert.equal(f('fijos'), undefined) // egreso sin dato en ningún mes
  assert.deepEqual(r.slice(-2).map((x) => x.clave), ['eerr', 'rf'])
  assert.equal(f('eerr').actual, 1200 - 250 - 250)
  assert.equal(f('eerr').sentido, 'resultado')
})

test('resumenDe sin mes anterior: anterior y diferencias null', () => {
  const r = resumenDe(informeDe(['L1', 'L2']), 'L2')
  const venta = r.find((x) => x.clave === 'venta')
  assert.equal(venta.actual, 500)
  assert.equal(venta.anterior, null)
  assert.equal(venta.diferencia, null)
  assert.equal(r.find((x) => x.clave === 'cmv').diferenciaPts, null)
})

test('cashflowDe: disponible 29.949.357, pagar 38.577.751 → resultado −8.628.394, cobertura 77,6', () => {
  const lineas = [
    cl('disponible', 'Galicia', 4894439), cl('disponible', 'Mercado Pago', 13484918), cl('disponible', 'Acreditaciones MP', 11570000),
    ...[11624732, 9680870, 9000000, 3109875, 1500000, 1450000, 1290274, 922000].map((m, i) => cl('pagar', `Pago ${i}`, String(m), { orden: i })),
    cl('mp_liquidar', 'MP', 32609505),
    cl('disponible', 'Otro mes', 999, { mes: '2026-01' }),
    cl('disponible', 'Oculta', 999, { oculta: true }),
  ]
  const inf = informeDe(['L1'], (im) => ({ ...im, lineas, textos: [
    { local: '', mes: MES, clave: 'cashflow:elaborado', texto: '2026-10-13' },
    { local: '', mes: MES, clave: 'cashflow:proyectado', texto: '2026-10-16' }] }))
  const c = cashflowDe(inf)
  assert.equal(c.disponible.total, 29949357)
  assert.equal(c.disponible.lineas.length, 3)
  assert.deepEqual(Object.keys(c.disponible.lineas[0]).sort(), ['concepto', 'id', 'monto'])
  assert.equal(c.pagar.total, 38577751)
  assert.equal(c.pagar.lineas[0].monto, 11624732)
  assert.equal(c.resultado, -8628394)
  assert.equal(Math.round(c.cobertura * 10) / 10, 77.6)
  assert.equal(c.mpLiquidar, 32609505)
  assert.equal(c.elaborado, '2026-10-13')
  assert.equal(c.proyectado, '2026-10-16')
  assert.equal(c.tieneDatos, true)
  // Sin nada cargado: todo null.
  const v = cashflowDe(informeDe())
  assert.deepEqual([v.disponible.total, v.pagar.total, v.resultado, v.cobertura, v.mpLiquidar, v.elaborado, v.tieneDatos],
    [null, null, null, null, null, null, false])
})

test('deudaDe: 32.994.552,98 sobre 222.823.794 → 14,81%; venta del período por defecto = venta del mes', () => {
  const inf = informeDe(['L1'], (im) => ({ ...im,
    lineas: [cl('deuda', 'Proveedores', 20000000), cl('deuda', 'AFIP', '12994552.98'), cl('venta_periodo', 'Venta 01/09 al 13/10', 222823794)],
    textos: [{ local: '', mes: MES, clave: 'deuda:fecha', texto: '2026-10-13' }] }))
  const d = deudaDe(inf)
  assert.equal(d.total, 32994552.98)
  assert.equal(d.ventaPeriodo, 222823794)
  assert.equal(d.pct.toFixed(2), '14.81')
  assert.equal(d.fecha, '2026-10-13')
  assert.equal(d.ventaPeriodoCargada, true)
  assert.equal(d.lineas.length, 2)
  // Sin venta del período cargada: la venta del mes del cliente (los dos locales).
  const dos = deudaDe(informeDe(['L1', 'L2'], (im) => ({ ...im, lineas: [cl('deuda', 'AFIP', 170)] })))
  assert.equal(dos.ventaPeriodo, 1700)
  assert.equal(dos.pct, 10)
  assert.equal(dos.ventaPeriodoCargada, false)
  const nada = deudaDe(informeDe())
  assert.deepEqual([nada.total, nada.pct, nada.fecha, nada.tieneDatos], [null, null, null, false])
})

test('snapshotIm: foto de cada local con fotoDeMes; cerrado con esa foto da los mismos números', () => {
  const inf = informeDe(['L1', 'L2'])
  const snap = snapshotIm(inf)
  assert.deepEqual(Object.keys(snap.locales), ['L1', 'L2'])
  assert.deepEqual(snap.locales.L1, fotoDeMes(inf.locales[0].meses[MES]))
  const cerrado = informeDe(['L1', 'L2'], (im) => ({ ...im, cierres: [{ mes: MES, cerrado: true, snapshot: snap }] }))
  assert.equal(cerrado.cerrado, true)
  for (const i of [0, 1]) {
    assert.equal(cerrado.locales[i].meses[MES].cerrado, true)
    assert.deepEqual(cerrado.locales[i].meses[MES].valores, inf.locales[i].meses[MES].valores)
    assert.deepEqual(cerrado.locales[i].meses[MES].totales, inf.locales[i].meses[MES].totales)
  }
  // Un local sin datos en el mes no entra en la foto (no se guarda un mes vacío).
  const rvData = rvDataDe(['L1'])
  const im = imDe(['L1', 'L2'])
  im.auto.L2[MES] = vacio()
  const soloL1 = armarInformeMensual({ im, rv: rvDe(rvData), mes: MES })
  assert.equal(soloL1.locales[1].meses[MES], null)
  assert.deepEqual(Object.keys(snapshotIm(soloL1).locales), ['L1'])
})


// ── Revisión final: pax = cubiertos del Reporte de Ventas, CMV / Labor sin dato ──

test('Togni\'s Café: 1 de 20 cajas informó cubiertos → pax y Prom. pax "—", aviso con la cuenta', () => {
  const tognis = (d) => { d.auto.L1.meses[MES] = { venta: 1200, cubiertos: 3, cajas: 20, sinCubiertos: 19, ventaConCubiertos: 60 }; return d }
  const im = imDe()
  im.auto.L1[MES].pax = 3 // aunque la API vieja lo mande crudo, no se usa
  const m = pylMes({ local: 'L1', mes: MES, im, rv: rvDeL1(tognis) })
  assert.equal(m.valores.pax, null)
  assert.equal(m.indicadores.pax, null)
  assert.equal(m.indicadores.promPax, null)
  const aviso = m.avisos.find((a) => a.tipo === 'cubiertos')
  assert.ok(aviso)
  assert.match(aviso.texto, /solo 1 de 20 cajas/)
  // En el informe: el aviso llega con el nombre del local.
  const inf = informeDe(['L1'], undefined, tognis)
  assert.ok(inf.avisos.some((a) => a.local === 'L1' && a.tipo === 'cubiertos'))
  assert.equal(inf.locales[0].meses[MES].indicadores.promPax, null)
})

test('pax: los cubiertos cargados a mano en el Reporte de Ventas son el pax del informe (mismo número)', () => {
  const conMano = (d) => {
    d.auto.L1.meses[MES] = { venta: 1200, cubiertos: 3, cajas: 20, sinCubiertos: 19 }
    d.valores = [{ local: 'L1', mes: MES, dato: 'cubiertos', valor: 300, original: null }]
    return d
  }
  const { rvLocal } = rvDeL1(conMano)
  const m = pylMes({ local: 'L1', mes: MES, im: imDe(), rv: { rvLocal } })
  assert.equal(m.valores.pax, 300)
  assert.equal(m.valores.pax, rvLocal.cubiertos.valor)
  assert.equal(m.indicadores.promPax, 900 / 300)
  assert.ok(!m.avisos.some((a) => a.tipo === 'cubiertos'))
})

test('pax: algunas cajas sin cubiertos (más de la mitad informó) → valor de gestión y aviso de promedio alto', () => {
  const parcial = (d) => { d.auto.L1.meses[MES] = { venta: 1200, cubiertos: 55, cajas: 10, sinCubiertos: 2, ventaConCubiertos: 1000 }; return d }
  const m = pylMes({ local: 'L1', mes: MES, im: imDe(), rv: rvDeL1(parcial) })
  assert.equal(m.valores.pax, 55)
  const aviso = m.avisos.find((a) => a.tipo === 'cubiertos')
  assert.match(aviso.texto, /2 cajas no informaron cubiertos/)
})

test('informe de enero: el mes anterior (diciembre) usa la venta corregida y los canales del Reporte de Ventas', () => {
  const ENE = '2026-01'
  const rvData = {
    cliente: { locales: ['L1'] }, mes: ENE, reglas: [], cierres: [],
    valores: [{ local: 'L1', mes: '2025-12', dato: 'venta', valor: 950, original: 900 }],
    auto: { L1: {
      meses: { '2025-12': { venta: 900, cubiertos: 40 }, [ENE]: { venta: 1000, cubiertos: 50 } },
      detalles: { '2025-12': [{ metodo: 'Rappi', monto: 100 }] }, cajasOrigen: {}, cantidades: {},
    } },
  }
  const rv = armarReporte({ cliente: rvData.cliente, mes: ENE, porLocal: armarPorLocal(rvData), hoy: HOY })
  const im = { ...imDe(), mes: ENE }
  im.auto.L1['2025-12'] = { efectivo: 0, dias: 25, gastos: [g('CMV Alimentos', 'Carnes', 'A', 100)], cajaGastos: 0 }
  const inf = armarInformeMensual({ im, rv, mes: ENE })
  const dic = inf.locales[0].mesAnterior
  assert.equal(dic.mes, '2025-12')
  assert.equal(dic.bases.venta, 950) // la corregida en el RV, no los 900 de gestión
  assert.deepEqual(dic.canales.map((c) => [c.canal, c.total]).sort(), [['Local', 850], ['Rappi', 100]])
  assert.equal(dic.valores.pax, 40)
})

test('meses que no son el del informe: canales del cierre del Reporte de Ventas, no los automáticos', () => {
  const cerradoEne = (d) => {
    d.cierres = [{ mes: '2026-01', origen: 'reporte', snapshot: { locales: { L1: { venta: 1000, cubiertos: 45, canales: { Rappi: 150, Local: 850 } } } } }]
    return d
  }
  const m = pylMes({ local: 'L1', mes: '2026-01', im: imDe(), rv: rvDeL1(cerradoEne) })
  assert.deepEqual(m.canales.map((c) => [c.canal, c.total]).sort(), [['Local', 850], ['Rappi', 150]])
  assert.equal(m.valores.pax, 45)
})

test('canales que suman más que la venta: aviso "Local queda negativo"', () => {
  const eventos = (d) => { d.valores = [{ local: 'L1', mes: MES, dato: 'canal:Eventos', valor: 5000 }]; return d }
  const m = pylMes({ local: 'L1', mes: MES, im: imDe(), rv: rvDeL1(eventos) })
  assert.ok(m.avisos.some((a) => a.tipo === 'canal' && /Local queda negativo/.test(a.texto)))
})

test('sin CMV ni sueldos cargados: CMV, CMV % y Labor % son null (no 0%), con aviso; el resultado se calcula igual', () => {
  const im = imDe()
  im.auto.L1[MES].gastos = [g('Fijos / Variables', 'Edenor', 'A', 100)]
  const m = pylMes({ local: 'L1', mes: MES, im, rv: rvDeL1() })
  assert.equal(m.indicadores.cmv, null)
  assert.equal(m.indicadores.cmvPct, null)
  assert.equal(m.indicadores.labor, null)
  assert.equal(m.indicadores.laborPct, null)
  assert.equal(m.indicadores.eerr, 1200 - 100)
  assert.ok(m.avisos.some((a) => a.tipo === 'cmv' && /Falta cargar el CMV/.test(a.texto)))
  assert.ok(m.avisos.some((a) => a.tipo === 'labor' && /Faltan cargar los sueldos/.test(a.texto)))
  // Resumen ejecutivo: CMV, sus partes y Labor sin dato en el mes (no "$ 0").
  const inf = informeDe(['L1'], (x) => { x.auto.L1[MES].gastos = [g('Fijos / Variables', 'Edenor', 'A', 100)]; return x })
  const r = resumenDe(inf, 'L1')
  assert.equal(r.find((x) => x.clave === 'cmv').actual, null)
  assert.equal(r.find((x) => x.clave === 'cmv_alimentos').actual, null)
  assert.equal(r.find((x) => x.clave === 'labor').actual, null)
  assert.ok(inf.avisos.some((a) => a.local === 'L1' && a.tipo === 'cmv'))
})

test('con CMV y sueldos: CMV % y Labor % se calculan y no hay aviso', () => {
  const m = pylMes({ local: 'L1', mes: MES, im: imDe(), rv: rvDeL1() })
  assert.equal(m.indicadores.cmv, 400)
  assert.equal(m.indicadores.cmvPct, pct(400, 1200))
  assert.equal(m.indicadores.labor, 250)
  assert.equal(m.indicadores.laborPct, pct(250, 1200))
  assert.ok(!m.avisos.some((a) => a.tipo === 'cmv' || a.tipo === 'labor'))
})

test('una línea a mano va en su lugar alfabético dentro de la sección, no al final', () => {
  const im = imDe()
  im.lineas = [
    { id: 1, local: 'L1', mes: MES, hoja: 'pyl', seccion: 'cmv', concepto: 'Almacén', monto: 10, monto2: null, corrige: null, oculta: false },
    { id: 2, local: 'L1', mes: MES, hoja: 'pyl', seccion: 'cmv', concepto: 'verduras', monto: 5, monto2: null, corrige: null, oculta: false },
  ]
  const m = pylMes({ local: 'L1', mes: MES, im, rv: rvDeL1() })
  assert.deepEqual(m.secciones.find((s) => s.key === 'cmv').lineas.map((l) => l.concepto), ['Almacén', 'Carnes', 'verduras'])
})

test('buscarLineas: en el mes, a mano otros meses (con los montos de la última vez) y categorías de gestión', () => {
  const manual = (id, mes, monto2) => ({ id, local: 'L1', mes, hoja: 'pyl', seccion: 'alquiler', concepto: 'Alquiler', monto: null, monto2, corrige: null, oculta: false })
  const cambiar = (im) => {
    im.lineas = [manual(1, '2025-12', 1000), manual(2, '2026-01', 1550)]
    im.auto.L1['2025-02'] = { ...vacio(), gastos: [g('CMV Bebidas', 'Hielo', 'A', 30)] }
    return im
  }
  const inf = informeDe(['L1'], cambiar)
  const im = cambiar(imDe())
  const buscar = (texto, secciones) => buscarLineas({ informe: inf, im, local: 'L1', texto, secciones })

  assert.deepEqual(buscar('ALQ'), {
    enMes: [], gestion: [],
    aMano: [{ seccion: 'alquiler', concepto: 'Alquiler', sub: null, monto: null, monto2: 1550, mes: '2026-01' }],
  })
  // Sin texto: solo lo cargado a mano otros meses.
  assert.equal(buscar('').aMano.length, 1)
  assert.deepEqual(buscar('').enMes, [])
  assert.deepEqual(buscar('car').enMes.map((x) => [x.seccion, x.concepto, x.total]), [['cmv', 'Carnes', 400]])
  assert.deepEqual(buscar('hie').gestion, [{ seccion: 'cmv', concepto: 'Hielo', sub: 'bebidas' }])
  // Solo las secciones de la hoja.
  assert.deepEqual(buscar('alq', ['cmv']).aMano, [])
  // Ya cargada en el mes: aparece en el mes, no como "a mano otros meses".
  im.lineas.push(manual(3, MES, 1600))
  const inf2 = armarInformeMensual({ im, rv: rvDe(rvDataDe(['L1'])), mes: MES })
  const r = buscarLineas({ informe: inf2, im, local: 'L1', texto: 'alqui' })
  assert.deepEqual(r.aMano, [])
  assert.deepEqual(r.enMes.map((x) => [x.concepto, x.origen]), [['Alquiler', 'manual']])
})
