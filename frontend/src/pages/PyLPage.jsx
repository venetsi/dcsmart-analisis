import { useCallback, useEffect, useMemo, useState } from 'react'
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
  const abrirTodo = () => setAbiertas(todasAbiertas ? new Set() : new Set(pyl.secciones.map(s => s.key)))

  const ticketProm = pyl?.ventas.tickets ? t.ventas / pyl.ventas.tickets : null
  const cubiertoProm = pyl?.ventas.comensales ? t.ventas / pyl.ventas.comensales : null
  const labor = pyl?.secciones.find(s => s.labor)?.total || 0

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
                <span className="pyl-kpi-label">Resultado económico</span>
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
              <span className="pyl-tira-label">Gastos operativos</span>
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
              <span className="pyl-tira-label">Resultado del mes</span>
              <span className={`pyl-tira-val ${t.resultadoMes >= 0 ? 'pos' : 'neg'}`}>{fmtPesosCorto(t.resultadoMes)}</span>
              <span className="pyl-tira-sub">después de préstamos</span>
            </div>
          </section>

          <section className="pyl-graficos">
            <div className="pyl-card pyl-card-oscura">
              <div className="pyl-card-titulo">De las ventas al resultado</div>
              <div className="pyl-card-sub">Cada barra coral es un gasto que se resta. Arriba, el % sobre las ventas.</div>
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
              <div className="pyl-card-sub">Cada gasto operativo como % de lo vendido, y lo que queda.</div>
              {reparto && (
                <Barras
                  filas={reparto.filas}
                  max={t.ventas}
                  color={C_GASTO}
                  total={
                    <div className={`pyl-queda ${reparto.resultado.valor >= 0 ? 'pos' : 'neg'}`}>
                      <span>{reparto.resultado.valor >= 0 ? 'Queda de resultado' : 'Los gastos superan las ventas'}</span>
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
                <div className="pyl-card-sub">Tocá un rubro para ver sus categorías.</div>
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
                  <tr className="fila-ventas">
                    <td>Ventas</td>
                    <td className="num">{fmtPesos(t.ventas)}</td>
                    <td className="num col-pct"><Pct v={100} /></td>
                    <td className="num">{fmtPesos(pyl.ventas.fiscal)}</td>
                    <td className="num">{fmtPesos(pyl.ventas.efectivo)}</td>
                  </tr>
                  {pyl.ventas.por_origen.map((o) => (
                    <tr className="fila-cat" key={o.origen}>
                      <td>{o.origen}</td>
                      <td className="num">{fmtPesos(o.total)}</td>
                      <td className="num col-pct"><Pct v={pyl.pct(o.total)} /></td>
                      <td className="num">{fmtPesos(o.fiscal)}</td>
                      <td className="num">{fmtPesos(o.efectivo)}</td>
                    </tr>
                  ))}

                  {pyl.operativas.map((s) => (
                    <Seccion key={s.key} s={s} pyl={pyl} abierta={tieneSeccion(s.key)} onToggle={() => alternar(s.key)}
                      despues={s.cmv ? <Resultado cls="bruto" label="Resultado bruto" val={t.resultadoBruto} pct={pyl.pct(t.resultadoBruto)} /> : null} />
                  ))}
                  <Resultado cls={`econ ${t.resultadoEconomico >= 0 ? 'pos' : 'neg'}`} label="Resultado económico" val={t.resultadoEconomico} pct={t.margenPct} />

                  {pyl.noOperativas.length > 0 && (
                    <tr className="fila-linea"><td colSpan={5}>Debajo de la línea · movimientos que no son gasto del negocio</td></tr>
                  )}
                  {pyl.noOperativas.map((s) => (
                    <Seccion key={s.key} s={s} pyl={pyl} memo abierta={tieneSeccion(s.key)} onToggle={() => alternar(s.key)} />
                  ))}
                  {pyl.noOperativas.some(s => s.fin) && (
                    <Resultado cls={`final ${t.resultadoMes >= 0 ? 'pos' : 'neg'}`} label="Resultado del mes (después de préstamos)" val={t.resultadoMes} pct={pyl.pct(t.resultadoMes)} />
                  )}
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

function Seccion({ s, pyl, memo, abierta, onToggle, despues }) {
  return (
    <>
      <tr className={`fila-sec${memo ? ' memo' : ''}${abierta ? ' abierta' : ''}`} onClick={onToggle}>
        <td>
          <button type="button" className="pyl-toggle" aria-expanded={abierta}>
            <span className="chev"><IcoChevron /></span>{s.titulo}
            <span className="pyl-cuenta">{s.lineas.length}</span>
          </button>
        </td>
        <td className="num">{fmtPesos(s.total)}</td>
        <td className="num col-pct"><Pct v={pyl.pct(s.total)} /></td>
        <td className="num">{fmtPesos(s.fiscal)}</td>
        <td className="num">{fmtPesos(s.efectivo)}</td>
      </tr>
      {abierta && s.lineas.map((l, i) => (
        <tr className="fila-cat" key={l.rubro + l.categoria + i}>
          <td>{l.categoria}{s.cajon ? <span className="pyl-rubro"> · {l.rubro}</span> : ''}</td>
          <td className="num">{fmtPesos(l.total)}</td>
          <td className="num col-pct"><Pct v={pyl.pct(l.total)} /></td>
          <td className="num">{fmtPesos(l.fiscal)}</td>
          <td className="num">{fmtPesos(l.efectivo)}</td>
        </tr>
      ))}
      {despues}
    </>
  )
}

function Resultado({ cls, label, val, pct }) {
  return (
    <tr className={`fila-res ${cls}`}>
      <td>{label}</td>
      <td className="num"><span className="pyl-res-val">{fmtPesos(val)}</span></td>
      <td className="num col-pct">{fmtPct(pct)}</td>
      <td /><td />
    </tr>
  )
}
