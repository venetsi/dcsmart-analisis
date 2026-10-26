import test from 'node:test'
import assert from 'node:assert/strict'
import { anteriorActualizado, crecimientoReal, factorInteranual, inflacionAnio, inflacionDelAcumulado, inflacionMes } from './inflacion.js'

// IPC con 2% todos los meses de 2025 y 2026, salvo septiembre 2026 que todavía no salió.
const ipc = {}
for (const a of [2025, 2026]) for (let m = 1; m <= 12; m++) ipc[`${a}-${String(m).padStart(2, '0')}`] = { variacion: 2 }
delete ipc['2026-09']

test('inflación del mes y acumulada del año', () => {
  assert.equal(inflacionMes(ipc, '2026-08'), 2)
  assert.equal(inflacionMes(ipc, '2026-09'), null)
  assert.equal(inflacionAnio(ipc, '2026-02'), 4.04) // 1,02² − 1
  assert.equal(inflacionAnio(ipc, '2026-09'), null) // falta septiembre: no se inventa
})
test('interanual: doce meses encadenados', () => {
  assert.ok(Math.abs(factorInteranual(ipc, '2026-08') - 1.02 ** 12) < 1e-12)
  assert.equal(factorInteranual(ipc, '2026-09'), null)
})
test('878 enero: +29,6% nominal pero la inflación interanual fue mayor', () => {
  const real = { '2025-01': { variacion: 0 } }
  // factor interanual de enero 2026 según INDEC: 10413,0309 / 7864,1257
  const f = 10413.0309 / 7864.1257
  for (let m = 2; m <= 12; m++) real[`2025-${String(m).padStart(2, '0')}`] = { variacion: 0 }
  real['2026-01'] = { variacion: (f - 1) * 100 }
  const act = anteriorActualizado(real, '2026-01', 28556999)
  assert.equal(Math.round(act), Math.round(28556999 * f))
  assert.equal(crecimientoReal(37005243, act), -2.14)
})
test('acumulado: crecimiento real sobre la suma de 2025 actualizada', () => {
  const filas = [{ mes: '2026-01', venta: 130, anterior: 100 }, { mes: '2026-02', venta: 130, anterior: 100 }]
  const r = inflacionDelAcumulado(ipc, filas, '2026-02')
  assert.equal(r.mes, 2)
  assert.equal(r.anio, 4.04)
  assert.equal(Math.round(r.anteriorAct), Math.round(200 * 1.02 ** 12))
  assert.equal(r.real, crecimientoReal(260, 200 * 1.02 ** 12))
  // Falta la inflación de un mes: no hay real.
  assert.equal(inflacionDelAcumulado(ipc, [...filas, { mes: '2026-09', venta: 1, anterior: 1 }], '2026-09').real, null)
})
