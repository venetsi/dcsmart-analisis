// Inflación mensual de Argentina para el Reporte de Ventas: la variación del IPC
// nivel general nacional de INDEC, tomada de la API de series de datos.gob.ar.
// Se guarda en rv_ipc; lo cargado a mano (fuente 'mano') nunca se pisa.
import { variacionesIpc } from './reporteVentas.js'

export const SERIE_IPC = '148.3_INIVELNAL_DICI_M_26'
const URL_IPC = 'https://apis.datos.gob.ar/series/api/series/'
const ESPERA_MS = 6 * 60 * 60 * 1000 // entre consultas a INDEC cuando falta algún mes

// db: pool de pg; pedir(url) → JSON (inyectable para tests); log: fastify.log.
export function crearIpc ({ db, pedir = pedirJson, log, ahora = () => Date.now() }) {
  let ultimoIntento = 0

  // Trae de INDEC los meses desde `desde` (YYYY-MM) y guarda los que no están.
  async function actualizar (desde) {
    ultimoIntento = ahora()
    const [y, m] = desde.split('-').map(Number)
    const base = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
    const url = `${URL_IPC}?ids=${SERIE_IPC}&start_date=${base}-01&format=json&limit=1000`
    const json = await pedir(url)
    const vars = variacionesIpc(json?.data)
    for (const [mes, variacion] of Object.entries(vars)) {
      await db.query(
        `INSERT INTO rv_ipc (mes, variacion, fuente, actualizado_por) VALUES ($1, $2, 'indec', 'INDEC')
         ON CONFLICT (mes) DO UPDATE SET variacion = EXCLUDED.variacion, actualizado_at = now()
          WHERE rv_ipc.fuente = 'indec' AND rv_ipc.variacion <> EXCLUDED.variacion`, [mes, variacion])
    }
  }

  // { 'YYYY-MM': { variacion, fuente, por, at } } entre `desde` y `hasta`. Si falta
  // algún mes ya terminado, consulta INDEC (como mucho cada 6 horas); si INDEC no
  // responde, devuelve lo que hay y el mes queda como falta.
  async function leer (desde, hasta, hoy = new Date()) {
    const consultar = async () => (await db.query(
      `SELECT mes, variacion, fuente, actualizado_por, actualizado_at FROM rv_ipc
        WHERE mes >= $1 AND mes <= $2 ORDER BY mes`, [desde, hasta])).rows
    let filas = await consultar()
    const terminados = mesesEntre(desde, hasta).filter((x) => x < hoy.toISOString().slice(0, 7))
    const faltan = terminados.filter((x) => !filas.some((f) => f.mes === x))
    if (faltan.length && ahora() - ultimoIntento > ESPERA_MS) {
      try {
        await actualizar(faltan[0])
        filas = await consultar()
      } catch (err) {
        log?.warn({ err }, 'reporte-ventas: no se pudo consultar el IPC de INDEC')
      }
    }
    return Object.fromEntries(filas.map((f) => [f.mes, {
      variacion: Number(f.variacion), fuente: f.fuente, por: f.actualizado_por, at: f.actualizado_at,
    }]))
  }

  return { leer, actualizar }
}

export function mesesEntre (desde, hasta) {
  const out = []
  let [y, m] = desde.split('-').map(Number)
  for (;;) {
    const mes = `${y}-${String(m).padStart(2, '0')}`
    if (mes > hasta) return out
    out.push(mes)
    if (++m > 12) { m = 1; y++ }
  }
}

async function pedirJson (url) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 5000)
  try {
    const r = await fetch(url, { signal: ctl.signal })
    if (!r.ok) throw new Error(`INDEC respondió ${r.status}`)
    return await r.json()
  } finally { clearTimeout(t) }
}
