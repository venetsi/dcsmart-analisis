import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import { api } from '../lib/api.js'
import { fmtMoney, fmtNum } from '../lib/format.js'
import { buildPyl, waterfallSteps } from '../lib/pyl.js'
import { useGroup } from '../context/GroupContext.jsx'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const DONUT_COLORS = ['#6BA6E0', '#C9B086', '#B5A7EA', '#4CAF7D', '#D4952A', '#E1CBA0']

function prevMonth() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 7)
}

function Semaforo({ label, value, unit, buenoMax, maloMin, sub }) {
  const color = value == null ? 'var(--txt2)'
    : value <= buenoMax ? 'var(--ok)' : value >= maloMin ? 'var(--bad)' : 'var(--warn)'
  return (
    <div className="dash-kpi">
      <div className="dk-glow" style={{ background: color }} />
      <div className="dk-label">{label}</div>
      <div className="dk-value" style={{ color }}>{value == null ? '—' : `${value}${unit}`}</div>
      <div className="dk-sub">{sub}</div>
    </div>
  )
}

export default function PyLPage() {
  const { grupo } = useGroup()
  const [searchParams, setSearchParams] = useSearchParams()
  const [locales, setLocales] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const mes = searchParams.get('mes') || prevMonth()
  const local = searchParams.get('local') || ''

  useEffect(() => {
    api.getDatasetOptions('pagos', { grupo })
      .then((o) => setLocales(o.local || []))
      .catch(() => setLocales([]))
  }, [grupo])

  const load = useCallback(() => {
    setLoading(true); setError('')
    api.getPyl({ mes, grupo, local: local || undefined })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [mes, grupo, local])

  useEffect(() => { load() }, [load])

  function setParam(k, v) {
    const next = new URLSearchParams(searchParams)
    if (v) next.set(k, v); else next.delete(k)
    setSearchParams(next)
  }

  const pyl = useMemo(() => (data ? buildPyl(data) : null), [data])

  const waterfall = useMemo(() => {
    if (!pyl) return null
    const steps = waterfallSteps(pyl)
    let running = 0
    const ranges = [], colors = []
    for (const s of steps) {
      if (s.tipo === 'ingreso') { ranges.push([0, s.valor]); running = s.valor; colors.push('#6BA6E0') }
      else if (s.tipo === 'subtotal') { ranges.push([0, running]); colors.push('#E1CBA0') }
      else if (s.tipo === 'resultado') { ranges.push([0, running]); colors.push(running >= 0 ? '#4CAF7D' : '#E05C5C') }
      else { const nr = running + s.valor; ranges.push([nr, running]); running = nr; colors.push('#C9B086') }
    }
    return { labels: steps.map(s => s.label), ranges, colors }
  }, [pyl])

  const t = pyl?.totales
  const money = (x) => fmtMoney(x)

  return (
    <div className="pyl">
      <div className="page-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>Estado de Resultados (P&amp;L) <small style={{ color: 'var(--beige)', fontWeight: 400, fontSize: 13 }}>· {grupo}{local ? ` · ${local}` : ' · consolidado'}</small></h2>
          <p>Período {mes} · Ingresos de caja vs. egresos por rubro, con apertura fiscal / efectivo.</p>
        </div>
        <div className="pyl-actions pyl-noprint">
          <button className="btn-pdf" type="button" onClick={() => window.print()}>Exportar / Imprimir PDF</button>
        </div>
      </div>

      <section className="filters pyl-noprint">
        <div className="fg" style={{ maxWidth: 160 }}>
          <label>Mes</label>
          <input type="month" value={mes} onChange={(e) => setParam('mes', e.target.value)} />
        </div>
        <div className="fg" style={{ maxWidth: 220 }}>
          <label>Local</label>
          <select value={local} onChange={(e) => setParam('local', e.target.value)}>
            <option value="">Consolidado (todo el grupo)</option>
            {locales.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="match">{loading ? 'Calculando…' : (data ? `${fmtNum(data.gastos.length)} líneas de gasto` : '')}</div>
      </section>

      {error && <p className="login-err">{error}</p>}

      {pyl && (
        <>
          <section className="dash-kpis">
            <div className="dash-kpi ventas">
              <div className="dk-glow" />
              <div className="dk-label">Ventas del mes</div>
              <div className="dk-value">{money(t.ventas)}</div>
              <div className="dk-sub">{fmtNum(pyl.ventas.tickets)} tickets · {fmtNum(pyl.ventas.comensales)} cub.</div>
            </div>
            <div className="dash-kpi">
              <div className="dk-glow" style={{ background: t.resultadoEconomico >= 0 ? '#4CAF7D' : '#E05C5C' }} />
              <div className="dk-label">Resultado económico</div>
              <div className="dk-value" style={{ color: t.resultadoEconomico >= 0 ? '#4CAF7D' : '#E05C5C' }}>{money(t.resultadoEconomico)}</div>
              <div className="dk-sub">{t.margenPct}% sobre ventas</div>
            </div>
            <Semaforo label="Food cost (CMV)" value={t.foodCostPct} unit="%" buenoMax={35} maloMin={42} sub="objetivo 28–35%" />
            <Semaforo label="Prime cost" value={t.primeCostPct} unit="%" buenoMax={60} maloMin={68} sub="CMV + sueldos · obj. <65%" />
          </section>

          <section className="pyl-grid pyl-noprint">
            <div className="pyl-card">
              <h4>Puente de resultado (waterfall)</h4>
              <div className="wrap">
                {waterfall && (
                  <Bar
                    data={{ labels: waterfall.labels, datasets: [{ data: waterfall.ranges, backgroundColor: waterfall.colors, borderRadius: 4 }] }}
                    options={{
                      responsive: true, maintainAspectRatio: false, animation: false,
                      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(Math.abs(c.raw[1] - c.raw[0])) } } },
                      scales: {
                        x: { ticks: { color: 'rgba(240,237,232,0.55)', font: { size: 9.5 }, maxRotation: 40, minRotation: 40 }, grid: { display: false } },
                        y: { ticks: { color: 'rgba(240,237,232,0.55)', font: { size: 10 }, callback: (v) => '$' + (v / 1e6).toFixed(1) + 'M' }, grid: { color: 'rgba(255,255,255,0.08)' } }
                      }
                    }}
                  />
                )}
              </div>
            </div>
            <div className="pyl-card">
              <h4>Composición del CMV</h4>
              <div className="wrap sm">
                {pyl.secciones.find(s => s.cmv)
                  ? <Doughnut
                    data={{
                      labels: pyl.secciones.find(s => s.cmv).lineas.slice(0, 6).map(l => l.categoria),
                      datasets: [{ data: pyl.secciones.find(s => s.cmv).lineas.slice(0, 6).map(l => l.total), backgroundColor: DONUT_COLORS, borderColor: '#19232f', borderWidth: 2 }]
                    }}
                    options={{ responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'right', labels: { color: 'rgba(240,237,232,0.55)', font: { size: 10.5 }, boxWidth: 12 } } } }}
                  />
                  : <div className="empty-state">Sin CMV en el período</div>}
              </div>
            </div>
          </section>

          <section className="tbl-card" style={{ overflowX: 'auto' }}>
            <table className="pyl-table">
              <thead>
                <tr><th>Concepto</th><th>Total</th><th>% s/vtas</th><th>Fiscal</th><th>Efectivo</th></tr>
              </thead>
              <tbody>
                {/* INGRESOS */}
                <tr className="pyl-sec"><td>INGRESOS · Ventas</td><td className="num">{money(t.ventas)}</td><td className="num pyl-pct">100%</td><td className="num">{money(pyl.ventas.fiscal)}</td><td className="num">{money(pyl.ventas.efectivo)}</td></tr>
                {pyl.ventas.por_origen.map((o) => (
                  <tr className="pyl-cat" key={o.origen}><td>{o.origen}</td><td className="num">{money(o.total)}</td><td className="num pyl-pct">{pyl.pct(o.total)}%</td><td className="num">{money(o.fiscal)}</td><td className="num">{money(o.efectivo)}</td></tr>
                ))}

                {/* Secciones operativas + resultados intercalados */}
                {pyl.operativas.map((s) => (
                  <SectionRows key={s.key} s={s} pyl={pyl} money={money}
                    after={s.cmv ? <ResultRow cls="bruto" label="RESULTADO BRUTO" val={t.resultadoBruto} pct={pyl.pct(t.resultadoBruto)} money={money} /> : null} />
                ))}
                <ResultRow cls={`econ ${t.resultadoEconomico >= 0 ? 'pos' : 'neg'}`} label="RESULTADO ECONÓMICO" val={t.resultadoEconomico} pct={t.margenPct} money={money} />

                {/* No operativas (abajo de la línea) */}
                {pyl.noOperativas.map((s) => (
                  <SectionRows key={s.key} s={s} pyl={pyl} money={money} memo />
                ))}
                {pyl.noOperativas.some(s => s.fin) && (
                  <ResultRow cls={`${t.resultadoMes >= 0 ? 'pos' : 'neg'}`} label="RESULTADO DEL MES (post-financiación)" val={t.resultadoMes} pct={pyl.pct(t.resultadoMes)} money={money} />
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}

function SectionRows({ s, pyl, money, memo, after }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr className={`pyl-sec ${memo ? 'pyl-memo' : ''}`}>
        <td className="pyl-toggle" onClick={() => setOpen(o => !o)}>
          <span className="caret">{open ? '▾' : '▸'}</span> {s.titulo}
        </td>
        <td className="num">{money(s.total)}</td>
        <td className="num pyl-pct">{pyl.pct(s.total)}%</td>
        <td className="num">{money(s.fiscal)}</td>
        <td className="num">{money(s.efectivo)}</td>
      </tr>
      {open && s.lineas.map((l, i) => (
        <tr className="pyl-cat" key={l.rubro + l.categoria + i}>
          <td>{l.categoria}{s.cajon ? ` (${l.rubro})` : ''}</td>
          <td className="num">{money(l.total)}</td>
          <td className="num pyl-pct">{pyl.pct(l.total)}%</td>
          <td className="num">{money(l.fiscal)}</td>
          <td className="num">{money(l.efectivo)}</td>
        </tr>
      ))}
      {after}
    </>
  )
}

function ResultRow({ cls, label, val, pct, money }) {
  return (
    <tr className={`pyl-result ${cls}`}>
      <td>{label}</td><td className="num">{money(val)}</td><td className="num pyl-pct">{pct}%</td><td /><td />
    </tr>
  )
}
