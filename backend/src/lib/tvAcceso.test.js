import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listaDeMails, puedeVerTv } from './tvAcceso.js'

const lista = listaDeMails(' Maximiliano@venetsi.com, oficina@venetsi.com;tv@venetsi.com  basura ')

test('la lista ignora mayúsculas, espacios y lo que no es un mail', () => {
  assert.deepEqual([...lista].sort(), ['maximiliano@venetsi.com', 'oficina@venetsi.com', 'tv@venetsi.com'])
  assert.equal(listaDeMails('').size, 0)
  assert.equal(listaDeMails(undefined).size, 0)
})

test('un mail de la lista entra aunque no sea usuario de gestión', () => {
  assert.equal(puedeVerTv('MAXIMILIANO@venetsi.com', lista, null), true)
})

test('un super_admin activo de gestión entra', () => {
  assert.equal(puedeVerTv('alguien@x.com', lista, { activo: true, roles: ['super_admin'] }), true)
})

test('un super_admin dado de baja no entra', () => {
  assert.equal(puedeVerTv('alguien@x.com', lista, { activo: false, roles: ['super_admin'] }), false)
})

test('otros roles de gestión no entran, ni siquiera admin o dcsmart', () => {
  assert.equal(puedeVerTv('a@x.com', lista, { activo: true, roles: ['admin', 'dcsmart', 'cajero'] }), false)
})

test('sin mail no entra nadie', () => {
  assert.equal(puedeVerTv('', lista, { activo: true, roles: ['super_admin'] }), false)
})
