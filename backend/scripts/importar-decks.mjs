#!/usr/bin/env node
// Importa los decks de "Reporte de Ventas" ya entregados como meses cerrados
// (rv_cierre, origen = 'deck').
//
//   node scripts/importar-decks.mjs --listar <carpeta>     slide, título y primeras filas de cada tabla
//   node scripts/importar-decks.mjs <carpeta>               resumen por cliente, sin escribir nada
//   node scripts/importar-decks.mjs <carpeta> --aplicar [--pisar]
//
// La conexión sale de PGHOST / PGPORT / ANALYTICS_DB / PGUSER_APP / PGPASSWORD_APP
// (no se lee ningún .env). Sin --prod se niega a escribir en prod: si ANALYTICS_DB
// es dcsmart_analytics, si PGPORT es 5433 (el proxy de prod) o si, ya conectado,
// current_database() no es ANALYTICS_DB o es dcsmart_analytics.
// --pisar solo reemplaza meses cargados desde un deck (origen 'deck'); un mes
// cerrado desde el reporte nunca se pisa. El mapa deck → cliente está en
// decks-mapa.json (o --mapa <archivo>).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  leerTablas, interpretarHistorico, interpretarCanales, interpretarCanalesHorizontal,
  interpretarDelivery, interpretarMulti, norm,
} from './decks.js'
import { fmtAR, esApp } from '../../frontend/src/lib/reporteVentas.js'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const valorDe = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }
const carpeta = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--mapa')
const POR = 'importador-decks'
const PROD_DB = 'dcsmart_analytics'
const PROD_PORT = '5433'

if (!carpeta) {
  console.error('Uso: node scripts/importar-decks.mjs [--listar] <carpeta> [--aplicar] [--pisar] [--mapa archivo]')
  process.exit(2)
}

// ---------------------------------------------------------------------------
if (flag('--listar')) {
  const archivos = fs.readdirSync(carpeta).filter((f) => f.toLowerCase().endsWith('.pptx')).sort()
  for (const archivo of archivos) {
    const tablas = await leerTablas(fs.readFileSync(path.join(carpeta, archivo)))
    console.log(`===== ${archivo}  (${tablas.length} tablas de texto)`)
    for (const t of tablas) {
      console.log(` s${t.slide}: ${t.titulo}`)
      t.filas.filter((f) => f.some((c) => c)).slice(0, 3).forEach((f) => console.log(`     | ${f.join(' | ')}`))
    }
  }
  process.exit(0)
}

// ---------------------------------------------------------------------------
const mapa = JSON.parse(fs.readFileSync(valorDe('--mapa') || path.join(AQUI, 'decks-mapa.json'), 'utf8'))
const MES_NOMBRE = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']
const fmt = (n) => (n == null ? '—' : fmtAR(n))

// Arma los meses de un deck. Primero las slides que cargan, después las de
// solo verificar. Un dato que ya vino de otra slide no se pisa: si difiere, va a diferencias.
async function leerDeck(d) {
  const tablas = await leerTablas(fs.readFileSync(path.join(carpeta, d.archivo)))
  const anio = Number(d.mes.slice(0, 4))
  const datos = {} // mes → local → { venta, cubiertos, ordenes, canales, tickets }
  const origen = {} // `${mes}|${local}|${campo}` → slide
  const deliveryApps = {} // `${mes}|${local}` → apps de la tabla de delivery
  const sinMapear = [], diferencias = []

  // El mes del deck tiene que estar en algún título como 'SEPTIEMBRE 2026'.
  const esperado = `${MES_NOMBRE[Number(d.mes.slice(5)) - 1]} ${anio}`
  const titulos = [...new Set(tablas.map((t) => norm(t.titulo).replace(/\s+/g, ' ')))]
  if (!titulos.some((t) => t.replace(/ /g, '').includes(esperado.replace(/ /g, '')))) {
    diferencias.push(`ningún título de slide dice "${esperado}" (mes del mapa ${d.mes})`)
  }

  const poner = (n, verificar, mes, local, campo, valor, sub) => {
    if (valor == null) return false
    // Un deck no trae meses posteriores al suyo: si aparece uno, es un error de lectura.
    if (mes > d.mes) { diferencias.push(`s${n}: ${local} ${mes} ${sub ? `${campo} ${sub}` : campo} ${fmt(valor)} es posterior al mes del deck (${d.mes}), no se carga`); return false }
    if (!d.locales.includes(local)) { sinMapear.push(`s${n}: local ${local} no está en el cliente`); return false }
    const clave = `${mes}|${local}|${campo}${sub ? ':' + sub : ''}`
    const loc = ((datos[mes] ||= {})[local] ||= {})
    const actual = sub ? loc[campo]?.[sub] : loc[campo]
    if (actual != null) {
      if (Math.abs(actual - valor) > 1) diferencias.push(`${local} ${mes} ${sub ? `${campo} ${sub}` : campo}: s${origen[clave]} dice ${fmt(actual)}, s${n} dice ${fmt(valor)} (queda ${fmt(actual)})`)
      return true // el dato ya está (de otra slide)
    }
    if (verificar) { sinMapear.push(`s${n}: ${local} ${mes} ${sub ? `${campo} ${sub}` : campo} ${fmt(valor)} solo está en una slide de verificación, no se carga`); return false }
    if (sub) (loc[campo] ||= {})[sub] = valor
    else loc[campo] = valor
    origen[clave] = n
    return true
  }

  const slides = [...d.slides.filter((s) => !s.verificar), ...d.slides.filter((s) => s.verificar)]
  for (const s of slides) {
    const deSlide = tablas.filter((t) => t.slide === s.n)
    const t = deSlide[s.tabla || 0]
    if (!t) { diferencias.push(`s${s.n}: no hay tabla`); continue }
    const v = !!s.verificar
    let r
    if (s.tipo === 'historico') {
      r = interpretarHistorico(t.filas, { anio })
      for (const [m, x] of Object.entries(r.meses)) for (const [campo, val] of Object.entries(x)) poner(s.n, v, m, s.local, campo, val)
      for (const [m, x] of Object.entries(r.anterior)) poner(s.n, v, m, s.local, 'venta', x.venta)
    } else if (s.tipo === 'multi') {
      r = interpretarMulti(t.filas, { anio, columnas: s.columnas })
      for (const [local, { meses }] of Object.entries(r.porLocal)) {
        for (const [m, x] of Object.entries(meses)) for (const [campo, val] of Object.entries(x)) poner(s.n, v, m, local, campo, val)
      }
    } else if (s.tipo === 'canales') {
      r = s.formato === 'horizontal' ? interpretarCanalesHorizontal(t.filas) : interpretarCanales(t.filas)
      poner(s.n, v, d.mes, s.local, 'venta', r.total)
      for (const [canal, val] of Object.entries(r.canales)) poner(s.n, v, d.mes, s.local, 'canales', val, canal)
    } else if (s.tipo === 'consolidado') {
      r = interpretarCanales(t.filas)
      const cols = Object.fromEntries(Object.entries(s.columnas).map(([k, l]) => [norm(k), l]))
      for (const [fila, val] of Object.entries(r.canales)) {
        const local = cols[norm(fila)]
        if (!local) { sinMapear.push(`s${s.n}: fila "${fila}" ${fmt(val)} sin local`); continue }
        poner(s.n, v, d.mes, local, 'venta', val)
      }
    } else if (s.tipo === 'delivery') {
      r = interpretarDelivery(t.filas, { anio })
      for (const [m, apps] of Object.entries(r.meses)) {
        for (const [app, x] of Object.entries(apps)) {
          if (poner(s.n, v, m, s.local, 'canales', x.venta, app)) (deliveryApps[`${m}|${s.local}`] ||= new Set()).add(app)
          poner(s.n, v, m, s.local, 'tickets', x.tickets, app)
        }
      }
    } else { diferencias.push(`s${s.n}: tipo desconocido ${s.tipo}`); continue }
    r.sinMapear.forEach((x) => sinMapear.push(`s${s.n}: ${x}`))
    r.diferencias.forEach((x) => diferencias.push(`s${s.n}: ${x}`))
  }

  // Qué canales son delivery en cada mes (la hoja de delivery del mes cerrado sale
  // de acá): las apps de la tabla de delivery y los canales que son apps conocidas.
  for (const [mes, locs] of Object.entries(datos)) {
    for (const [local, loc] of Object.entries(locs)) {
      if (!loc.canales) continue
      const deTabla = deliveryApps[`${mes}|${local}`] || new Set()
      loc.delivery = Object.keys(loc.canales).filter((c) => c !== 'Local' && (deTabla.has(c) || esApp(c)))
    }
  }

  // Slides con tablas que el mapa no usa: se avisan.
  const usadas = new Set(d.slides.map((s) => s.n))
  for (const t of tablas) if (!usadas.has(t.slide)) sinMapear.push(`s${t.slide}: slide con tabla sin usar ("${t.titulo}")${d.omitidas?.[t.slide] ? ` — ${d.omitidas[t.slide]}` : ''}`)
  return { datos, sinMapear: [...new Set(sinMapear)], diferencias }
}

const resultados = []
for (const d of mapa) resultados.push({ d, ...(await leerDeck(d)) })

// ---------------------------------------------------------------------------
// Resumen
for (const { d, datos, sinMapear, diferencias } of resultados) {
  console.log(`\n================ ${d.cliente}  [${d.grupo}]  deck ${d.mes}  (${d.archivo})`)
  console.log(`locales: ${d.locales.join(', ')}`)
  const meses = Object.keys(datos).sort()
  console.log(`meses: ${meses.length} (${meses[0]} … ${meses[meses.length - 1]})`)
  for (const m of meses) {
    const partes = d.locales.filter((l) => datos[m][l]).map((l) => {
      const x = datos[m][l]
      const extra = [x.cubiertos != null && `cub ${fmt(x.cubiertos)}`, x.ordenes != null && `ord ${fmt(x.ordenes)}`].filter(Boolean).join(' ')
      return `${l} ${fmt(x.venta)}${extra ? ` (${extra})` : ''}`
    })
    console.log(`  ${m}  ${partes.join(' | ')}`)
    for (const l of d.locales) {
      const x = datos[m][l]
      if (x?.canales) console.log(`           canales ${l}: ${Object.entries(x.canales).map(([k, v]) => `${k} ${fmt(v)}`).join(', ')}`)
      if (x?.tickets) console.log(`           tickets ${l}: ${Object.entries(x.tickets).map(([k, v]) => `${k} ${fmt(v)}`).join(', ')}`)
      if (x?.delivery?.length) console.log(`           delivery ${l}: ${x.delivery.join(', ')}`)
    }
  }
  console.log(`sinMapear (${sinMapear.length}):`)
  sinMapear.forEach((s) => console.log(`  - ${s}`))
  console.log(`diferencias (${diferencias.length}):`)
  diferencias.forEach((s) => console.log(`  ! ${s}`))
}

if (!flag('--aplicar')) {
  console.log('\n(sin --aplicar: no se escribió nada)')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Escritura
const db = process.env.ANALYTICS_DB
if (!db) { console.error('Falta ANALYTICS_DB: no se escribe sin decir en qué base.'); process.exit(2) }
const esProd = flag('--prod')
if (db === PROD_DB && !esProd) { console.error(`ANALYTICS_DB=${PROD_DB} es PROD: no se escribe sin --prod.`); process.exit(2) }
if (String(process.env.PGPORT ?? '') === PROD_PORT && !esProd) { console.error(`PGPORT=${PROD_PORT} es el proxy de PROD: no se escribe sin --prod.`); process.exit(2) }
const { default: pg } = await import('pg')
const cfg = { host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432), database: db, user: process.env.PGUSER_APP, password: process.env.PGPASSWORD_APP }
console.log(`\nDestino: ${cfg.host}:${cfg.port}/${cfg.database} (usuario ${cfg.user})`)
const client = new pg.Client(cfg)
await client.connect()
// La base a la que de verdad se conectó, no la que dice la variable.
const real = (await client.query('SELECT current_database() AS d')).rows[0].d
if (real !== db || (real === PROD_DB && !esProd)) {
  console.error(`Conectado a "${real}" (ANALYTICS_DB=${db}): no se escribe${real === PROD_DB ? ' en PROD sin --prod' : ''}.`)
  await client.end()
  process.exit(2)
}
const pisar = flag('--pisar')
try {
  for (const { d, datos } of resultados) {
    await client.query('BEGIN')
    try {
      await client.query(
        `INSERT INTO rv_cliente (grupo, nombre, locales, creado_por) VALUES ($1,$2,$3,$4)
         ON CONFLICT (grupo, nombre) DO NOTHING`, [d.grupo, d.cliente, d.locales, POR])
      const cli = (await client.query('SELECT id, locales FROM rv_cliente WHERE grupo = $1 AND nombre = $2', [d.grupo, d.cliente])).rows[0]
      const faltan = d.locales.filter((l) => !cli.locales.includes(l))
      if (faltan.length) console.log(`  aviso: el cliente ${d.cliente} ya existía sin los locales ${faltan.join(', ')}`)
      const n = { nuevos: 0, pisados: 0, salteados: 0 }
      for (const mes of Object.keys(datos).sort()) {
        const snapshot = { locales: datos[mes] }
        const previo = (await client.query('SELECT cerrado, origen FROM rv_cierre WHERE cliente_id = $1 AND mes = $2 FOR UPDATE', [cli.id, mes])).rows[0]
        if (previo && (!pisar || previo.origen !== 'deck')) {
          n.salteados++
          console.log(`  ${d.cliente} ${mes}: ya existe (${previo.cerrado ? 'cerrado' : 'abierto'}, ${previo.origen}), no se pisa${pisar ? ' (--pisar solo reemplaza meses de deck)' : ''}`)
          continue
        }
        // El WHERE repite el candado: un mes cerrado desde el reporte nunca se pisa.
        const { rowCount } = await client.query(
          `INSERT INTO rv_cierre (cliente_id, mes, origen, snapshot, cerrado, cerrado_por, cerrado_at)
           VALUES ($1, $2, 'deck', $3, true, $4, now())
           ON CONFLICT (cliente_id, mes) DO UPDATE
             SET snapshot_anterior = rv_cierre.snapshot, snapshot = EXCLUDED.snapshot, cerrado = true,
                 cerrado_por = EXCLUDED.cerrado_por, cerrado_at = now()
           WHERE rv_cierre.origen = 'deck'`,
          [cli.id, mes, JSON.stringify(snapshot), POR])
        if (!rowCount) { n.salteados++; continue }
        if (previo) n.pisados++; else n.nuevos++
      }
      await client.query('COMMIT')
      console.log(`  ${d.cliente} (id ${cli.id}): ${n.nuevos} meses nuevos, ${n.pisados} pisados, ${n.salteados} salteados`)
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }
  }
} finally {
  await client.end()
}
