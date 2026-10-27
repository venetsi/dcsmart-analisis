// Backtest en solo lectura: corre el control sobre quincenas pasadas y muestra
// cuántos hallazgos habría tenido cada mail, por regla. Sirve para calibrar
// los umbrales (objetivo: decenas por quincena, no cientos) y para comprobar
// que encuentra incidentes que ya conocemos.
//
//   node backtest.js 2025-04-01 2026-10-15            tabla por quincena
//   node backtest.js 2025-04-01 2026-10-15 salida.json  además, todos los hallazgos
import { BigQuery } from '@google-cloud/bigquery'
import { writeFileSync } from 'node:fs'
import { correr } from './lib/motor.js'
import { resumir, REGLAS } from './lib/hallazgos.js'
import { quincenasEntre } from './lib/fechas.js'

const [desde = '2025-04-01', hasta = '2026-10-15', salida] = process.argv.slice(2)
const bq = new BigQuery({ projectId: process.env.BQ_PROJECT || 'dc-smart-mvp' })
const quincenas = quincenasEntre(desde, hasta)
const todos = []
const filas = []

// de a 3 quincenas a la vez, para no saturar la cuota de consultas
for (let i = 0; i < quincenas.length; i += 3) {
  const tanda = quincenas.slice(i, i + 3)
  const resultados = await Promise.all(tanda.map((q) => correr({ bq, desde: q.desde, hasta: q.hasta })))
  tanda.forEach((q, j) => {
    const r = resumir(resultados[j])
    filas.push({ quincena: q.desde, ...r })
    todos.push(...resultados[j].map((h) => ({ quincena: q.desde, ...h })))
    console.error(`${q.desde}: ${r.total}`)
  })
}

const reglas = Object.keys(REGLAS)
const corto = (r) => r.replace(/^(pago|caja)_/, '').slice(0, 12)
console.log(['quincena  ', 'total', 'alta', 'media', 'baja', ...reglas.map(corto)].join('\t'))
for (const f of filas) {
  console.log([f.quincena, f.total, f.porSeveridad.alta, f.porSeveridad.media, f.porSeveridad.baja,
    ...reglas.map((r) => f.porRegla[r] ?? 0)].join('\t'))
}
const totales = filas.map((f) => f.total).sort((a, b) => a - b)
console.log(`\nquincenas: ${filas.length} · hallazgos por quincena: mínimo ${totales[0]}, mediana ${totales[Math.floor(totales.length / 2)]}, máximo ${totales[totales.length - 1]}`)
if (salida) writeFileSync(salida, JSON.stringify(todos, null, 2))
