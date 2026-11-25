import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { api } from '../lib/api.js'
import { fmtNum, fmtMesLargo, fmtPesos, fmtPesosCorto, fmtPct } from '../lib/format.js'
import { buildPyl, waterfallSteps, repartoVentas, variacion, mesAnterior } from '../lib/pyl.js'
import { useGroup } from '../context/GroupContext.jsx'
import PageHeader from '../components/PageHeader.jsx'
import SelectorMes, { mesActual } from '../components/SelectorMes.jsx'
import '../styles/pyl.css'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

// Colores del puente: lo que entra en turquesa (el de los reportes de
// gestión), lo que resta en coral, los subtotales en dorado y el resultado
// con el verde/rojo de estado.
const C_VENTA = '#3FB6BD'
const C_GASTO = '#E0938C'
const C_SUBTOTAL = '#C9B086'
const C_OK = '#4CAF7D'
const C_MAL = '#E05C5C'

/* ── íconos de las tarjetas (mismo trazo que el menú) ── */
const Ico = ({ children }) => (
  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const IcoVentas = () => <Ico><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></Ico>
const IcoResultado = () => <Ico><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /><path d="M12 8v8" /></Ico>
const IcoCmv = () => <Ico><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></Ico>
const IcoPrime = () => <Ico><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></Ico>
const IcoDescargar = () => <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
const IcoChevron = () => <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>

// "▲ 4,2% vs agosto": sube = verde salvo que subir sea malo (costos).
function Variacion({ valor, contra, inverso = false, unidad = '%' }) {
  if (valor == null) return null
  const sube = valor > 0
  const bueno = valor === 0 ? null : (sube !== inverso)
  const cls = bueno == null ? '' : bueno ? 'up' : 'down'
  const signo = valor > 0 ? '▲' : valor < 0 ? '▼' : '='
  const num = Math.abs(valor).toLocaleString('es-AR', { maximumFractionDigits: 1 })
  return <span className={`pyl-var ${cls}`}>{signo} {num}{unidad} <em>vs {contra}</em></span>
}

// Tarjeta con regla de colores: dónde cae el valor contra el objetivo.
function Semaforo({ label, Icon, valor, bueno, malo, tope, objetivo, sub, anterior, contra }) {
  const estado = valor == null ? 'neutro' : valor <= bueno ? 'ok' : valor >= malo ? 'mal' : 'alerta'
  const texto = { ok: 'En objetivo', alerta: 'Atención', mal: 'Fuera de objetivo', neutro: 'Sin datos' }[estado]
  const pos = (v) => `${Math.min(100, Math.max(0, (v / tope) * 100))}%`
  return (
    <div className={`pyl-kpi sem-${estado}`}>
      <div className="pyl-kpi-head">
        <span className="pyl-kpi-label">{label}</span>
        <span className="pyl-kpi-icon"><Icon /></span>
      </div>
      <div className="pyl-kpi-value">{valor == null ? '—' : fmtPct(valor)}</div>
      <div className="pyl-gauge" aria-hidden="true">
        <span className="z ok" style={{ width: pos(bueno) }} />
        <span className="z alerta" style={{ left: pos(bueno), width: `calc(${pos(malo)} - ${pos(bueno)})` }} />
        <span className="z mal" style={{ left: pos(malo), right: 0 }} />
        {valor != null && <span className="marca" style={{ left: pos(valor) }} />}
      </div>
      <div className="pyl-kpi-sub">
        <span className={`pyl-estado ${estado}`}>{texto}</span> · {objetivo}
      </div>
      {anterior != null && valor != null && (
        <div className="pyl-kpi-sub">
          <Variacion valor={+(valor - anterior).toFixed(1)} contra={contra} inverso unidad=" pts" />
        </div>
      )}
      {sub && <div className="pyl-kpi-sub">{sub}</div>}
    </div>
  )
}

// Lista de barras horizontales de un solo color: compara magnitudes sin
// depender de una paleta de muchos colores.
function Barras({ filas, max, total, color = C_SUBTOTAL, pie }) {
  return (
    <div className="pyl-barras">
      {filas.map((f) => (
        <div className="pyl-barra" key={f.key || f.label}>
          <div className="pyl-barra-top">
            <span className="pyl-barra-nombre" title={f.label}>{f.label}</span>
            <span className="pyl-barra-valor">{fmtPesosCorto(f.valor)}</span>
            <span className="pyl-barra-pct">{f.pct == null ? '' : fmtPct(f.pct)}</span>
          </div>
          <div className="pyl-barra-track">
            <span style={{ width: `${max ? Math.max(1.5, (Math.abs(f.valor) / max) * 100) : 0}%`, background: f.color || color }} />
          </div>
        </div>
      ))}
      {pie}
      {total}
    </div>
  )
}

// Etiqueta arriba de cada barra del puente: el % sobre las ventas.
const etiquetasPuente = {
  id: 'etiquetasPuente',
  afterDatasetsDraw(chart, _args, opts) {
    const { ctx } = chart
    const meta = chart.getDatasetMeta(0)
    ctx.save()
    ctx.font = '600 11px Montserrat, system-ui, sans-serif'
    ctx.fillStyle = 'rgba(240,237,232,0.72)'
    ctx.textAlign = 'center'
    meta.data.forEach((bar, i) => {
      const txt = opts.textos?.[i]
      if (!txt) return
      const top = Math.min(bar.y, bar.base)
      ctx.fillText(txt, bar.x, top - 7)
    })
    ctx.restore()
  }
}

export default function PyLPage() {
  const { grupo } = useGroup()
  const [searchParams, setSearchParams] = useSearchParams()
  const [locales, setLocales] = useState([])
  const [data, setData] = useState(null)
  const [previo, setPrevio] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [abiertas, setAbiertas] = useState(() => new Set())

  const mes = searchParams.get('mes') || mesAnterior(mesActual())
  const local = searchParams.get('local') || ''
  const mesPrevio = mesAnterior(mes)
  const nombrePrevio = fmtMesLargo(mesPrevio).split(' ')[0].toLowerCase()

  useEffect(() => {
    api.getDatasetOptions('pagos', { grupo })
      .then((o) => setLocales(o.local || []))
      .catch(() => setLocales([]))
  }, [grupo])

  const load = useCallback(() => {
    setLoading(true); setError('')
    const q = { grupo, local: local || undefined }
    // El mes anterior es solo para comparar: si falla, la página sigue igual.
    api.getPyl({ ...q, mes: mesPrevio }).then(setPrevio).catch(() => setPrevio(null))
    api.getPyl({ ...q, mes })
      .then(setData)
      .catch((err) => { setData(null); setError(err.message) })
      .finally(() => setLoading(false))
  }, [mes, mesPrevio, grupo, local])

  useEffect(() => { load() }, [load])

  function setParam(k, v) {
    const next = new URLSearchParams(searchParams)
    if (v) next.set(k, v); else next.delete(k)
    setSearchParams(next)
  }

  const pyl = useMemo(() => (data ? buildPyl(data) : null), [data])
  const pylPrevio = useMemo(() => (previo ? buildPyl(previo) : null), [previo])
  const sinDatos = pyl && !pyl.totales.ventas && !data.gastos.length

  const puente = useMemo(() => {
    if (!pyl) return null
    const steps = waterfallSteps(pyl)
    let corriendo = 0
    const rangos = [], colores = [], textos = []
    for (const s of steps) {
      if (s.tipo === 'ingreso') { rangos.push([0, s.valor]); corriendo = s.valor; colores.push(C_VENTA) }
      else if (s.tipo === 'subtotal') { rangos.push([0, corriendo]); colores.push(C_SUBTOTAL) }
      else if (s.tipo === 'resultado') { rangos.push([0, corriendo]); colores.push(corriendo >= 0 ? C_OK : C_MAL) }
      else { const n = corriendo + s.valor; rangos.push([n, corriendo]); corriendo = n; colores.push(C_GASTO) }
      textos.push(s.tipo === 'ingreso' ? '100%' : fmtPct(pyl.pct(s.tipo === 'egreso' ? Math.abs(s.valor) : corriendo), 0))
    }
    return { labels: steps.map(s => s.label), rangos, colores, textos }
  }, [pyl])

  const reparto = useMemo(() => (pyl ? repartoVentas(pyl) : null), [pyl])
  const cmvSec = pyl?.secciones.find(s => s.cmv)

  const t = pyl?.totales
  const tp = pylPrevio?.totales
  const tieneSeccion = (k) => abiertas.has(k)
  const alternar = (k) => setAbiertas((prev) => {
    const n = new Set(prev)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })
  const todasAbiertas = pyl && pyl.secciones.every(s => abiertas.has(s.key))
  const abrirTodo = () => setAbiertas(todasAbiertas ? new Set() : new Set(['ventas', ...pyl.secciones.map(s => s.key)]))

  const ticketProm = pyl?.ventas.tickets ? t.ventas / pyl.ventas.tickets : null
  const cubiertoProm = pyl?.ventas.comensales ? t.ventas / pyl.ventas.comensales : null
  const labor = t?.laborKpi || 0 // Labor + rubro Sueldos en gastos operativos (ver lib/pyl.js)

  return (
    <div className="page pyl">
      <PageHeader
        title="Estado de Resultados"
        chips={[grupo, local || 'Todo el grupo', fmtMesLargo(mes)]}
        sub="Lo que entró por caja en el mes contra lo que se gastó, rubro por rubro."
        actions={
          <button className="pyl-btn-pdf pyl-noprint" type="button" onClick={() => window.print()}>
            <IcoDescargar /> Descargar PDF
          </button>
        }
      />

      <section className="pyl-filtros pyl-noprint">
        <SelectorMes mes={mes} onChange={(m) => setParam('mes', m)} />
        <div className="pyl-filtro pyl-filtro-local">
          <div className="pyl-filtro-label">Local</div>
          <select value={local} onChange={(e) => setParam('local', e.target.value)}>
            <option value="">Todo el grupo</option>
            {locales.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="pyl-estado-carga">
          {loading ? <><span className="pyl-spinner" /> Calculando…</> : data ? `${fmtNum(data.gastos.length)} líneas de gasto` : ''}
        </div>
      </section>

      {data?.ipc && <IndicadoresIpc ipc={data.ipc} mes={mes} />}

      {error && <div className="pyl-error">No se pudo calcular el resultado. Probá de nuevo en un momento.</div>}

      {!pyl && loading && (
        <div className="pyl-kpis">
          {[0, 1, 2, 3].map(i => <div key={i} className="pyl-kpi pyl-skel" />)}
        </div>
      )}

      {sinDatos && (
        <div className="pyl-vacio">
          <strong>No hay ventas ni gastos cargados en {fmtMesLargo(mes)}.</strong>
          <span>Elegí otro mes o revisá que las cajas y los pagos del período estén en gestión.</span>
        </div>
      )}

      {pyl && !sinDatos && (
        <div className={loading ? 'pyl-recargando' : ''}>
          <section className="pyl-kpis">
            <div className="pyl-kpi hero">
              <div className="pyl-kpi-head">
                <span className="pyl-kpi-label">Ventas del mes</span>
                <span className="pyl-kpi-icon"><IcoVentas /></span>
              </div>
              <div className="pyl-kpi-value big">{fmtPesosCorto(t.ventas)}</div>
              <div className="pyl-kpi-sub"><Variacion valor={variacion(t.ventas, tp?.ventas)} contra={nombrePrevio} /></div>
              <div className="pyl-kpi-sub">{fmtNum(pyl.ventas.tickets)} tickets · {fmtNum(pyl.ventas.comensales)} cubiertos</div>
            </div>

            <div className={`pyl-kpi ${t.resultadoEconomico >= 0 ? 'positivo' : 'negativo'}`}>
              <div className="pyl-kpi-head">
                <span className="pyl-kpi-label">EBITDA</span>
                <span className="pyl-kpi-icon"><IcoResultado /></span>
              </div>
              <div className="pyl-kpi-value big">{fmtPesosCorto(t.resultadoEconomico)}</div>
              <div className="pyl-kpi-sub"><Variacion valor={variacion(t.resultadoEconomico, tp?.resultadoEconomico)} contra={nombrePrevio} /></div>
              <div className="pyl-kpi-sub">{fmtPct(t.margenPct)} de las ventas</div>
            </div>

            <Semaforo
              label="Food cost (CMV)" Icon={IcoCmv} valor={t.foodCostPct}
              bueno={35} malo={42} tope={60} objetivo="objetivo 28–35%"
              anterior={tp?.ventas ? tp.foodCostPct : null} contra={nombrePrevio}
            />
            <Semaforo
              label="Prime cost" Icon={IcoPrime} valor={t.primeCostPct}
              bueno={60} malo={68} tope={90} objetivo="CMV + sueldos, menos de 65%"
              anterior={tp?.ventas ? tp.primeCostPct : null} contra={nombrePrevio}
            />
          </section>

          <section className="pyl-tira">
            <div className="pyl-tira-item">
              <span className="pyl-tira-label">Resultado bruto</span>
              <span className="pyl-tira-val">{fmtPesosCorto(t.resultadoBruto)}</span>
              <span className="pyl-tira-sub">{fmtPct(pyl.pct(t.resultadoBruto))} de las ventas</span>
            </div>
            <div className="pyl-tira-item">
              <span className="pyl-tira-label">Labor y gastos operativos</span>
              <span className="pyl-tira-val">{fmtPesosCorto(t.gastosOperativos)}</span>
              <span className="pyl-tira-sub">sin CMV · {fmtPct(pyl.pct(t.gastosOperativos))}</span>
            </div>
            <div className="pyl-tira-item">
              <span className="pyl-tira-label">Sueldos y cargas</span>
              <span className="pyl-tira-val">{fmtPesosCorto(labor)}</span>
              <span className="pyl-tira-sub">{fmtPct(t.laborPct)} de las ventas</span>
            </div>
            <div className="pyl-tira-item">
              <span className="pyl-tira-label">Ticket promedio</span>
              <span className="pyl-tira-val">{ticketProm ? fmtPesos(ticketProm) : '—'}</span>
              <span className="pyl-tira-sub">{fmtNum(pyl.ventas.tickets)} tickets</span>
            </div>
            <div className="pyl-tira-item">
              <span className="pyl-tira-label">Por cubierto</span>
              <span className="pyl-tira-val">{cubiertoProm ? fmtPesos(cubiertoProm) : '—'}</span>
              <span className="pyl-tira-sub">{fmtNum(pyl.ventas.comensales)} cubiertos</span>
            </div>
            <div className="pyl-tira-item">
              <span className="pyl-tira-label">Resultado remanente</span>
              <span className={`pyl-tira-val ${t.remanente >= 0 ? 'pos' : 'neg'}`}>{fmtPesosCorto(t.remanente)}</span>
              <span className="pyl-tira-sub">después de capex, retiros e impuestos</span>
            </div>
          </section>

          <section className="pyl-graficos">
            <div className="pyl-card pyl-card-oscura">
              <div className="pyl-card-titulo">De las ventas al resultado</div>
              <div className="pyl-card-sub">Hasta el EBITDA. Cada barra coral es un gasto que se resta; arriba, el % sobre las ventas.</div>
              <div className="pyl-puente">
                {puente && (
                  <Bar
                    data={{ labels: puente.labels, datasets: [{ data: puente.rangos, backgroundColor: puente.colores, borderRadius: 4, borderSkipped: false, maxBarThickness: 44 }] }}
                    plugins={[etiquetasPuente]}
                    options={{
                      responsive: true, maintainAspectRatio: false, animation: false,
                      layout: { padding: { top: 22 } },
                      plugins: {
                        legend: { display: false },
                        etiquetasPuente: { textos: puente.textos },
                        tooltip: {
                          backgroundColor: '#111820', borderColor: 'rgba(201,176,134,.3)', borderWidth: 1, padding: 10,
                          titleFont: { family: 'Montserrat', weight: '700' }, bodyFont: { family: 'Montserrat' },
                          callbacks: { label: (c) => `${fmtPesos(Math.abs(c.raw[1] - c.raw[0]))} · ${puente.textos[c.dataIndex]} de las ventas` }
                        }
                      },
                      scales: {
                        x: { ticks: { color: 'rgba(240,237,232,0.65)', font: { family: 'Montserrat', size: 11, weight: '600' }, maxRotation: 45, autoSkip: false }, grid: { display: false }, border: { display: false } },
                        y: { ticks: { color: 'rgba(240,237,232,0.4)', font: { family: 'Montserrat', size: 10 }, callback: (v) => fmtPesosCorto(v), maxTicksLimit: 6 }, grid: { color: 'rgba(255,255,255,0.06)' }, border: { display: false } }
                      }
                    }}
                  />
                )}
              </div>
            </div>

            <div className="pyl-card">
              <div className="pyl-card-titulo">En qué se van las ventas</div>
              <div className="pyl-card-sub">CMV, labor y gastos operativos como % de lo vendido, y lo que queda.</div>
              {reparto && (
                <Barras
                  filas={reparto.filas}
                  max={t.ventas}
                  color={C_GASTO}
                  total={
                    <div className={`pyl-queda ${reparto.resultado.valor >= 0 ? 'pos' : 'neg'}`}>
                      <span>{reparto.resultado.valor >= 0 ? 'Queda de EBITDA' : 'Los gastos superan las ventas'}</span>
                      <strong>{fmtPesosCorto(reparto.resultado.valor)}</strong>
                      <em>{fmtPct(reparto.resultado.pct)}</em>
                    </div>
                  }
                />
              )}
            </div>
          </section>

          <section className="pyl-graficos pares">
            <div className="pyl-card">
              <div className="pyl-card-titulo">Composición del CMV</div>
              <div className="pyl-card-sub">Las categorías de mercadería que más pesan, como % del CMV.</div>
              {cmvSec ? (
                <Barras
                  filas={cmvSec.lineas.slice(0, 7).map(l => ({ label: l.categoria, valor: l.total, pct: cmvSec.total ? +(l.total / cmvSec.total * 100).toFixed(1) : null }))}
                  max={cmvSec.lineas[0]?.total}
                  color={C_SUBTOTAL}
                  pie={cmvSec.lineas.length > 7 && <div className="pyl-barras-resto">y {cmvSec.lineas.length - 7} categorías más en el detalle</div>}
                />
              ) : <div className="pyl-card-vacio">No hay CMV cargado en el período.</div>}
            </div>

            <div className="pyl-card">
              <div className="pyl-card-titulo">De dónde vienen las ventas</div>
              <div className="pyl-card-sub">Por sistema de caja, con la parte bancarizada (fiscal) y en efectivo.</div>
              <div className="pyl-origenes">
                {pyl.ventas.por_origen.map((o) => {
                  const pf = o.total ? (o.fiscal / o.total) * 100 : 0
                  return (
                    <div className="pyl-origen" key={o.origen}>
                      <div className="pyl-barra-top">
                        <span className="pyl-barra-nombre">{o.origen}</span>
                        <span className="pyl-barra-valor">{fmtPesosCorto(o.total)}</span>
                        <span className="pyl-barra-pct">{fmtPct(pyl.pct(o.total))}</span>
                      </div>
                      <div className="pyl-split">
                        <span className="fiscal" style={{ width: `${pf}%` }} title={`Fiscal ${fmtPesos(o.fiscal)}`} />
                        <span className="efectivo" style={{ width: `${100 - pf}%` }} title={`Efectivo ${fmtPesos(o.efectivo)}`} />
                      </div>
                      <div className="pyl-split-leyenda">
                        <span><i className="fiscal" /> Fiscal {fmtPesosCorto(o.fiscal)}</span>
                        <span><i className="efectivo" /> Efectivo {fmtPesosCorto(o.efectivo)}</span>
                      </div>
                    </div>
                  )
                })}
                {!pyl.ventas.por_origen.length && <div className="pyl-card-vacio">Sin ventas en el período.</div>}
              </div>
            </div>
          </section>

          <section className="pyl-card pyl-tabla-card">
            <div className="pyl-tabla-head">
              <div>
                <div className="pyl-card-titulo">Detalle del resultado</div>
                <div className="pyl-card-sub">Clasificación P&amp;L › Rubro › Categoría, por período. Tocá una fila para abrirla.</div>
              </div>
              <button type="button" className="pyl-btn-sec pyl-noprint" onClick={abrirTodo}>
                {todasAbiertas ? 'Cerrar todo' : 'Abrir todo'}
              </button>
            </div>
            <div className="pyl-tabla-scroll">
              <table className="pyl-tabla">
                <thead>
                  <tr><th>Concepto</th><th>Total</th><th className="col-pct">% de ventas</th><th>Fiscal</th><th>Efectivo</th></tr>
                </thead>
                <tbody>
                  {/* Ventas = el cuadro de Ingresos (Trello #374): punto de venta, eventos, apps y ventas de gestión. */}
                  <tr className={`fila-sec fila-ventas${tieneSeccion('ventas') ? ' abierta' : ''}`} onClick={() => alternar('ventas')}>
                    <td>
                      <button type="button" className="pyl-toggle" aria-expanded={tieneSeccion('ventas')}>
                        <span className="chev"><IcoChevron /></span>Ventas
                        <span className="pyl-cuenta">{pyl.ventas.lineas?.length || 0}</span>
                      </button>
                    </td>
                    <td className="num">{fmtPesos(t.ventas)}</td>
                    <td className="num col-pct"><Pct v={100} /></td>
                    <td className="num">{fmtPesos(pyl.ventas.fiscal)}</td>
                    <td className="num">{fmtPesos(pyl.ventas.efectivo)}</td>
                  </tr>
                  {tieneSeccion('ventas') && (pyl.ventas.lineas || []).map((l) => (
                    <tr className="fila-cat" key={l.key}>
                      <td>{l.label}</td>
                      <td className="num">{fmtPesos(l.total)}</td>
                      <td className="num col-pct"><Pct v={pyl.pct(l.total)} /></td>
                      <td className="num">{fmtPesos(l.fiscal)}</td>
                      <td className="num">{fmtPesos(l.efectivo)}</td>
                    </tr>
                  ))}

                  <SeccionP clave="CMV" pyl={pyl} abiertas={abiertas} alternar={alternar} />
                  <Resultado cls="bruto" label="Resultado Bruto" ayuda="Ventas − CMV" val={t.resultadoBruto} pct={pyl.pct(t.resultadoBruto)} />
                  <SeccionP clave="Labor" pyl={pyl} abiertas={abiertas} alternar={alternar} />
                  <SeccionP clave="Gastos Operativos" pyl={pyl} abiertas={abiertas} alternar={alternar} />
                  <SeccionP clave="Sin Clasificación P&L" pyl={pyl} abiertas={abiertas} alternar={alternar} />
                  <Resultado cls={`econ ${t.ebitda >= 0 ? 'pos' : 'neg'}`} label="EBITDA" ayuda="Resultado Bruto − Labor − Gastos Operativos" val={t.ebitda} pct={pyl.pct(t.ebitda)} />
                  {pyl.sec('Depreciaciones y Amortizaciones').lineas.length > 0
                    ? <SeccionP clave="Depreciaciones y Amortizaciones" pyl={pyl} abiertas={abiertas} alternar={alternar} />
                    : (
                      <tr className="fila-sec fila-da">
                        <td><span className="pyl-toggle sin-chev">Depreciaciones y Amortizaciones <span className="pyl-nota">ningún rubro clasificado así</span></span></td>
                        <td className="num">—</td><td className="num col-pct" /><td /><td />
                      </tr>
                    )}
                  <Resultado cls="bruto" label="EBIT" ayuda="EBITDA − Depreciaciones y Amortizaciones" val={t.ebit} pct={pyl.pct(t.ebit)} />
                  <SeccionP clave="Resultado Financiero" pyl={pyl} abiertas={abiertas} alternar={alternar} />
                  <Resultado cls="bruto" label="RFN · Resultado Financiero Neto" ayuda="EBIT − Resultado Financiero" val={t.rfn} pct={pyl.pct(t.rfn)} />
                  <SeccionP clave="Imp. Ganancias" pyl={pyl} abiertas={abiertas} alternar={alternar} />
                  <Resultado cls={`econ ${t.utilidad >= 0 ? 'pos' : 'neg'}`} label="Utilidad" ayuda="RFN − Impuesto a las Ganancias" val={t.utilidad} pct={pyl.pct(t.utilidad)} />
                  <SeccionP clave="Capex" pyl={pyl} abiertas={abiertas} alternar={alternar} />
                  <SeccionP clave="Retiro Socios" pyl={pyl} abiertas={abiertas} alternar={alternar} />
                  <SeccionP clave="Aportes de Capital" pyl={pyl} abiertas={abiertas} alternar={alternar} suma />
                  <SeccionP clave="Impuestos" pyl={pyl} abiertas={abiertas} alternar={alternar} />
                  <Resultado cls={`final ${t.remanente >= 0 ? 'pos' : 'neg'}`} label="Resultado Remanente" ayuda="Utilidad − Capex − Retiro Socios + Aportes de Capital − Impuestos" val={t.remanente} pct={pyl.pct(t.remanente)} />

                  {pyl.sec('No P&L').lineas.length > 0 && (
                    <tr className="fila-linea"><td colSpan={5}>Fuera del P&amp;L · movimientos de tesorería que no son resultado (no suman)</td></tr>
                  )}
                  <SeccionP clave="No P&L" pyl={pyl} abiertas={abiertas} alternar={alternar} memo />
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function Pct({ v }) {
  return (
    <span className="pyl-pct">
      <span className="pyl-pct-bar"><i style={{ width: `${Math.min(100, Math.abs(v || 0))}%` }} /></span>
      {fmtPct(v)}
    </span>
  )
}

// Una Clasificación P&L › Rubro › Categoría (Trello #374). Sin líneas no se muestra (el resultado igual la cuenta).
function SeccionP({ clave, pyl, abiertas, alternar, memo, suma }) {
  const s = pyl.sec(clave)
  if (!s || !s.lineas.length) return null
  const abierta = abiertas.has(s.key)
  return (
    <>
      <tr className={`fila-sec${memo ? ' memo' : ''}${abierta ? ' abierta' : ''}`} onClick={() => alternar(s.key)}>
        <td>
          <button type="button" className="pyl-toggle" aria-expanded={abierta}>
            <span className="chev"><IcoChevron /></span>{suma ? '(+) ' : ''}{s.titulo}
            <span className="pyl-cuenta">{s.rubros.length}</span>
          </button>
        </td>
        <td className="num">{fmtPesos(s.total)}</td>
        <td className="num col-pct"><Pct v={pyl.pct(s.total)} /></td>
        <td className="num">{fmtPesos(s.fiscal)}</td>
        <td className="num">{fmtPesos(s.efectivo)}</td>
      </tr>
      {abierta && s.rubros.map((r) => {
        const kr = `${s.key}|${r.rubro}`
        const rAbierto = abiertas.has(kr)
        return (
          <Fragment key={kr}>
            <tr className={`fila-rubro${rAbierto ? ' abierta' : ''}`} onClick={(e) => { e.stopPropagation(); alternar(kr) }}>
              <td>
                <button type="button" className="pyl-toggle" aria-expanded={rAbierto}>
                  <span className="chev"><IcoChevron /></span>{r.rubro}
                  <span className="pyl-cuenta">{r.categorias.length}</span>
                </button>
              </td>
              <td className="num">{fmtPesos(r.total)}</td>
              <td className="num col-pct"><Pct v={pyl.pct(r.total)} /></td>
              <td className="num">{fmtPesos(r.fiscal)}</td>
              <td className="num">{fmtPesos(r.efectivo)}</td>
            </tr>
            {rAbierto && r.categorias.map((l, i) => (
              <tr className="fila-cat" key={kr + l.categoria + i}>
                <td>{l.categoria}</td>
                <td className="num">{fmtPesos(l.total)}</td>
                <td className="num col-pct"><Pct v={pyl.pct(l.total)} /></td>
                <td className="num">{fmtPesos(l.fiscal)}</td>
                <td className="num">{fmtPesos(l.efectivo)}</td>
              </tr>
            ))}
          </Fragment>
        )
      })}
    </>
  )
}

function Resultado({ cls, label, ayuda, val, pct }) {
  return (
    <tr className={`fila-res ${cls}`}>
      <td>{label}{ayuda && <span className="pyl-res-ayuda">{ayuda}</span>}</td>
      <td className="num"><span className="pyl-res-val">{fmtPesos(val)}</span></td>
      <td className="num col-pct">{fmtPct(pct)}</td>
      <td /><td />
    </tr>
  )
}

// Indicadores de inflación (Trello #374): mensual e interanual del nivel general y la tabla de las divisiones del
// IPC que le corresponden al tipo de local (Gastronomía: alimentos, bebidas alcohólicas, restaurantes; Indumentaria:
// prendas). INDEC publica a mediados del mes siguiente: si el mes elegido todavía no salió, se muestra el último.
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const nombreMes = (m) => { const [y, mm] = m.split('-').map(Number); return `${MES_LARGO[mm - 1]} ${y}` }
const mesPrevioCorto = (m) => { const [, mm] = m.split('-').map(Number); return MES_LARGO[(mm + 10) % 12].slice(0, 3) }
const pct1 = (v) => (v == null ? '—' : `${v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`)
const pp = (a, b) => {
  if (a == null || b == null) return null
  const d = Math.round((a - b) * 10) / 10
  return `${d > 0 ? '+' : ''}${d.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`
}
const VS = { sobre: { txt: 'Sobre promedio', cls: 'sobre', ico: '▲' }, bajo: { txt: 'Bajo promedio', cls: 'bajo', ico: '▼' }, promedio: { txt: 'En promedio', cls: 'prom', ico: '●' } }

function IndicadoresIpc({ ipc, mes }) {
  const g = ipc.general
  const mesDato = ipc.mes_dato
  const capital = (t) => t.charAt(0).toUpperCase() + t.slice(1)
  return (
    <section className="pyl-ipc">
      <div className="pyl-ipc-tarjetas">
        <div className="pyl-ipc-tarjeta">
          <span className="pyl-ipc-label">Inflación mensual</span>
          <span className="pyl-ipc-valor">{pct1(g.mensual)}</span>
          <span className="pyl-ipc-sub">{capital(nombreMes(mesDato))}{pp(g.mensual, g.mensual_previo) ? ` (${pp(g.mensual, g.mensual_previo)} vs ${mesPrevioCorto(mesDato)})` : ''}</span>
        </div>
        <div className="pyl-ipc-tarjeta">
          <span className="pyl-ipc-label">Inflación interanual</span>
          <span className="pyl-ipc-valor">{pct1(g.interanual)}</span>
          <span className="pyl-ipc-sub">{capital(nombreMes(mesDato))}{pp(g.interanual, g.interanual_previo) ? ` (${pp(g.interanual, g.interanual_previo)} vs ${mesPrevioCorto(mesDato)})` : ''}</span>
        </div>
      </div>
      {ipc.divisiones.length > 0 && (
        <div className="pyl-ipc-tabla-wrap">
          <table className="pyl-ipc-tabla">
            <thead>
              <tr><th>Cód.</th><th>División del IPC</th><th className="num">Índice</th><th className="num">Var. mensual</th><th className="num">Var. interanual</th><th>vs. nivel general</th></tr>
            </thead>
            <tbody>
              {ipc.divisiones.map((d) => {
                const vs = VS[d.vs_general]
                return (
                  <tr key={d.codigo}>
                    <td>{d.codigo}</td>
                    <td>{d.nombre}</td>
                    <td className="num">{d.indice == null ? '—' : d.indice.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="num">{pct1(d.mensual)}</td>
                    <td className="num">{pct1(d.interanual)}</td>
                    <td>{vs ? <span className={`pyl-ipc-vs ${vs.cls}`}>{vs.ico} {vs.txt}</span> : '—'}</td>
                  </tr>
                )
              })}
              <tr className="general">
                <td>0</td>
                <td>Nivel general</td>
                <td className="num">{g.indice == null ? '—' : g.indice.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="num">{pct1(g.mensual)}</td>
                <td className="num">{pct1(g.interanual)}</td>
                <td>Nacional</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="pyl-ipc-pie">
        IPC de INDEC (nacional, base dic. 2016){mesDato !== mes ? `. ${capital(nombreMes(mes))} todavía no se publicó: se muestra ${nombreMes(mesDato)}, el último dato` : ''}.
        {ipc.divisiones.length > 0 ? ' Las divisiones son las del tipo de local.' : ''}
      </div>
    </section>
  )
}
