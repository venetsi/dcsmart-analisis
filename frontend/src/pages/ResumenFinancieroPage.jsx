import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import { api } from '../lib/api.js'
import { fmtMoney } from '../lib/format.js'
import { useGroup } from '../context/GroupContext.jsx'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

function prevMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 7)
}

export default function ResumenFinancieroPage() {
  const { grupo } = useGroup()
  const [searchParams, setSearchParams] = useSearchParams()
  const [locales, setLocales] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const mes = searchParams.get('mes') || prevMonth()
  const local = searchParams.get('local') || ''

  useEffect(() => {
    api.getDatasetOptions('pagos', { grupo }).then((o) => setLocales(o.local || [])).catch(() => setLocales([]))
  }, [grupo])

  const load = useCallback(() => {
    setLoading(true); setError('')
    api.getResumenFinanciero({ mes, grupo, local: local || undefined })
      .then(setData).catch((err) => setError(err.message)).finally(() => setLoading(false))
  }, [mes, grupo, local])
  useEffect(() => { load() }, [load])

  function setParam(k, v) {
    const next = new URLSearchParams(searchParams)
    if (v) next.set(k, v); else next.delete(k)
    setSearchParams(next)
  }

  const r = data?.rentabilidad
  const f = data?.flujoCaja
  const ct = data?.capitalTrabajo

  const flujoChart = useMemo(() => {
    if (!f) return null
    return {
      labels: ['Entradas op.', 'Salidas op.', 'Entradas fin.', 'Salidas fin.', 'Flujo neto'],
      datasets: [{
        data: [f.entradas_operativas, -f.salidas_operativas, f.entradas_financieras, -f.salidas_financieras, f.neto],
        backgroundColor: ['#4CAF7D', '#E05C5C', '#4CAF7D', '#E05C5C', '#6BA6E0'],
        borderRadius: 5
      }]
    }
  }, [f])

  return (
    <div>
      <div className="page-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>Resumen Financiero <small style={{ color: 'var(--beige)', fontWeight: 400, fontSize: 13 }}>· {grupo}{local ? ` · ${local}` : ' · consolidado'}</small></h2>
          <p>Flujo de caja, rentabilidad e indicadores clave para decidir · período {mes}</p>
        </div>
      </div>

      <section className="filters">
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
        <div className="match">{loading ? 'Calculando…' : ''}</div>
      </section>

      {error && <p className="login-err">{error}</p>}

      {data && (
        <>
          {/* KPI row estilo infografía */}
          <section className="dash-kpis">
            <div className="dash-kpi ventas">
              <div className="dk-glow" />
              <div className="dk-label">Flujo de caja neto</div>
              <div className="dk-value" style={{ color: f.neto >= 0 ? '#6BA6E0' : '#E05C5C' }}>{fmtMoney(f.neto)}</div>
              <div className="dk-sub">período · base caja</div>
            </div>
            <div className="dash-kpi">
              <div className="dk-glow" style={{ background: '#C9B086' }} />
              <div className="dk-label">Margen operativo</div>
              <div className="dk-value" style={{ color: '#E1CBA0' }}>{r.margenOperativo != null ? `${r.margenOperativo}%` : '—'}</div>
              <div className="dk-sub">resultado operativo / ventas</div>
            </div>
            <div className="dash-kpi pendiente">
              <div className="dk-label">Liquidez corriente</div>
              <div className="dk-value">n/d</div>
              <div className="rf-badge">requiere balance</div>
            </div>
            <div className="dash-kpi pendiente">
              <div className="dk-label">Rentabilidad (ROE)</div>
              <div className="dk-value">n/d</div>
              <div className="rf-badge">requiere balance</div>
            </div>
          </section>

          {/* 1 · Flujo de caja */}
          <div className="rf-section-title"><span className="rf-num">1</span><h3>Flujo de Caja <small>— movimiento de dinero del período (base caja)</small></h3></div>
          <section className="pyl-grid">
            <div className="pyl-card">
              <h4>Flujo de caja del período</h4>
              <div className="wrap sm">
                {flujoChart && (
                  <Bar data={flujoChart} options={{
                    responsive: true, maintainAspectRatio: false, animation: false,
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmtMoney(c.raw) } } },
                    scales: {
                      x: { ticks: { color: 'rgba(240,237,232,0.55)', font: { size: 10 } }, grid: { display: false } },
                      y: { ticks: { color: 'rgba(240,237,232,0.55)', font: { size: 10 }, callback: (v) => '$' + (v / 1e6).toFixed(0) + 'M' }, grid: { color: 'rgba(255,255,255,0.08)' } }
                    }
                  }} />
                )}
              </div>
            </div>
            <div className="pyl-card">
              <h4>Componentes</h4>
              <table className="pyl-table" style={{ marginTop: 4 }}>
                <tbody>
                  <tr className="pyl-cat"><td>Entradas operativas (ventas)</td><td className="num">{fmtMoney(f.entradas_operativas)}</td></tr>
                  <tr className="pyl-cat"><td>Salidas operativas (pagadas)</td><td className="num">−{fmtMoney(f.salidas_operativas)}</td></tr>
                  <tr className="pyl-cat"><td>Entradas financieras</td><td className="num">{fmtMoney(f.entradas_financieras)}</td></tr>
                  <tr className="pyl-cat"><td>Salidas financieras</td><td className="num">−{fmtMoney(f.salidas_financieras)}</td></tr>
                  <tr className="pyl-result econ"><td>Flujo de caja neto</td><td className="num">{fmtMoney(f.neto)}</td></tr>
                  <tr className="pyl-cat"><td>Días de proveedores (aprox.)</td><td className="num">{ct.dias_proveedores != null ? `${ct.dias_proveedores} días` : '—'}</td></tr>
                  <tr className="pyl-cat"><td>Deuda a proveedores pendiente</td><td className="num">{fmtMoney(ct.deuda_proveedores_pendiente)}</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 2 · Rentabilidad */}
          <div className="rf-section-title"><span className="rf-num">2</span><h3>Rentabilidad <small>— márgenes sobre ventas</small></h3></div>
          <section className="pyl-grid">
            <div className="pyl-card">
              <h4>Márgenes</h4>
              <div className="wrap sm">
                <Doughnut
                  data={{
                    labels: ['Resultado operativo', 'CMV', 'Otros gastos'],
                    datasets: [{
                      data: [Math.max(0, r.resultadoOperativo), r.cmv, Math.max(0, r.ventas - r.cmv - r.resultadoOperativo)],
                      backgroundColor: ['#4CAF7D', '#C9B086', '#6BA6E0'], borderColor: '#19232f', borderWidth: 2
                    }]
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, animation: false, cutout: '62%', plugins: { legend: { position: 'right', labels: { color: 'rgba(240,237,232,0.55)', font: { size: 10.5 }, boxWidth: 12 } } } }}
                />
              </div>
            </div>
            <div className="pyl-card">
              <h4>Indicadores de margen</h4>
              <table className="pyl-table" style={{ marginTop: 4 }}>
                <tbody>
                  <tr className="pyl-cat"><td>Ventas</td><td className="num">{fmtMoney(r.ventas)}</td><td className="num pyl-pct">100%</td></tr>
                  <tr className="pyl-sec"><td>Margen bruto</td><td className="num">{fmtMoney(r.resultadoBruto)}</td><td className="num pyl-pct">{r.margenBruto}%</td></tr>
                  <tr className="pyl-sec"><td>Margen operativo</td><td className="num">{fmtMoney(r.resultadoOperativo)}</td><td className="num pyl-pct">{r.margenOperativo}%</td></tr>
                  <tr className="pyl-sec"><td>Margen neto (aprox.)</td><td className="num">{fmtMoney(r.resultadoNeto)}</td><td className="num pyl-pct">{r.margenNeto}%</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 3 · Liquidez y retorno de capital (pendiente de balance) */}
          <div className="rf-section-title"><span className="rf-num">3</span><h3>Liquidez y retorno de capital <small>— pendiente de datos de balance</small></h3></div>
          <div className="rf-note">
            Los indicadores de <b>liquidez</b> (corriente, prueba ácida), <b>capital de trabajo</b> y <b>retorno de capital</b> (ROA, ROE, ROI)
            no se calculan con la información transaccional actual: requieren saldos de <b>balance</b> (inventario, efectivo, créditos por venta,
            cuentas por pagar, deuda y patrimonio). Para activarlos hace falta una carga mensual de esos saldos o conectar el sistema contable.
          </div>
        </>
      )}
    </div>
  )
}
