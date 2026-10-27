// Envío por EnvíaloSimple Transaccional, el mismo servicio que usa gestión
// desde el 16/10 (backend/src/lib/envialoSimple.js del repo dcsmart). Acá es
// un solo mail cada 15 días, así que alcanza con un pedido y sin reintentos:
// si falla, el job termina con error y queda en los logs de Cloud Run.
// La clave NUNCA se loguea ni va en un mensaje de error.

export const URL_ENVIALOSIMPLE_SEND = 'https://api.envialosimple.email/api/v1/mail/send'
export const MAX_DESTINATARIOS = 10

export function armarCuerpo ({ from, to, subject, html, text }) {
  return {
    from: { email: from.email, ...(from.name ? { name: from.name } : {}) },
    to: to.map((email) => ({ email })),
    subject,
    html,
    text,
  }
}

export async function enviarMail ({ apiKey, from, to, subject, html, text, fetchFn = fetch }) {
  if (!apiKey) throw new Error('Falta ENVIALOSIMPLE_API_KEY: sin la clave de EnvíaloSimple no se puede mandar el mail.')
  if (!Array.isArray(to) || to.length < 1 || to.length > MAX_DESTINATARIOS) {
    throw new Error(`El mail lleva entre 1 y ${MAX_DESTINATARIOS} destinatarios (llegaron ${Array.isArray(to) ? to.length : 0}).`)
  }
  const res = await fetchFn(URL_ENVIALOSIMPLE_SEND, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(armarCuerpo({ from, to, subject, html, text })),
  })
  const cuerpo = await res.text().catch(() => '')
  if (!res.ok) {
    const codigo = cuerpo.match(/\b((?:account|domain|from|to|subject|html|text)_[a-z_]+)\b/)?.[1]
    throw new Error(`EnvíaloSimple no aceptó el mail (respuesta ${res.status}${codigo ? `, ${codigo}` : ''}).`)
  }
  return cuerpo
}
