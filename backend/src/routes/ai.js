// Proxy IA → Vertex AI (Gemini Flash), nativo de GCP.
// Autenticación por IAM con la cuenta de servicio del Cloud Run (ADC):
// NO hay API key ni secreto — solo el rol roles/aiplatform.user en la SA.
// Recibe prompt + payload (agregados + muestra) ya filtrado por el frontend
// y loguea cada consulta en ai_queries.
import { GoogleAuth } from 'google-auth-library'

const MAX_CSV_BYTES = 60_000
const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' })

export default async function (fastify) {
  const PROJECT = process.env.BQ_PROJECT
  const LOCATION = process.env.VERTEX_LOCATION || 'us-central1'
  const MODEL = process.env.AI_MODEL || 'gemini-2.5-flash' // upgradeable a gemini-3-flash via env

  fastify.post('/', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { prompt, dataset, filtros = {}, agg = {}, csv = '', rows_sent = 0 } = req.body || {}
    if (!prompt || !dataset) return reply.code(400).send({ error: 'prompt y dataset requeridos' })

    const csvTrimmed = String(csv).slice(0, MAX_CSV_BYTES)
    const systemText =
      'Actuás como analista financiero senior de DCSMART, grupo gastronómico con varios locales. ' +
      'Redactá en español profesional y neutro, con trato formal de usted; nunca tutees. ' +
      'Formato: bullets concisos (-); tablas markdown cuando se comparen varios ítems; ' +
      '**negritas** para cifras clave; encabezados #### solo si hay más de una sección. ' +
      'Si la pregunta pide un dato puntual, respondé únicamente el dato, directo y sin introducción. ' +
      'Si la pregunta amerita interpretación, cerrá con una sección "#### Insight" breve, derivada estrictamente de la data provista. ' +
      'Limitate a los datos recibidos: no supongas información que no esté en ellos, no hagas recomendaciones ni sugerencias, ' +
      'y no menciones errores, inconsistencias ni problemas de calidad de la base de datos. ' +
      'Máximo ~400 palabras.'
    const userText =
      `Analizá la siguiente data del dataset "${dataset}" que el usuario filtró en su tablero (montos en ARS).\n\n` +
      `## FILTROS ACTIVOS\n${JSON.stringify(filtros)}\n\n` +
      `## AGREGADOS\n${JSON.stringify(agg)}\n\n` +
      `## MUESTRA (CSV)\n${csvTrimmed}\n\n` +
      `## PREGUNTA\n${prompt}`

    let ok = false, text = '', usage = {}
    try {
      const client = await auth.getClient()
      const { token } = await client.getAccessToken()
      const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}` +
                  `/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          // gemini-2.5-flash "piensa" por defecto y esos tokens consumen maxOutputTokens:
          // sin thinkingBudget=0, el presupuesto se agota razonando y la respuesta llega cortada.
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } }
        })
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error?.message || 'HTTP ' + resp.status)

      text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('')
      const um = data.usageMetadata || {}
      usage = { input_tokens: um.promptTokenCount, output_tokens: um.candidatesTokenCount }
      if (!text) throw new Error(data.candidates?.[0]?.finishReason || 'respuesta vacia del modelo')
      ok = true
    } catch (err) {
      fastify.log.error({ err }, 'Error llamando a Vertex AI (Gemini)')
      return reply.code(502).send({ error: 'No se pudo completar el analisis IA: ' + err.message })
    } finally {
      fastify.analyticsDb.query(
        `INSERT INTO ai_queries (user_id, email, dataset, filtros, prompt, rows_sent, tokens_in, tokens_out, ok)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [req.user.id, req.user.email, dataset, filtros, prompt, rows_sent,
         usage.input_tokens || null, usage.output_tokens || null, ok]
      ).catch(e => fastify.log.error(e))
    }

    return { text, usage, model: MODEL }
  })
}
