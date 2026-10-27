// Corre todas las reglas y series sobre una ventana y devuelve los hallazgos
// ordenados. Solo LEE BigQuery; guardar y mandar el mail lo decide index.js.
// El backtest usa esta misma función, así que lo que mide es lo que corre.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { BigQuery } from '@google-cloud/bigquery'
import { normalizar, ordenar } from './hallazgos.js'
import { evaluarVentas, evaluarEgresos, evaluarCargas } from './estadistica.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

// Los nombres de dataset no pueden ir como parámetro de BigQuery: se
// reemplazan en el texto. Solo vienen de la configuración, nunca del usuario.
function leerSql (carpeta, archivo, cdc) {
  return readFileSync(join(RAIZ, carpeta, archivo), 'utf8').replaceAll('{{cdc}}', cdc)
}

export function listarReglas () {
  return readdirSync(join(RAIZ, 'reglas')).filter((f) => f.endsWith('.sql')).sort()
}

const plano = (v) => (v != null && typeof v === 'object' && 'value' in v ? v.value : v)
const num = (v) => (v == null ? null : Number(plano(v)))

export async function correr ({ bq, desde, hasta, cdc = 'dcsmart_analytics_cdc', soloReglas = null }) {
  // Con un texto y `types: DATE` la librería manda el parámetro en NULL sin
  // avisar (todas las reglas daban 0 filas): hay que pasar BigQuery.date().
  const params = { desde: BigQuery.date(desde), hasta: BigQuery.date(hasta) }
  const consultar = async (carpeta, archivo) => {
    const [filas] = await bq.query({ query: leerSql(carpeta, archivo, cdc), params })
    return filas
  }

  const reglas = listarReglas().filter((f) => !soloReglas || soloReglas.includes(f.replace('.sql', '')))
  const [deReglas, ventas, egresos, cargas] = await Promise.all([
    Promise.all(reglas.map((f) => consultar('reglas', f).catch((e) => {
      throw new Error(`La regla ${f} falló: ${e.message}`)
    }))),
    consultar('series', 'ventas_diarias.sql'),
    consultar('series', 'egresos_quincenales.sql'),
    consultar('series', 'cargas_diarias.sql'),
  ])

  const hallazgos = deReglas.flat().map(normalizar)
  if (!soloReglas) {
    hallazgos.push(
      ...evaluarVentas(ventas.map((f) => ({ ...f, dia: plano(f.dia), total: num(f.total) })), { desde, hasta }),
      ...evaluarEgresos(egresos.map((f) => ({ ...f, quincena: plano(f.quincena), total: num(f.total) })), { desde }),
      ...evaluarCargas(cargas.map((f) => ({ ...f, dia: plano(f.dia), n: num(f.n), viejos: num(f.viejos) })), { desde, hasta }),
    )
  }
  return ordenar(hallazgos)
}
