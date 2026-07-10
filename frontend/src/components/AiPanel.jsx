import { useState } from 'react'
import { api } from '../lib/api.js'
import { fmtNum } from '../lib/format.js'

const SAMPLE_SIZE = 150

// Bloques de tabla markdown (| col | col |) → <table>, antes del resto de los reemplazos.
function renderTables(text) {
  return text.replace(/((?:^\|.*\|[ \t]*$\n?)+)/gm, (block) => {
    const lines = block.trim().split('\n')
    if (lines.length < 2) return block
    const parseRow = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
    const isSep = (l) => /^[\s|:-]+$/.test(l) && l.includes('-')
    let header = null
    let rows = lines
    if (isSep(lines[1])) {
      header = parseRow(lines[0])
      rows = lines.slice(2)
    }
    const body = rows.map((l) => '<tr>' + parseRow(l).map((c) => `<td>${c}</td>`).join('') + '</tr>').join('')
    const head = header ? '<thead><tr>' + header.map((h) => `<th>${h}</th>`).join('') + '</tr></thead>' : ''
    return `<table>${head}<tbody>${body}</tbody></table>\n`
  })
}

function renderMarkdown(text) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return renderTables(escaped)
    .replace(/^####\s?(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s?(.+)$/gm, '<h4>$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\s*[-•]\s(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]+?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[hupt])/, '<p>') + '</p>'
}

function buildCsv(rows) {
  const sample = rows.slice(0, SAMPLE_SIZE)
  if (!sample.length) return { csv: '', n: 0 }
  const cols = Object.keys(sample[0])
  const csv = [cols.join(','), ...sample.map((r) => cols.map((c) => r[c]).join(','))].join('\n')
  return { csv, n: sample.length }
}

export default function AiPanel({ meta, dataset, filters, agg, rows, prompt, onPromptChange }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [answer, setAnswer] = useState('')

  async function runAi() {
    setError('')
    setAnswer('')
    if (!prompt.trim()) { setError('Escribí una pregunta o elegí una sugerencia.'); return }
    if (!rows.length) { setError('Los filtros no devuelven registros — ajustalos antes de analizar.'); return }

    setLoading(true)
    try {
      const { csv, n } = buildCsv(rows)
      const res = await api.askAi({ prompt, dataset, filtros: filters, agg, csv, rows_sent: n })
      setAnswer(res.text)
    } catch (err) {
      setError(err.message || 'No se pudo completar el análisis IA.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="ai">
      <div className="chips">
        {meta.aiSuggestions.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => onPromptChange(s)}>{s}</button>
        ))}
      </div>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="Escribí tu pregunta sobre la data filtrada…"
      />
      <div className="ai-actions">
        <div className="ai-meta">
          Se enviarán: agregados + muestra de {fmtNum(Math.min(rows.length, SAMPLE_SIZE))} filas ({fmtNum(rows.length)} totales)
        </div>
        <button className="btn-ai" type="button" disabled={loading} onClick={runAi}>
          {loading ? (<><span className="spin" />Analizando…</>) : '✦ Analizar con IA'}
        </button>
      </div>
      {error && <div className="ai-err">{error}</div>}
      {answer && <div className="ai-out" dangerouslySetInnerHTML={{ __html: renderMarkdown(answer) }} />}
    </section>
  )
}
