import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import {
  leerTablas, interpretarHistorico, interpretarCanales, interpretarCanalesHorizontal,
  interpretarDelivery, interpretarMulti, leerPeriodo,
} from './decks.js'

// Filas reales del inventario de decks (Reporte Ventas Finales).

test('histórico 878: dos años, personas y órdenes', () => {
  const r = interpretarHistorico([
    ['PERIODO','2.025','2.026','PERSONAS','PROM PERSONAS','ORDENES','PROM ORDENES','EVOLUCION PESOS','EVOLUCION PORCENTUAL','VARIABLE VS 2025'],
    ['ene','28.556.999','37.005.243','1.490','24.836','680','54.419','(66.413.090)','-64,22%','29,58%']], { anio: 2026 })
  assert.deepEqual(r.meses['2026-01'], { venta: 37005243, cubiertos: 1490, ordenes: 680 })
  assert.deepEqual(r.anterior['2025-01'], { venta: 28556999 })
  assert.deepEqual(r.diferencias, [])
})

test('histórico Evelia: venta en la columna del local, "ene 26"', () => {
  const r = interpretarHistorico([['PERIODO','EVELIA','Cubiertos','Promedio','Variable $ VMA','Variable % VMA','Variable VS 2025'],
    ['ene 26','312.054.740','5.912','52.783','18.965.180','6,47%','31,07%']], { anio: 2026 })
  assert.deepEqual(r.meses['2026-01'], { venta: 312054740, cubiertos: 5912 })
})

test('histórico Mafia: los turnos quedan sin mapear', () => {
  const r = interpretarHistorico([['PERIODO','TOTAL DE VENTAS','TURNO DIA','CUBIERTOS TURNO DIA','PROMEDIO CUBIERTOS','TURNO NOCHE','CUBIERTOS TURNO NOCHE','PROMEDIO CUBIERTOS','BIGBOX','EVOLUCION PESOS','EVOLUCION PORCENTUAL'],
    ['ene-26','25.348.700','','','','','619','40.951','','(7.715.085)','-23,33%']], { anio: 2026 })
  assert.equal(r.meses['2026-01'].venta, 25348700)
  assert.equal(r.meses['2026-01'].cubiertos, undefined)
  assert.ok(r.sinMapear.includes('TURNO DIA') && r.sinMapear.includes('BIGBOX'))
  assert.ok(r.sinMapear.includes('CUBIERTOS TURNO NOCHE'))
})

test('canales Pizza sep-26 cierran contra el total', () => {
  const r = interpretarCanales([['Canal de Venta','Importe','INC'],['Local','221.447.840','70,05%'],['Rappi','55.114.440','17,44%'],['Pedidos Ya','39.544.560','12,51%'],['Total','316.106.840','100,00%']])
  assert.deepEqual(r.canales, { 'Local': 221447840, 'Rappi': 55114440, 'Pedidos Ya': 39544560 }); assert.equal(r.total, 316106840)
  assert.deepEqual(r.diferencias, [])
})

test('una diferencia en un promedio se informa', () => {
  // Fila de 878 con PROM PERSONAS cambiado a 99.999 (el real es 24.836).
  const r = interpretarHistorico([
    ['PERIODO','2.025','2.026','PERSONAS','PROM PERSONAS','ORDENES','PROM ORDENES','EVOLUCION PESOS','EVOLUCION PORCENTUAL','VARIABLE VS 2025'],
    ['ene','28.556.999','37.005.243','1.490','99.999','680','54.419','(66.413.090)','-64,22%','29,58%']], { anio: 2026 })
  assert.equal(r.diferencias.length, 1)
  assert.match(r.diferencias[0], /PROM PERSONAS/)
  assert.deepEqual(r.meses['2026-01'], { venta: 37005243, cubiertos: 1490, ordenes: 680 }) // el dato no cambia
})

test('canales: si las líneas no suman el total, va a diferencias', () => {
  const r = interpretarCanales([['Canal de Venta','Importe','INC'],['Local','100','50,00%'],['Rappi','90','50,00%'],['Total','200','100,00%']])
  assert.ok(r.diferencias.some((d) => /suma/.test(d)))
})

test('canales sin encabezado (Gran Latino): el título no es un canal', () => {
  const r = interpretarCanales([['VENTAS SEPTIEMBRE -2026', ''], ['Tacuari 185','34.737.724'], ['Tucuman','63.166.677'], ['TOTALES','97.904.401']])
  assert.deepEqual(r.canales, { 'Tacuari 185': 34737724, 'Tucuman': 63166677 })
  assert.deepEqual(r.sinMapear, [])
  assert.deepEqual(r.diferencias, [])
})

test('evolución contra el mes anterior y contra el año anterior se verifica', () => {
  const enc = ['PERIODO','2025','2026','Evolucion $ VMA','Evolucion % VMA','ORDENES','Evolucion % MA','PAX','VARIABLE VS 2025']
  // Victor feb y mar reales: todo cierra.
  const ok = interpretarHistorico([enc,
    ['febrero','36.163.787','95.734.720','(20.929.590)','-17,94%','1.655','-22,26%','2.501','164,73%'],
    ['marzo','84.052.754','121.614.487','25.879.767','27,03%','2.051','23,93%','2.964','44,69%']], { anio: 2026 })
  assert.deepEqual(ok.diferencias, [])
  assert.deepEqual(ok.meses['2026-03'], { venta: 121614487, ordenes: 2051, cubiertos: 2964 })
  // Caprichito feb: -37,10% donde da -3,27%.
  const mal = interpretarHistorico([['PERIODO','CAPRICHITO','Evolucion $ VMA','Evolucion % VMA'],
    ['ene-26','134.212.249','11.832.449','9,67%'], ['feb-26','129.822.695','(4.389.554)','-37,10%']], { anio: 2026 })
  assert.equal(mal.diferencias.length, 1)
  assert.match(mal.diferencias[0], /2026-02/)
})

test('fila TOTAL: se verifica la suma y no es un mes', () => {
  const r = interpretarHistorico([['PERIODO','EVELIA','Cubiertos','Promedio'],
    ['ene 26','100','10','10'], ['feb 26','200','10','20'], ['TOTAL','310','20','15']], { anio: 2026 })
  assert.deepEqual(Object.keys(r.meses), ['2026-01','2026-02'])
  assert.equal(r.diferencias.length, 1)
  assert.match(r.diferencias[0], /TOTAL/)
})

test('N/A no se carga como 0', () => {
  const r = interpretarHistorico([['PERIODO','DON ALDO','PERSONAS','PROMEDIO PERSONAS','EVOLUCIÓN PESOS','EVOLUCIÓN PORCENTUAL'],
    ['ene 26','37.733.485','N/A','N/A','N/A','N/A']], { anio: 2026 })
  assert.deepEqual(r.meses['2026-01'], { venta: 37733485 })
})

test('una sola columna de año menor es el año anterior (Club Lucero)', () => {
  const r = interpretarHistorico([['PERIODO','CLUB LUCERO 2025','VENTAS','ORDENES','PROM ORDENES','EVOLUCION PESOS','EVOLUCION PORCENTUAL','VARIABLE VS 2025'],
    ['ago-26','59.329.152','56.985.750','1.633','34.896','633.445','1,12%','-3,95%']], { anio: 2026 })
  assert.deepEqual(r.meses['2026-08'], { venta: 56985750, ordenes: 1633 })
  assert.deepEqual(r.anterior['2025-08'], { venta: 59329152 })
  assert.deepEqual(r.diferencias, [])
})

test('períodos', () => {
  assert.equal(leerPeriodo('ene', 2026), '2026-01')
  assert.equal(leerPeriodo('ene 26', 2025), '2026-01')
  assert.equal(leerPeriodo('ene-26', 2026), '2026-01')
  assert.equal(leerPeriodo('enero', 2026), '2026-01')
  assert.equal(leerPeriodo('sept 26', 2026), '2026-09')
  assert.equal(leerPeriodo('sept-26', 2026), '2026-09')
  assert.equal(leerPeriodo('septiembre', 2026), '2026-09')
  assert.equal(leerPeriodo('sep 26', 2026), '2026-09')
  assert.equal(leerPeriodo('TOTAL', 2026), null)
  assert.equal(leerPeriodo('', 2026), null)
})

test('canales horizontales (Danzon) y "LOCAL" pasa a "Local"', () => {
  const r = interpretarCanalesHorizontal([
    ['VENTAS 9-2026','','LOCAL','EVENTOS','RAPPI/PY','USD'],
    ['TTS','144.913.430','122.322.661','22.358.161','232.608',''],
    ['TOTALES','144.913.430','122.322.661','22.358.161','232.608','0']])
  assert.deepEqual(r.canales, { 'Local': 122322661, 'EVENTOS': 22358161, 'RAPPI/PY': 232608 })
  assert.equal(r.total, 144913430)
  assert.ok(r.sinMapear.some((s) => /USD/.test(s)))
  assert.deepEqual(r.diferencias, [])
})

test('delivery por app (Togni\'s Café): venta y tickets por mes, verifica sumas y promedios', () => {
  const r = interpretarDelivery([
    ['TOGNIS CAFE * VENTAS DELIVERY *'],
    ['PERIODO','VENTA DELIVERY','VARIABLE % MA','TICKET DELIVEY','VARIABLE TK % MA','Rappi','TICKET','PROMEDIO','Ecommerce','TICKET','PROMEDIO','Cheaf','TICKET','PROMEDIO'],
    ['ene-26','455.203','N/A','45','N/A','169.500','11','15.409','168.000','8','21.000','117.703','26','4.527'],
    ['feb-26','1.964.390','1.509.187','124','175,56%','1.381.900','65','21.260','325.600','8','40.700','256.890','51','5.037']], { anio: 2026 })
  assert.deepEqual(r.meses['2026-01'], {
    Rappi: { venta: 169500, tickets: 11 }, Ecommerce: { venta: 168000, tickets: 8 }, Cheaf: { venta: 117703, tickets: 26 } })
  assert.deepEqual(r.meses['2026-02'].Rappi, { venta: 1381900, tickets: 65 })
  assert.deepEqual(r.diferencias, [])
})

test('varios locales en columnas (Gran Latino): venta por local y TOTALES verificado', () => {
  const r = interpretarMulti([
    ['PERIODO','TACUARI 185','TACUARI 84','PASEO','Tucuman','TOTALES','VARIABLE VS MES ANTERIOR','TOTALES 2025','INTERANUAL VS 2025'],
    [''],
    ['ago','28.705.750','168.152.098','222.626.620','','419.484.468','5,22%','321.859.643','30,33%'],
    ['sept','34.737.724','170.536.058','230.662.421','63.166.677','499.102.880','18,98%','345.592.452','44,42%']],
  { anio: 2026, columnas: { 'TACUARI 185': 'LATINO TACUARI 185', 'TACUARI 84': 'LATINO TACUARI 84', 'PASEO': 'LATINO PASEO', 'Tucuman': 'LATINO TUCUMAN' } })
  assert.deepEqual(r.porLocal['LATINO TUCUMAN'].meses, { '2026-09': { venta: 63166677 } })
  assert.equal(r.porLocal['LATINO PASEO'].meses['2026-08'].venta, 222626620)
  assert.deepEqual(r.diferencias, [])
  assert.ok(r.sinMapear.some((s) => /TOTALES 2025/.test(s)))
})

test('leerTablas: celdas, celdas combinadas y título fuera de la tabla', async () => {
  const zip = new JSZip()
  const tc = (t) => `<a:tc><a:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></a:txBody></a:tc>`
  zip.file('ppt/presentation.xml', '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>')
  zip.file('ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>')
  zip.file('ppt/slides/slide2.xml', '<p:sld><p:sp><a:p><a:r><a:t>PORTADA</a:t></a:r></a:p></p:sp></p:sld>')
  zip.file('ppt/slides/slide1.xml', '<p:sld><p:sp><a:p><a:r><a:t>HISTÓRICO &amp; </a:t></a:r><a:r><a:t>2026</a:t></a:r></a:p></p:sp>' +
    `<a:tbl><a:tr>${tc('PERIODO')}<a:tc gridSpan="2"><a:txBody><a:p><a:r><a:t>2.026</a:t></a:r></a:p></a:txBody></a:tc><a:tc hMerge="1"/></a:tr>` +
    `<a:tr>${tc('ene')}${tc('52.338')}${tc('')}</a:tr></a:tbl></p:sld>`)
  const buf = await zip.generateAsync({ type: 'nodebuffer' })
  const t = await leerTablas(buf)
  assert.equal(t.length, 1)
  assert.equal(t[0].slide, 2) // segunda en el orden de la presentación
  assert.equal(t[0].titulo, 'HISTÓRICO & 2026')
  assert.deepEqual(t[0].filas, [['PERIODO','2.026',''], ['ene','52.338','']])
})

test('una celda con texto que no es número va a sinMapear, no se descarta en silencio', () => {
  const h = interpretarHistorico([['PERIODO', '2.026', 'PERSONAS'], ['ene', '$ 37.005.243', 'N/A'], ['feb', '10', '#DIV/0!'], ['mar', '-', '5']], { anio: 2026 })
  assert.equal(h.meses['2026-01'], undefined)
  assert.ok(h.sinMapear.some((x) => x.includes('fila "ene"') && x.includes('"$ 37.005.243" no es un número')), h.sinMapear.join(' | '))
  assert.equal(h.sinMapear.filter((x) => x.includes('no es un número')).length, 1) // N/A, #DIV/0! y '-' no avisan
  const c = interpretarCanales([['Canal de Venta', 'Importe'], ['Local', '1O0'], ['Rappi', 'N/A'], ['Total', '100']])
  assert.ok(c.sinMapear.some((x) => x.includes('fila "Local" importe: "1O0" no es un número')), c.sinMapear.join(' | '))
  const d = interpretarDelivery([['PERIODO', 'Rappi', 'TICKET'], ['ene', '1.000', 'diez']], { anio: 2026 })
  assert.deepEqual(d.meses['2026-01'], { Rappi: { venta: 1000 } })
  assert.ok(d.sinMapear.some((x) => x.includes('tickets Rappi: "diez"')), d.sinMapear.join(' | '))
})
