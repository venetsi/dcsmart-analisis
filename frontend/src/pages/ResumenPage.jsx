import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { api } from '../lib/api.js'
import { fmtMoney, fmtNum } from '../lib/format.js'
import { useGroup } from '../context/GroupContext.jsx'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

// Paleta de series (acorde al sistema de diseño dark/gold): ventas en azul,
// pagos en dorado, CMV en violeta — coincide con las variantes de .dash-kpi.
const SERIES = [
  { key: 'ventas', label: 'Ventas', color: '#6BA6E0' },
  { key: 'pagos', label: 'Pagos', color: '#C9B086' },
  { key: 'cmv', label: 'CMV', color: '#B5A7EA' }
]

// Etiquetas directas al final de cada línea histórica (refuerzo de identidad, no solo color)
const directLabels = {
  id: 'directLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    ctx.save()
    ctx.font = '600 10.5px Montserrat, sans-serif'
    chart.data.datasets.forEach((ds, i) => {
      if (ds.proy || !ds.label || !chart.isDatasetVisible(i)) return
      const meta = chart.getDatasetMeta(i)
      const last = [...meta.data].reverse().find((p) => p && !isNaN(p.y))
      if (!last) return
      ctx.fillStyle = ds.borderColor
      ctx.fillText(ds.label, last.x + 6, last.y + 3)
    })
    ctx.restore()
  }
}
// NO se registra global (contaminaba otros charts con "undefined"): se pasa
// por-instancia vía plugins={[directLabels]} solo en el gráfico de esta página.

function fmtSemana(iso) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

export default function ResumenPage() {
  const { grupo } = useGroup()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const desde = searchParams.get('desde') || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const hasta = searchParams.get('hasta') || new Date().toISOString().slice(0, 10)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api.getDashboard({ grupo, desde, hasta })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [grupo, desde, hasta])

  useEffect(() => { load() }, [load])

  function setParam(key, value) {
    const next = new URLSearchParams(searchParams)
    next.set(key, value)
    setSearchParams(next)
  }

  const chart = useMemo(() => {
    if (!data) return null
    const hist = data.semanal
    const proy = data.proyeccion.filter((p) => p.ventas !== null)
    const labels = [...hist.map((r) => fmtSemana(r.semana)), ...proy.map((r) => fmtSemana(r.semana))]
    const nH = hist.length

    const histData = (key) => [...hist.map((r) => r[key]), ...proy.map(() => NaN)]
    // la proyección arranca desde el último punto real para que la línea sea continua
    const proyData = (key) => [
      ...hist.map((r, i) => (i === nH - 1 ? r[key] : NaN)),
      ...proy.map((r) => r[key])
    ]

    const datasets = []
    for (const s of SERIES) {
      datasets.push({
        label: s.label, data: histData(s.key), borderColor: s.color,
        backgroundColor: s.color, borderWidth: 2, pointRadius: 2.5, pointHoverRadius: 6,
        tension: 0.3, spanGaps: false
      })
      datasets.push({
        label: `${s.label} (proyección)`, proy: true, data: proyData(s.key),
        borderColor: s.color, backgroundColor: s.color, borderWidth: 2,
        borderDash: [6, 5], pointRadius: 0, pointHoverRadius: 5, tension: 0.3, spanGaps: false
      })
    }
    return { labels, datasets, nH }
  }, [data])

  const k = data?.kpis

  return (
    <div className="dash">
      <div className="page-hdr">
        <h2>Dashboard <small style={{ color: 'var(--beige)', fontWeight: 400, fontSize: 13 }}>· {grupo}</small></h2>
        <p>Pagos por fecha factura · Ventas por fecha inicio · CMV = rubros que comienzan con "CMV". Proyección estacional estimada a 60 días.</p>
      </div>

      <section className="filters dash-filters">
        <div className="fg" style={{ maxWidth: 170 }}>
          <label>Desde</label>
          <input type="date" value={desde} onChange={(e) => setParam('desde', e.target.value)} />
        </div>
        <div className="fg" style={{ maxWidth: 170 }}>
          <label>Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setParam('hasta', e.target.value)} />
        </div>
        <div className="match">{loading ? 'Actualizando…' : `Rango: últimos ${Math.round((Date.parse(hasta) - Date.parse(desde)) / 864e5)} días`}</div>
      </section>

      {error && <p className="login-err">{error}</p>}

      <section className="dash-kpis">
        <div className="dash-kpi ventas">
          <div className="dk-glow" />
          <div className="dk-label">Total de ventas</div>
          <div className="dk-value">{k ? fmtMoney(k.ventas) : '—'}</div>
          <div className="dk-sub">{k ? `${fmtNum(k.n_turnos)} turnos de caja` : ''}</div>
        </div>
        <div className="dash-kpi pagos">
          <div className="dk-glow" />
          <div className="dk-label">Total de pagos</div>
          <div className="dk-value">{k ? fmtMoney(k.pagos) : '—'}</div>
          <div className="dk-sub">{k ? `${fmtNum(k.n_pagos)} egresos registrados` : ''}</div>
        </div>
        <div className="dash-kpi cmv">
          <div className="dk-glow" />
          <div className="dk-label">CMV total</div>
          <div className="dk-value">{k ? fmtMoney(k.cmv) : '—'}</div>
          <div className="dk-sub">{k?.cmv_pct != null ? `${k.cmv_pct}% de las ventas` : 'sin ventas en el rango'}</div>
        </div>
      </section>

      <section className="dash-chart-card">
        <div className="dash-chart-head">
          <h4>Evolución semanal + proyección 60 días</h4>
          <span className="dash-chip">— histórico &nbsp;· ··· proyección estacional</span>
        </div>
        <div className="dash-chart-wrap">
          {chart && (
            <Line
              plugins={[directLabels]}
              data={{ labels: chart.labels, datasets: chart.datasets }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { mode: 'index', intersect: false },
                layout: { padding: { right: 64 } },
                plugins: {
                  legend: {
                    position: 'top', align: 'end',
                    labels: {
                      color: 'rgba(240,237,232,0.55)', font: { size: 11 }, boxWidth: 14, boxHeight: 3, usePointStyle: false,
                      filter: (item) => !item.text.includes('proyección')
                    }
                  },
                  tooltip: {
                    backgroundColor: '#1e2b3a', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
                    titleColor: '#F0EDE8', bodyColor: '#F0EDE8', padding: 10,
                    filter: (item) => !isNaN(item.parsed.y),
                    callbacks: {
                      label: (ctx) => ` ${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y)}`
                    }
                  }
                },
                scales: {
                  x: { ticks: { color: 'rgba(240,237,232,0.55)', font: { size: 10.5 }, maxRotation: 0 }, grid: { color: 'rgba(255,255,255,0.08)' } },
                  y: {
                    ticks: { color: 'rgba(240,237,232,0.55)', font: { size: 10.5 }, callback: (v) => '$' + (v / 1e6).toFixed(1) + 'M' },
                    grid: { color: 'rgba(255,255,255,0.08)' }
                  }
                }
              }}
            />
          )}
          {!chart && <div className="empty-state">Cargando serie semanal…</div>}
        </div>
      </section>

      <section className="tbl-card dash-table">
        <div className="tbl-head">
          <h4>Detalle semanal</h4>
          <div className="info">Las filas con ≈ son proyección estimada</div>
        </div>
        <table>
          <thead>
            <tr><th>Semana</th><th className="num">Ventas</th><th className="num">Pagos</th><th className="num">CMV</th></tr>
          </thead>
          <tbody>
            {(data?.semanal || []).map((r) => (
              <tr key={r.semana}>
                <td>{r.semana}</td>
                <td className="num">{fmtMoney(r.ventas)}</td>
                <td className="num">{fmtMoney(r.pagos)}</td>
                <td className="num">{fmtMoney(r.cmv)}</td>
              </tr>
            ))}
            {(data?.proyeccion || []).filter((r) => r.ventas !== null).map((r) => (
              <tr key={r.semana} style={{ opacity: 0.65 }}>
                <td>≈ {r.semana}</td>
                <td className="num">{fmtMoney(r.ventas)}</td>
                <td className="num">{fmtMoney(r.pagos)}</td>
                <td className="num">{fmtMoney(r.cmv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
