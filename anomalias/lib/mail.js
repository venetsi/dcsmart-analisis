// Arma el mail quincenal: asunto, HTML (estilos en línea, como piden los
// clientes de correo) y texto plano. Las cifras van tal cual vienen de las
// consultas; lo único calculado es "Habitual", la mediana del histórico.
import { REGLAS, ordenar, resumir } from './hallazgos.js'
import { fechaCorta } from './fechas.js'

const COLOR = { alta: '#b42318', media: '#b54708', baja: '#475467' }
const FONDO = { alta: '#fef3f2', media: '#fffaeb', baja: '#f2f4f7' }
const NOMBRE_SEVERIDAD = { alta: 'Revisar ya', media: 'Revisar', baja: 'Para tener en cuenta' }

const fmtPesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const fmtNumero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

export function formatearValor (v, unidad) {
  if (v == null || unidad == null) return ''
  return unidad === 'pesos' ? fmtPesos.format(v) : fmtNumero.format(v)
}

function esc (s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

// Agrupa los hallazgos ya ordenados en secciones (severidad + regla), en orden.
export function secciones (hallazgos) {
  const out = []
  for (const h of ordenar(hallazgos)) {
    const ultima = out[out.length - 1]
    if (ultima && ultima.severidad === h.severidad && ultima.regla === h.regla) ultima.filas.push(h)
    else out.push({ severidad: h.severidad, regla: h.regla, filas: [h] })
  }
  return out
}

function lugar (h) {
  if (h.local && h.grupo && h.local !== h.grupo) return `${h.local} (${h.grupo})`
  return h.local ?? h.grupo ?? 'sin local'
}

export function armarMail ({ hallazgos, ventana, maxPorRegla = 25, corridaId = null }) {
  const r = resumir(hallazgos)
  const asunto = r.total
    ? `Control de datos · ${ventana.nombre} · ${r.porSeveridad.alta} para revisar ya, ${r.total} en total`
    : `Control de datos · ${ventana.nombre} · sin hallazgos`
  const secs = secciones(hallazgos)

  const td = 'padding:6px 8px;border-bottom:1px solid #eaecf0;vertical-align:top;font-size:13px;'
  const th = 'padding:6px 8px;border-bottom:2px solid #d0d5dd;text-align:left;font-size:12px;color:#475467;font-weight:600;'
  const num = 'text-align:right;white-space:nowrap;'

  const html = []
  html.push('<div style="font-family:Segoe UI,Arial,sans-serif;color:#101828;max-width:860px;">')
  html.push(`<h1 style="font-size:20px;margin:0 0 4px;">Control de datos de pagos y cajas</h1>`)
  html.push(`<p style="margin:0 0 16px;color:#475467;font-size:14px;">${esc(ventana.nombre)} (del ${fechaCorta(ventana.desde)} al ${fechaCorta(ventana.hasta)})</p>`)
  if (!r.total) {
    html.push('<p style="font-size:14px;">No se encontró nada fuera de lo normal en la quincena.</p>')
  } else {
    html.push('<table role="presentation" style="border-collapse:separate;border-spacing:8px 0;margin:0 -8px 20px;"><tr>')
    for (const s of ['alta', 'media', 'baja']) {
      html.push(`<td style="background:${FONDO[s]};border-radius:8px;padding:10px 16px;">` +
        `<div style="font-size:22px;font-weight:700;color:${COLOR[s]};">${r.porSeveridad[s]}</div>` +
        `<div style="font-size:12px;color:#475467;">${NOMBRE_SEVERIDAD[s]}</div></td>`)
    }
    html.push('</tr></table>')
  }

  const texto = [`Control de datos de pagos y cajas`, `${ventana.nombre} (del ${fechaCorta(ventana.desde)} al ${fechaCorta(ventana.hasta)})`, '']
  if (!r.total) texto.push('No se encontró nada fuera de lo normal en la quincena.')
  else texto.push(`Revisar ya: ${r.porSeveridad.alta} · Revisar: ${r.porSeveridad.media} · Para tener en cuenta: ${r.porSeveridad.baja}`, '')

  for (const sec of secs) {
    const def = REGLAS[sec.regla] ?? { titulo: sec.regla, explicacion: '', unidad: 'pesos' }
    const filas = sec.filas.slice(0, maxPorRegla)
    const resto = sec.filas.length - filas.length
    const conValor = def.unidad && filas.some((h) => h.valor != null)
    const conHabitual = def.unidad && filas.some((h) => h.esperado != null)
    const conFecha = filas.some((h) => h.fecha)

    html.push(`<h2 style="font-size:16px;margin:24px 0 2px;">` +
      `<span style="display:inline-block;font-size:11px;font-weight:600;color:${COLOR[sec.severidad]};background:${FONDO[sec.severidad]};border-radius:10px;padding:2px 8px;margin-right:8px;vertical-align:2px;">${NOMBRE_SEVERIDAD[sec.severidad]}</span>` +
      `${esc(def.titulo)} <span style="color:#667085;font-weight:400;">(${sec.filas.length})</span></h2>`)
    html.push(`<p style="margin:0 0 8px;color:#475467;font-size:13px;">${esc(def.explicacion)}</p>`)
    html.push('<table style="border-collapse:collapse;width:100%;">')
    html.push(`<tr><th style="${th}">Local</th><th style="${th}">Referencia</th>` +
      (conFecha ? `<th style="${th}">Fecha</th>` : '') +
      (conValor ? `<th style="${th}${num}">${def.unidad === 'pesos' ? 'Importe' : 'Cantidad'}</th>` : '') +
      (conHabitual ? `<th style="${th}${num}">Habitual</th>` : '') +
      `<th style="${th}">Detalle</th></tr>`)
    texto.push(`== ${NOMBRE_SEVERIDAD[sec.severidad]} · ${def.titulo} (${sec.filas.length})`)
    for (const h of filas) {
      html.push(`<tr><td style="${td}">${esc(lugar(h))}</td><td style="${td}">${esc(h.referencia)}</td>` +
        (conFecha ? `<td style="${td}white-space:nowrap;">${fechaCorta(h.fecha)}</td>` : '') +
        (conValor ? `<td style="${td}${num}">${formatearValor(h.valor, def.unidad)}</td>` : '') +
        (conHabitual ? `<td style="${td}${num}color:#475467;">${formatearValor(h.esperado, def.unidad)}</td>` : '') +
        `<td style="${td}">${esc(h.detalle)}</td></tr>`)
      texto.push(`- ${lugar(h)} · ${h.referencia ?? ''}` +
        (h.fecha ? ` · ${fechaCorta(h.fecha)}` : '') +
        (conValor && h.valor != null ? ` · ${formatearValor(h.valor, def.unidad)}` : '') +
        (conHabitual && h.esperado != null ? ` (habitual ${formatearValor(h.esperado, def.unidad)})` : '') +
        (h.detalle ? ` · ${h.detalle}` : ''))
    }
    html.push('</table>')
    if (resto > 0) {
      html.push(`<p style="margin:6px 0 0;color:#667085;font-size:12px;">Y ${resto} más en la tabla de hallazgos.</p>`)
      texto.push(`  y ${resto} más en la tabla de hallazgos`)
    }
    texto.push('')
  }

  const pie = 'Lo generó el control automático de datos (job dcsmart-anomalias) leyendo BigQuery. ' +
    'Las cifras son las de gestión; "Habitual" es la mediana del histórico.' +
    (corridaId ? ` Corrida ${corridaId}: todos los hallazgos están en dcsmart_anomalias.hallazgos.` : '')
  html.push(`<p style="margin:28px 0 0;color:#667085;font-size:12px;border-top:1px solid #eaecf0;padding-top:12px;">${esc(pie)}</p>`)
  html.push('</div>')
  texto.push(pie)

  return { asunto, html: html.join('\n'), texto: texto.join('\n') }
}
