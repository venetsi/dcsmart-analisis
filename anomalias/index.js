// ============================================================
// dcsmart-anomalias — Cloud Run Job
// Control quincenal de datos de pagos y cajas: busca errores de carga y
// valores fuera de lo normal y le manda un mail a la dirección.
// Disparado por Cloud Scheduler los días 3 y 18 a las 8:00 (Argentina):
// revisa la quincena que cerró dos días antes (1-15 o 16-fin de mes).
// Solo LEE BigQuery (dcsmart_analytics_cdc); no toca la base de producción.
//
// Modo seco por defecto: arma el mail y lo imprime. Para guardar y mandar:
//   ANOMALIAS_GUARDAR=1      guarda los hallazgos en dcsmart_anomalias.hallazgos
//   ANOMALIAS_ENVIAR_REAL=1  manda el mail a ANOMALIAS_DESTINO (separados por coma)
// Otras variables:
//   ANOMALIAS_DESDE / ANOMALIAS_HASTA  otra ventana (AAAA-MM-DD), para reprocesar
//   ANOMALIAS_SALIDA                   archivo donde dejar el HTML del mail (modo seco)
// ============================================================
import { BigQuery } from '@google-cloud/bigquery'
import { writeFileSync } from 'node:fs'
import crypto from 'node:crypto'
import { correr } from './lib/motor.js'
import { armarMail } from './lib/mail.js'
import { resumir } from './lib/hallazgos.js'
import { enviarMail } from './lib/envio.js'
import { hoyEnArgentina, quincenaAnterior, quincena, fechaCorta } from './lib/fechas.js'

const {
  BQ_PROJECT = 'dc-smart-mvp',
  BQ_DATASET_CDC = 'dcsmart_analytics_cdc',
  BQ_DATASET_ANOMALIAS = 'dcsmart_anomalias',
  ANOMALIAS_DESDE, ANOMALIAS_HASTA, ANOMALIAS_SALIDA,
  ANOMALIAS_GUARDAR, ANOMALIAS_ENVIAR_REAL, ANOMALIAS_DESTINO = '',
  ENVIALOSIMPLE_API_KEY, ANOMALIAS_FROM = 'dc-reporter@dcsmart.app',
} = process.env

function ventanaDeLaCorrida () {
  if (ANOMALIAS_DESDE && ANOMALIAS_HASTA) {
    const [a, m, d] = ANOMALIAS_DESDE.split('-').map(Number)
    const q = (d === 1 || d === 16) ? quincena(a, m, d) : null
    if (q && q.hasta === ANOMALIAS_HASTA) return q
    return { desde: ANOMALIAS_DESDE, hasta: ANOMALIAS_HASTA, nombre: `período del ${fechaCorta(ANOMALIAS_DESDE)} al ${fechaCorta(ANOMALIAS_HASTA)}` }
  }
  return quincenaAnterior(hoyEnArgentina())
}

async function guardar (bq, corridaId, ventana, hallazgos) {
  if (!hallazgos.length) return
  const corridaAt = new Date().toISOString()
  const filas = hallazgos.map((h) => ({
    corrida_id: corridaId, corrida_at: corridaAt, desde: ventana.desde, hasta: ventana.hasta, ...h,
  }))
  // de a 500 filas: el límite de una inserción es holgado, pero una
  // migración puede generar muchos hallazgos de golpe
  for (let i = 0; i < filas.length; i += 500) {
    await bq.dataset(BQ_DATASET_ANOMALIAS).table('hallazgos').insert(filas.slice(i, i + 500))
  }
}

async function main () {
  const bq = new BigQuery({ projectId: BQ_PROJECT })
  const corridaId = crypto.randomUUID()
  const ventana = ventanaDeLaCorrida()
  const enviar = ANOMALIAS_ENVIAR_REAL === '1'
  const guardarEnTabla = ANOMALIAS_GUARDAR === '1'
  console.log(`[anomalias] corrida=${corridaId} ventana=${ventana.desde}..${ventana.hasta} guardar=${guardarEnTabla} enviar=${enviar}`)

  const hallazgos = await correr({ bq, desde: ventana.desde, hasta: ventana.hasta, cdc: BQ_DATASET_CDC })
  const r = resumir(hallazgos)
  console.log(`[anomalias] ${r.total} hallazgos · alta=${r.porSeveridad.alta} media=${r.porSeveridad.media} baja=${r.porSeveridad.baja}`)
  for (const [regla, n] of Object.entries(r.porRegla)) console.log(`  ${regla}: ${n}`)

  if (guardarEnTabla) await guardar(bq, corridaId, ventana, hallazgos)
  const mail = armarMail({ hallazgos, ventana, corridaId: guardarEnTabla ? corridaId : null })

  if (!enviar) {
    console.log(`[anomalias] MODO SECO: el mail no se manda.\nAsunto: ${mail.asunto}\n\n${mail.texto}`)
    if (ANOMALIAS_SALIDA) writeFileSync(ANOMALIAS_SALIDA, mail.html)
    return
  }
  const to = ANOMALIAS_DESTINO.split(',').map((s) => s.trim()).filter(Boolean)
  await enviarMail({
    apiKey: ENVIALOSIMPLE_API_KEY, from: { email: ANOMALIAS_FROM, name: 'DCSMART' },
    to, subject: mail.asunto, html: mail.html, text: mail.texto,
  })
  console.log(`[anomalias] mail enviado a ${to.length} destinatario(s)`)
}

main().catch((err) => { console.error('[anomalias] error:', err.message); process.exit(1) })
