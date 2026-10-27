import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOJAS_IM, SECCIONES_LINEA, rangoInforme, lineaOk, hojasOk, indicadoresOk, textoOk, datoIm, trasladoOk, accionTraslado } from './informeMensual.js'

const base = { local: 'EVELIA', mes: '2026-09', hoja: 'pyl', seccion: 'otros', concepto: 'Seguro', monto: 1000, monto2: null }

test('lineaOk: acepta una línea pyl válida con defaults', () => {
  const r = lineaOk(base)
  assert.equal(r.ok, true)
  assert.equal(r.linea.oculta, false)
  assert.equal(r.linea.orden, 0)
  assert.equal(r.linea.monto2, null)
  assert.equal(r.linea.corrige, null)
})
test('lineaOk: pyl exige local', () => {
  assert.deepEqual(lineaOk({ ...base, local: null }), { ok: false, error: 'Falta el local.' })
})
test('lineaOk: cashflow y deuda exigen local null y sección válida', () => {
  assert.equal(lineaOk({ ...base, hoja: 'cashflow', local: null, seccion: 'pagar' }).ok, true)
  assert.equal(lineaOk({ ...base, hoja: 'cashflow', local: null, seccion: 'otra' }).ok, false)
  assert.equal(lineaOk({ ...base, hoja: 'cashflow', local: 'EVELIA', seccion: 'pagar' }).ok, false)
  assert.equal(lineaOk({ ...base, hoja: 'deuda', local: null, seccion: 'venta_periodo' }).ok, true)
})
test('lineaOk: rechaza montos que no son número', () => {
  assert.equal(lineaOk({ ...base, monto: NaN }).ok, false)
  assert.equal(lineaOk({ ...base, monto: Infinity }).ok, false)
  assert.equal(lineaOk({ ...base, monto2: '5' }).ok, false)
})
test('lineaOk: acepta una corrección sin concepto', () => {
  const r = lineaOk({ ...base, concepto: undefined, corrige: 'cmv|quesos', seccion: 'cmv', monto: 100 })
  assert.equal(r.ok, true)
  assert.equal(r.linea.corrige, 'cmv|quesos')
})
test('lineaOk: sin concepto ni corrección es error; concepto largo también', () => {
  assert.equal(lineaOk({ ...base, concepto: ' ' }).ok, false)
  assert.equal(lineaOk({ ...base, concepto: 'x'.repeat(81) }).ok, false)
  assert.equal(lineaOk({ ...base, mes: '2026-13' }).ok, false)
  assert.equal(lineaOk({ ...base, seccion: 'nada' }).ok, false)
  assert.equal(lineaOk(null).ok, false)
})
test('hojasOk', () => {
  assert.equal(hojasOk([{ clave: 'cmv', visible: false, orden: 3 }, { clave: 'cmv', visible: true, orden: 4 }]), null)
  assert.equal(hojasOk([{ clave: 'xx' }]), null)
  assert.deepEqual(hojasOk([{ clave: 'cmv', visible: false, orden: 3 }]), [{ clave: 'cmv', visible: false, orden: 3 }])
  assert.equal(hojasOk('x'), null)
  assert.equal(HOJAS_IM.length, 15)
})
test('indicadoresOk', () => {
  const v = { EVELIA: [{ clave: 'cub_dia', nombre: 'Cubiertos día', formato: 'numero' }] }
  assert.deepEqual(indicadoresOk(v, ['EVELIA']), v)
  assert.equal(indicadoresOk(v, ['OTRO']), null)
  assert.equal(indicadoresOk({ EVELIA: [{ clave: 'A B', nombre: 'x', formato: 'numero' }] }, ['EVELIA']), null)
  assert.equal(indicadoresOk({ EVELIA: [{ clave: 'a', nombre: 'x', formato: 'euros' }] }, ['EVELIA']), null)
  const nueve = Array.from({ length: 9 }, (_, i) => ({ clave: 'k' + i, nombre: 'x', formato: 'pesos' }))
  assert.equal(indicadoresOk({ EVELIA: nueve }, ['EVELIA']), null)
})
test('textoOk', () => {
  assert.equal(textoOk('resumen:venta', 'x'.repeat(401)), null)
  assert.equal(textoOk('resumen:venta', ' hola '), 'hola')
  assert.equal(textoOk('resumen:venta', ''), '')
  assert.equal(textoOk('cashflow:elaborado', 'ok'), 'ok')
  assert.equal(textoOk('deuda:fecha', 'x'.repeat(41)), null)
  assert.equal(textoOk('otra', 'x'), null)
  assert.equal(textoOk('resumen:', 'x'), null)
})
test('datoIm', () => {
  assert.equal(datoIm('ind:r50'), 'ind:r50')
  assert.equal(datoIm('pax'), 'pax')
  assert.equal(datoIm('dias'), 'dias')
  assert.equal(datoIm('venta'), null)
  assert.equal(datoIm('ind:'), null)
  assert.ok(SECCIONES_LINEA.pyl.includes('cmv'))
})

test('rangoInforme: desde enero del año anterior hasta el último día del mes', () => {
  assert.deepEqual(rangoInforme('2026-09'), { desde: '2025-01-01', hasta: '2026-09-30' })
  assert.deepEqual(rangoInforme('2026-02'), { desde: '2025-01-01', hasta: '2026-02-28' })
  assert.deepEqual(rangoInforme('2024-02'), { desde: '2023-01-01', hasta: '2024-02-29' })
  assert.deepEqual(rangoInforme('2026-12'), { desde: '2025-01-01', hasta: '2026-12-31' })
})
test('lineaOk: sub del CMV solo en pyl/cmv y con valor conocido', () => {
  const cmv = { ...base, seccion: 'cmv', concepto: 'Vinos' }
  assert.equal(lineaOk(cmv).linea.sub, null)
  assert.equal(lineaOk({ ...cmv, sub: 'bebidas' }).linea.sub, 'bebidas')
  assert.equal(lineaOk({ ...cmv, sub: 'movstock' }).linea.sub, 'movstock')
  assert.equal(lineaOk({ ...cmv, sub: null }).linea.sub, null)
  assert.deepEqual(lineaOk({ ...cmv, sub: 'postres' }), { ok: false, error: 'El tipo de CMV no es válido.' })
  assert.deepEqual(lineaOk({ ...base, sub: 'bebidas' }), { ok: false, error: 'El tipo de CMV solo se indica en líneas de CMV.' })
  assert.equal(lineaOk({ ...base, hoja: 'cashflow', local: null, seccion: 'pagar', sub: 'bebidas' }).ok, false)
})

test('trasladoOk: sin traslado es null; claves de texto de hasta 200; a null = sale del P&L; sub como en lineaOk', () => {
  assert.deepEqual(trasladoOk(undefined), { ok: true, traslado: null })
  assert.deepEqual(trasladoOk(null), { ok: true, traslado: null })
  assert.deepEqual(trasladoOk({ de: 'otros|alarma', a: 'alquiler|alarma' }), { ok: true, traslado: { de: 'otros|alarma', a: 'alquiler|alarma', sub: null } })
  assert.deepEqual(trasladoOk({ de: 'cmv|quesos', a: null }), { ok: true, traslado: { de: 'cmv|quesos', a: null, sub: null } })
  assert.equal(trasladoOk({ de: 'otros|hielo', a: 'cmv|hielo', sub: 'bebidas' }).traslado.sub, 'bebidas')
  assert.equal(trasladoOk({ de: '', a: 'otros|x' }).ok, false)
  assert.equal(trasladoOk({ de: 'x'.repeat(201), a: 'otros|x' }).ok, false)
  assert.equal(trasladoOk({ de: 'otros|x', a: 'y'.repeat(201) }).ok, false)
  assert.equal(trasladoOk({ de: 'otros|x', a: 5 }).ok, false)
  assert.equal(trasladoOk({ de: 'otros|x' }).ok, false) // a tiene que venir: null o la clave nueva
  assert.equal(trasladoOk({ de: 'otros|x', a: 'nada|x' }).ok, false) // sección desconocida
  assert.equal(trasladoOk({ de: 'otros|x', a: 'cmv|x', sub: 'vinos' }).ok, false)
  assert.equal(trasladoOk({ de: 'otros|x', a: 'alquiler|x', sub: 'bebidas' }).ok, false) // sub solo yendo al CMV
  assert.equal(trasladoOk('otros|x').ok, false)
})

test('accionTraslado: mover la corrección a la clave nueva o borrarla', () => {
  const fila = { id: '7', seccion: 'otros', corrige: 'otros|alarma', sub: null }
  // sale del P&L: se borra
  assert.deepEqual(accionTraslado(fila, { de: 'otros|alarma', a: null, sub: null }, false), { borrar: true })
  // ya hay una corrección con la clave nueva en ese cliente, local y mes: se borra la vieja
  assert.deepEqual(accionTraslado(fila, { de: 'otros|alarma', a: 'alquiler|alarma', sub: null }, true), { borrar: true })
  // si no, cambia de clave y de sección
  assert.deepEqual(accionTraslado(fila, { de: 'otros|alarma', a: 'alquiler|alarma', sub: null }, false),
    { cambio: { corrige: 'alquiler|alarma', seccion: 'alquiler', sub: null } })
  // al CMV lleva el tipo (el de la fila si tenía, si no el del traslado, si no alimentos)
  assert.deepEqual(accionTraslado(fila, { de: 'otros|alarma', a: 'cmv|alarma', sub: 'bebidas' }, false).cambio.sub, 'bebidas')
  assert.deepEqual(accionTraslado(fila, { de: 'otros|alarma', a: 'cmv|alarma', sub: null }, false).cambio.sub, 'alimentos')
  // fuera del CMV, sin tipo
  assert.equal(accionTraslado({ ...fila, seccion: 'cmv', sub: 'bebidas' }, { de: 'cmv|alarma', a: 'otros|alarma', sub: null }, false).cambio.sub, null)
})
