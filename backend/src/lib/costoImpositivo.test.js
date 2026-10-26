import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularLocal, totalizar, alicuotaOk } from './costoImpositivo.js'

const r = Math.round

// Los números de septiembre 2026 que el usuario validó el 26/10.
const PASEO = {
  z: 139533807,
  ingresos: { neto: 32405, iva: 6805, facturas: 1 },
  egresos: { neto: 94563445, iva: 12226013, percIva: 222630, percIibb: 914623, internos: 433339, facturas: 172 },
  alicuota: 3
}
const TACUARI_185 = {
  z: 30081136,
  egresos: { neto: 3195582, iva: 107534, percIva: 10976, percIibb: 13393, internos: 26027, facturas: 9 },
  alicuota: 3
}
const TACUARI_84 = {
  z: 70291796,
  ingresos: { neto: 6424, iva: 1349, facturas: 1 },
  egresos: { neto: 111830521, iva: 17446318, percIva: 1146465, percIibb: 1749826, internos: 276577, percVieja: 1806, facturas: 249 },
  alicuota: 3
}

test('IVA AP: IVA de las facturas + IVA del Z, nunca el neto', () => {
  const c = calcularLocal(PASEO)
  assert.equal(r(c.iva.debito.cajas), 24216611)
  assert.equal(r(c.iva.debito.total), 24223416)
  assert.equal(r(c.iva.credito.total), 12448643)
  assert.equal(r(c.iva.ap), 11774773)
})

test('IIBB AP: (Z/1,21 + neto de ingresos) × alícuota − percepciones de IIBB de las compras', () => {
  const c = calcularLocal(PASEO)
  assert.equal(r(c.iibb.base.total), 115349601)
  assert.equal(r(c.iibb.debito.total), 3460488)
  assert.equal(r(c.iibb.credito.total), 914623)
  assert.equal(r(c.iibb.ap), 2545865)
})

test('saldo a favor sale negativo', () => {
  const c = calcularLocal(TACUARI_84)
  assert.equal(r(c.iva.ap), -6392031)
  assert.equal(r(c.iibb.ap), -6861)
  assert.equal(c.aRevisar.percVieja, 1806)
})

test('Gran Latino sin Tucumán: los tres totales validados', () => {
  const locales = [PASEO, TACUARI_185, TACUARI_84].map((d, i) => ({ nombre: 'L' + i, calculo: calcularLocal(d) }))
  locales.push({ nombre: 'LATINO TUCUMAN', incluir: false, calculo: calcularLocal({ z: 15252553, alicuota: 3 }) })
  const t = totalizar(locales)
  assert.equal(r(t.iva.ap), 10484925)
  assert.equal(r(t.iibb.ap), 3271424)
  assert.equal(t.internos, 735943)
  assert.equal(t.locales, 3)
})

test('sin alícuota no hay IIBB y el local queda avisado', () => {
  const c = calcularLocal({ ...TACUARI_185, alicuota: null })
  assert.equal(c.iibb.ap, null)
  assert.equal(r(c.iva.ap), 5102183)
  const t = totalizar([{ nombre: 'TACUARI 185', calculo: c }])
  assert.deepEqual(t.iibb.sinAlicuota, ['TACUARI 185'])
  assert.equal(t.iibb.ap, 0)
})

test('alícuota válida entre 0 y 20', () => {
  assert.equal(alicuotaOk('3'), 3)
  assert.equal(alicuotaOk(4.5), 4.5)
  assert.equal(alicuotaOk(''), null)
  assert.equal(alicuotaOk(null), null)
  assert.equal(alicuotaOk(25), undefined)
  assert.equal(alicuotaOk('x'), undefined)
})
