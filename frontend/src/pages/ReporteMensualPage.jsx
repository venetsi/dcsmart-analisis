import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { fmtMoney, fmtNum, fmtMesLargo } from '../lib/format.js'
import { buildReporte } from '../lib/reporteMensual.js'
import { useGroup } from '../context/GroupContext.jsx'
import PageHeader from '../components/PageHeader.jsx'

function prevMonth() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 7)
}

const SECCIONES_MANUALES = ['alquiler', 'impositivos', 'pasivo', 'socios']

export default function ReporteMensualPage() {
  const { grupo } = useGroup()
  const [mes, setMes] = useState(prevMonth())
  const [local, setLocal] = useState('')
  const [localOpts, setLocalOpts] = useState([])
  const [auto, setAuto] = useState(null)
  const [manuales, setManuales] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [manualMsg, setManualMsg] = useState('')

  useEffect(() => {
    api.getDatasetOptions('pagos', { grupo })
      .then((o) => setLocalOpts(o.local || []))
      .catch(() => setLocalOpts([]))
  }, [grupo])

  useEffect(() => {
    if (!grupo) return
    setLoading(true); setError('')
    Promise.all([
      api.getReporteMensual({ mes, grupo, local: local || undefined }),
      local ? api.getReporteManual({ grupo, local, mes }) : Promise.resolve([]),
    ]).then(([a, m]) => { setAuto(a); setManuales(m || []); setDirty(false); setManualMsg('') })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [grupo, mes, local])

  const rep = auto ? buildReporte({ ventas: auto.ventas, gastos: auto.gastos, manuales }) : null
  const t = rep?.totales
  const money = (x) => fmtMoney(x)

  function editFila(i, patch) {
    setManuales((ms) => ms.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
    setDirty(true); setManualMsg('')
  }
  function addFila(seccion) {
    setManuales((ms) => [...ms, { seccion, concepto: '', monto: 0, columna: 1 }])
    setDirty(true); setManualMsg('')
  }
  function removeFila(i) {
    setManuales((ms) => ms.filter((_, idx) => idx !== i))
    setDirty(true); setManualMsg('')
  }
  async function traerMesAnterior() {
    setManualMsg('')
    try {
      const prev = await api.getReporteManualAnterior({ grupo, local, mes })
      setManuales(prev || [])
      setDirty(true)
    } catch (e) {
      setManualMsg(`Error: ${e.message}`)
    }
  }
  async function guardarManual() {
    setSaving(true); setManualMsg('')
    try {
      // Dedup por (seccion, concepto): si hay filas repetidas el backend
      // viola el UNIQUE y falla con error genérico. Gana la última edición.
      const dedup = [...new Map(manuales.map(f => [`${f.seccion}|${f.concepto}`, f])).values()]
      await api.putReporteManual({ grupo, local, mes, filas: dedup })
      setDirty(false)
      setManualMsg('Guardado.')
    } catch (e) {
      setManualMsg(`Error al guardar: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pyl">
      <PageHeader
        title="Reporte de Ventas Mensuales"
        chips={[grupo, local || 'Consolidado', fmtMesLargo(mes)]}
        sub="P&L mensual por tipo de comprobante, con apertura bancarizado / efectivo."
        actions={<div className="pyl-actions pyl-noprint"><button className="btn-pdf" type="button" onClick={() => window.print()}>Exportar / Imprimir PDF</button></div>}
      />

      <section className="filters pyl-noprint">
        <div className="fg" style={{ maxWidth: 160 }}>
          <label>Mes</label>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <div className="fg" style={{ maxWidth: 220 }}>
          <label>Local</label>
          <select value={local} onChange={(e) => setLocal(e.target.value)}>
            <option value="">Consolidado (todo el grupo)</option>
            {localOpts.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="match">{loading ? 'Calculando…' : (auto ? `${fmtNum(auto.gastos.length)} líneas de gasto` : '')}</div>
      </section>

      {error && <p className="login-err">{error}</p>}

      {rep && (
        <>
          <section className="dash-kpis">
            <div className="dash-kpi ventas">
              <div className="dk-glow" />
              <div className="dk-label">Ventas del mes</div>
              <div className="dk-value">{money(t.ventas)}</div>
              <div className="dk-sub">{fmtNum(auto.ventas.tickets)} tickets · {fmtNum(auto.ventas.comensales)} cub.</div>
            </div>
            <div className="dash-kpi">
              <div className="dk-glow" style={{ background: t.resultadoBruto >= 0 ? '#4CAF7D' : '#E05C5C' }} />
              <div className="dk-label">Resultado bruto</div>
              <div className="dk-value" style={{ color: t.resultadoBruto >= 0 ? '#4CAF7D' : '#E05C5C' }}>{money(t.resultadoBruto)}</div>
              <div className="dk-sub">ventas − CMV</div>
            </div>
            <div className="dash-kpi">
              <div className="dk-glow" style={{ background: t.resultadoEconomico >= 0 ? '#4CAF7D' : '#E05C5C' }} />
              <div className="dk-label">Resultado económico</div>
              <div className="dk-value" style={{ color: t.resultadoEconomico >= 0 ? '#4CAF7D' : '#E05C5C' }}>{money(t.resultadoEconomico)}</div>
              <div className="dk-sub">post gastos operativos</div>
            </div>
            <div className="dash-kpi">
              <div className="dk-glow" style={{ background: t.resultadoMes >= 0 ? '#4CAF7D' : '#E05C5C' }} />
              <div className="dk-label">Resultado del mes</div>
              <div className="dk-value" style={{ color: t.resultadoMes >= 0 ? '#4CAF7D' : '#E05C5C' }}>{money(t.resultadoMes)}</div>
              <div className="dk-sub">post financiación / socios</div>
            </div>
            <div className="dash-kpi">
              <div className="dk-glow" />
              <div className="dk-label">Food cost (CMV)</div>
              <div className="dk-value">{`${t.foodCostPct.toFixed(1)}%`}</div>
              <div className="dk-sub">sobre ventas</div>
            </div>
            <div className="dash-kpi">
              <div className="dk-glow" />
              <div className="dk-label">Prime cost</div>
              <div className="dk-value">{`${t.primeCostPct.toFixed(1)}%`}</div>
              <div className="dk-sub">CMV + sueldos</div>
            </div>
          </section>

          {!local && (
            <p className="login-err">
              ⚠️ Vista consolidada: no incluye la carga manual (impuestos, pasivo, socios), que se carga por local.
            </p>
          )}
          {rep.sinAsignar.tipos.length > 0 && (
            <p className="login-err">
              ⚠️ {money(rep.sinAsignar.total)} en tipos sin asignar a columna: {rep.sinAsignar.tipos.join(', ')}
            </p>
          )}
          {rep.manualesSinUbicar?.length > 0 && (
            <p className="login-err">
              ⚠️ {rep.manualesSinUbicar.length} concepto(s) manual(es) con sección desconocida (no computados): {rep.manualesSinUbicar.map(m => `${m.concepto} (${m.seccion})`).join(', ')}
            </p>
          )}

          <section className="tbl-card" style={{ overflowX: 'auto' }}>
            <table className="pyl-table">
              <thead>
                <tr><th>Concepto</th><th>Total</th><th>Col 1 · Bancarizado</th><th>Col 2 · Efectivo</th></tr>
              </thead>
              <tbody>
                <tr className="pyl-sec"><td>INGRESOS · Ventas</td><td className="num">{money(t.ventas)}</td><td className="num">—</td><td className="num">—</td></tr>

                {rep.secciones.filter((s) => !s.belowLine).map((s) => (
                  <SectionRows key={s.key} s={s} money={money}
                    after={s.cmv ? <ResultRow cls="bruto" label="RESULTADO BRUTO" val={t.resultadoBruto} money={money} /> : null} />
                ))}
                <ResultRow cls={`econ ${t.resultadoEconomico >= 0 ? 'pos' : 'neg'}`} label="RESULTADO ECONÓMICO" val={t.resultadoEconomico} money={money} />

                {rep.secciones.filter((s) => s.belowLine).map((s) => (
                  <SectionRows key={s.key} s={s} money={money} />
                ))}
                <ResultRow cls={`${t.resultadoMes >= 0 ? 'pos' : 'neg'}`} label="RESULTADO DEL MES" val={t.resultadoMes} money={money} />
              </tbody>
            </table>
          </section>

          {local && (
            <section className="manual-panel no-print">
              <div className="manual-head">
                <h3>Carga manual — {local} · {mes}</h3>
                <div className="manual-actions">
                  <button className="btn" type="button" onClick={traerMesAnterior}>Traer del mes anterior</button>
                  <button className="btn" type="button" disabled={!dirty || saving} onClick={guardarManual}>
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                  {manualMsg && <span className="manual-msg">{manualMsg}</span>}
                </div>
              </div>
              {SECCIONES_MANUALES.map((sec) => (
                <fieldset className="manual-sec" key={sec}>
                  <legend>{sec}</legend>
                  {manuales.map((m, i) => (m.seccion === sec ? (
                    <div className="manual-row" key={i}>
                      <input
                        value={m.concepto}
                        placeholder="concepto"
                        onChange={(e) => editFila(i, { concepto: e.target.value })}
                      />
                      <input
                        type="number"
                        value={m.monto}
                        onChange={(e) => editFila(i, { monto: Number(e.target.value) })}
                      />
                      <select value={m.columna} onChange={(e) => editFila(i, { columna: Number(e.target.value) })}>
                        <option value={1}>Col 1 · Bancarizado</option>
                        <option value={2}>Col 2 · Efectivo</option>
                      </select>
                      <button type="button" className="btn-icon" onClick={() => removeFila(i)}>✕</button>
                    </div>
                  ) : null))}
                  <button type="button" className="btn-sm" onClick={() => addFila(sec)}>+ agregar</button>
                </fieldset>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function SectionRows({ s, money, after }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr className={`pyl-sec ${s.belowLine ? 'pyl-memo' : ''}`}>
        <td className="pyl-toggle" onClick={() => setOpen(o => !o)}>
          <span className="caret">{open ? '▾' : '▸'}</span> {s.titulo}
        </td>
        <td className="num">{money(s.total)}</td>
        <td className="num">{money(s.col1)}</td>
        <td className="num">{money(s.col2)}</td>
      </tr>
      {open && s.lineas.map((l, i) => (
        <tr className="pyl-cat" key={l.concepto + i}>
          <td>{l.concepto}</td>
          <td className="num">{money(l.total)}</td>
          <td className="num">{money(l.col1)}</td>
          <td className="num">{money(l.col2)}</td>
        </tr>
      ))}
      {after}
    </>
  )
}

function ResultRow({ cls, label, val, money }) {
  return (
    <tr className={`pyl-result ${cls}`}>
      <td>{label}</td><td className="num">{money(val)}</td><td /><td />
    </tr>
  )
}
