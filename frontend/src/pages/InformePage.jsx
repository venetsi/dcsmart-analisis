import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../lib/api.js'
import { useGroup } from '../context/GroupContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import PageHeader from '../components/PageHeader.jsx'
import TablaDetalle from '../components/informe/TablaDetalle.jsx'
import TablaResumen from '../components/informe/TablaResumen.jsx'
import { armarDiapositivas, ANCHO, ALTO } from '../components/informe/Diapositivas.jsx'
import { comprimirImagen } from '../lib/imagen.js'
import {
  construirInforme, armarResumen, sumarValores, seccionPorDefecto, SECCIONES, EXCLUIDO,
  fmtMonto, fmtPct, nombreMes,
} from '../lib/informe.js'
import { fmtMesLargo } from '../lib/format.js'

// Informe mensual de un local: detalle (P&L editable), resumen (P&L
// acumulado) y presentación. Reemplaza el trabajo de armar a mano la planilla,
// el resumen y las láminas: todo sale de los mismos números.

const CLAVE_LOCAL = 'dcsmart_analytics_informe_local'
const VACIO = { ajustes: {}, manuales: [] }

function mesAnterior() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '')
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '')

// Muestra una lámina de 1456x816 escalada al ancho disponible.
function LaminaEscalada({ children, numero }) {
  const ref = useRef(null)
  const [escala, setEscala] = useState(0.4)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setEscala(el.clientWidth / ANCHO)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="inf-lamina" style={{ height: ALTO * escala }}>
      <div className="inf-lamina-escala" style={{ transform: `scale(${escala})` }}>{children}</div>
      <span className="inf-lamina-num">{numero}</span>
    </div>
  )
}

function Kpi({ label, valor, sub, tono }) {
  return (
    <div className={'inf-kpi' + (tono ? ' ' + tono : '')}>
      <span className="inf-kpi-label">{label}</span>
      <strong className="inf-kpi-valor">{valor}</strong>
      {sub && <span className="inf-kpi-sub">{sub}</span>}
    </div>
  )
}

function EstadoGuardado({ estado, at, cerrado, cerradoPor, cerradoAt }) {
  if (cerrado) return <span className="inf-estado cerrado" title={`Cerrado por ${cerradoPor || '—'}`}>● Mes cerrado el {fecha(cerradoAt)}</span>
  if (estado === 'guardando') return <span className="inf-estado">Guardando…</span>
  if (estado === 'pendiente') return <span className="inf-estado">Cambios sin guardar…</span>
  if (estado === 'error') return <span className="inf-estado error">No se pudo guardar. Reintentá.</span>
  return <span className="inf-estado ok">✓ Guardado{at ? ` ${hora(at)}` : ''}</span>
}

export default function InformePage() {
  const { grupo } = useGroup()
  const { user } = useAuth()
  const [locales, setLocales] = useState([])
  const [local, setLocal] = useState(() => { try { return localStorage.getItem(CLAVE_LOCAL) || '' } catch { return '' } })
  const [mes, setMes] = useState(mesAnterior)
  const [data, setData] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [datos, setDatos] = useState(VACIO)
  const [estado, setEstado] = useState('ok')
  const [guardadoAt, setGuardadoAt] = useState(null)
  const [tab, setTab] = useState('detalle')
  const [confirmarCierre, setConfirmarCierre] = useState(false)
  const [panelLocal, setPanelLocal] = useState(false)
  const recienCargado = useRef(true)

  // Locales del grupo.
  useEffect(() => {
    if (!grupo) return
    api.getDatasetOptions('pagos', { grupo }).then((o) => {
      const ls = o?.local || []
      setLocales(ls)
      setLocal((act) => (ls.includes(act) ? act : ls[0] || ''))
    }).catch((e) => setError(e.message))
  }, [grupo])

  useEffect(() => { try { if (local) localStorage.setItem(CLAVE_LOCAL, local) } catch { /* privado */ } }, [local])

  const cargar = useCallback(() => {
    if (!grupo || !local || !mes) return
    setCargando(true); setError('')
    api.getInforme({ grupo, local, mes }).then((d) => {
      recienCargado.current = true
      setData(d)
      setDatos({ ...VACIO, ...(d.guardado?.datos || {}) })
      setGuardadoAt(d.guardado?.actualizado_at || null)
      setEstado('ok')
    }).catch((e) => setError(e.message)).finally(() => setCargando(false))
  }, [grupo, local, mes])
  useEffect(() => { cargar() }, [cargar])

  const cerrado = !!data?.guardado?.cerrado

  // Guardado automático: un segundo después del último cambio.
  useEffect(() => {
    if (!data || cerrado) return
    if (recienCargado.current) { recienCargado.current = false; return }
    setEstado('pendiente')
    const t = setTimeout(() => {
      setEstado('guardando')
      api.guardarInforme({ grupo, local, mes, datos })
        .then((r) => { setEstado('ok'); setGuardadoAt(r.actualizado_at) })
        .catch((e) => { setEstado('error'); setError(e.message) })
    }, 1000)
    return () => clearTimeout(t)
  }, [datos]) // eslint-disable-line react-hooks/exhaustive-deps

  // Números. Un mes cerrado muestra lo que se congeló al cerrarlo.
  const informe = useMemo(() => {
    if (!data) return null
    if (cerrado && data.guardado?.snapshot?.informe) return data.guardado.snapshot.informe
    return construirInforme({ auto: data.auto, reglas: data.reglas, datos })
  }, [data, datos, cerrado])

  const anio = useMemo(() => {
    if (!data || !informe) return null
    const previos = data.anio.filter((m) => m.cerrado && m.valores)
    const faltan = []
    const [y, m] = mes.split('-').map(Number)
    for (let i = 1; i < m; i++) {
      const k = `${y}-${String(i).padStart(2, '0')}`
      if (!previos.some((p) => p.mes === k)) faltan.push(k)
    }
    return { valores: sumarValores([...previos.map((p) => p.valores), informe.valores]), cerrados: previos.length, faltan }
  }, [data, informe, mes])

  const rMes = useMemo(() => (informe ? armarResumen(informe.valores) : null), [informe])
  const rAnio = useMemo(() => (anio ? armarResumen(anio.valores) : null), [anio])

  // ── edición ──
  const ajustar = (clave, patch) => setDatos((d) => ({ ...d, ajustes: { ...d.ajustes, [clave]: { ...(d.ajustes?.[clave] || {}), ...patch } } }))
  const restaurar = (clave) => setDatos((d) => {
    const { col1, col2, ...resto } = d.ajustes?.[clave] || {} // eslint-disable-line no-unused-vars
    return { ...d, ajustes: { ...d.ajustes, [clave]: resto } }
  })
  const ocultar = (clave, oculto) => ajustar(clave, { oculto })
  const manualAgregar = (seccion) => setDatos((d) => ({ ...d, manuales: [...(d.manuales || []), { id: nuevoId(), seccion, concepto: '', col1: 0, col2: 0 }] }))
  const manualCambio = (id, patch) => setDatos((d) => ({ ...d, manuales: d.manuales.map((m) => (m.id === id ? { ...m, ...patch } : m)) }))
  const manualBorrar = (id) => setDatos((d) => ({ ...d, manuales: d.manuales.filter((m) => m.id !== id) }))
  const setCampo = (k, v) => setDatos((d) => ({ ...d, [k]: v }))
  // Copia las líneas a mano del mes anterior (mismo concepto y sección, montos incluidos: se corrigen encima).
  const copiarPrevio = () => setDatos((d) => ({ ...d, manuales: [...(d.manuales || []), ...(data?.mesPrevio?.manuales || []).map((m) => ({ ...m, id: nuevoId() }))] }))

  // Mover una categoría de gestión a otra sección: regla del grupo.
  const mover = async (pares, seccion) => {
    try {
      const nuevas = [...(data.reglas || [])]
      for (const { rubro, categoria } of pares) {
        const porDefecto = seccionPorDefecto(rubro, categoria) === seccion
        await api.guardarRegla({ grupo, rubro, categoria, seccion: porDefecto ? null : seccion })
        const i = nuevas.findIndex((r) => r.rubro === rubro && r.categoria === categoria)
        if (i >= 0) nuevas.splice(i, 1)
        if (!porDefecto) nuevas.push({ rubro, categoria, seccion })
      }
      setData((d) => ({ ...d, reglas: nuevas }))
    } catch (e) { setError(e.message) }
  }

  const cerrarMes = async () => {
    setConfirmarCierre(false)
    try {
      await api.cerrarInforme({ grupo, local, mes, datos, snapshot: { informe, valores: informe.valores, datos } })
      cargar()
    } catch (e) { setError(e.message) }
  }
  const reabrir = async () => {
    try { await api.reabrirInforme({ grupo, local, mes }); cargar() } catch (e) { setError(e.message) }
  }

  // ── presentación ──
  const diapositivas = useMemo(() => {
    if (!informe || !rMes || !rAnio) return []
    return armarDiapositivas({ mes, informe, rMes, rAnio, localInfo: data.local, local, vma: datos.vma, ipc: datos.ipc })
  }, [informe, rMes, rAnio, mes, data, local, datos.vma, datos.ipc])

  const descargarPdf = () => {
    const anterior = document.title
    document.title = `Informe ${nombreMes(mes)} ${mes.slice(0, 4)} - ${data?.local?.razon_social || local}`
    const volver = () => { document.title = anterior; window.removeEventListener('afterprint', volver) }
    window.addEventListener('afterprint', volver)
    document.body.classList.add('imprimiendo-informe')
    setTimeout(() => { window.print(); document.body.classList.remove('imprimiendo-informe') }, 50)
  }

  const avisoCaja = informe?.avisos.find((a) => a.tipo === 'caja')
  const otrosAvisos = informe?.avisos.filter((a) => a.tipo !== 'caja') || []

  return (
    <div className="page informe">
      <PageHeader
        title="Informe Mensual"
        chips={[grupo, local && local !== grupo ? local : null, fmtMesLargo(mes)]}
        sub="El P&L del mes con la estructura de siempre, el resumen acumulado y la presentación lista para descargar."
        actions={data && (
          <>
            <EstadoGuardado estado={estado} at={guardadoAt} cerrado={cerrado} cerradoPor={data.guardado?.cerrado_por} cerradoAt={data.guardado?.cerrado_at} />
            {!cerrado && !confirmarCierre && <button className="btn-sec" onClick={() => setConfirmarCierre(true)} title="Congela los números del mes para el acumulado y la presentación">Cerrar mes</button>}
            {!cerrado && confirmarCierre && (
              <span className="inf-confirmar">
                ¿Cerrar {nombreMes(mes)}? Los números quedan congelados.
                <button className="btn-pri" onClick={cerrarMes}>Sí, cerrar</button>
                <button className="btn-sec" onClick={() => setConfirmarCierre(false)}>Cancelar</button>
              </span>
            )}
            {cerrado && user?.admin && <button className="btn-sec" onClick={reabrir}>Reabrir mes</button>}
          </>
        )}
      />

      <section className="filters inf-filtros">
        <div className="fg">
          <label htmlFor="inf-local">Local</label>
          <select id="inf-local" value={local} onChange={(e) => setLocal(e.target.value)} disabled={!locales.length}>
            {!locales.length && <option>Cargando…</option>}
            {locales.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="fg">
          <label htmlFor="inf-mes">Mes</label>
          <input id="inf-mes" type="month" value={mes} max={new Date().toISOString().slice(0, 7)} onChange={(e) => e.target.value && setMes(e.target.value)} />
        </div>
        <div className="fg inf-chico">
          <label htmlFor="inf-dias" title="Días con venta. Sale de las cajas; corregilo si hace falta.">Días</label>
          <input id="inf-dias" inputMode="numeric" disabled={cerrado} placeholder={String(data?.auto?.ventas?.dias ?? '')} value={datos.dias ?? ''} onChange={(e) => setCampo('dias', e.target.value === '' ? undefined : Number(e.target.value.replace(/\D/g, '')))} />
        </div>
        <div className="fg inf-chico">
          <label htmlFor="inf-pax" title="Comensales del mes. Sale de las cajas; corregilo si hace falta.">PAX</label>
          <input id="inf-pax" inputMode="numeric" disabled={cerrado} placeholder={String(data?.auto?.ventas?.comensales ?? '')} value={datos.pax ?? ''} onChange={(e) => setCampo('pax', e.target.value === '' ? undefined : Number(e.target.value.replace(/\D/g, '')))} />
        </div>
        <div className="fg inf-chico">
          <label htmlFor="inf-vma">VMA</label>
          <input id="inf-vma" maxLength={20} disabled={cerrado} placeholder="N/A" value={datos.vma ?? ''} onChange={(e) => setCampo('vma', e.target.value)} />
        </div>
        <div className="fg inf-chico">
          <label htmlFor="inf-ipc">IPC</label>
          <input id="inf-ipc" maxLength={20} disabled={cerrado} placeholder="N/A" value={datos.ipc ?? ''} onChange={(e) => setCampo('ipc', e.target.value)} />
        </div>
      </section>

      {error && <div className="inf-error" role="alert">{error} <button onClick={() => setError('')} aria-label="Cerrar">×</button></div>}
      {cargando && !data && <div className="inf-cargando">Trayendo los números de {local}…</div>}

      {informe && rMes && (
        <>
          <div className="inf-kpis">
            <Kpi label="Ventas" valor={`$ ${fmtMonto(rMes.indicadores.venta)}`} sub={`${fmtMonto(rMes.indicadores.pax)} PAX · ${fmtMonto(rMes.indicadores.dias)} días`} />
            <Kpi label="CMV" valor={fmtPct(rMes.indicadores.cmvPct)} sub={`$ ${fmtMonto(informe.totales.cmv.total)}`} />
            <Kpi label="Labor" valor={fmtPct(rMes.indicadores.laborPct)} />
            <Kpi label="EERR" valor={fmtPct(rMes.indicadores.eerrPct)} sub={`$ ${fmtMonto(informe.totales.resultadoEconomico.total)}`} tono={informe.totales.resultadoEconomico.total < 0 ? 'rojo' : 'verde'} />
            <Kpi label={`Resultado ${nombreMes(mes)}`} valor={`$ ${fmtMonto(informe.totales.resultadoFinal.total)}`} tono={informe.totales.resultadoFinal.total < 0 ? 'rojo' : 'verde'} />
          </div>

          <div className="inf-tabs" role="tablist">
            {[['detalle', '1 · Detalle'], ['resumen', '2 · Resumen'], ['presentacion', '3 · Presentación']].map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>

          {tab === 'detalle' && (
            <>
              {!cerrado && !(datos.manuales || []).length && data.mesPrevio?.manuales?.length > 0 && (
                <div className="inf-aviso caja inf-copiar">
                  <strong>¿Arrancás con lo de {nombreMes(data.mesPrevio.mes)}?</strong>
                  <span>El mes anterior se cargaron {data.mesPrevio.manuales.length} línea(s) a mano ({data.mesPrevio.manuales.slice(0, 4).map((m) => m.concepto || 'sin nombre').join(', ')}{data.mesPrevio.manuales.length > 4 ? '…' : ''}). Copialas y corregí los montos.</span>
                  <div><button className="btn-pri" onClick={copiarPrevio}>Copiar {data.mesPrevio.manuales.length} línea(s)</button></div>
                </div>
              )}
              {(avisoCaja || otrosAvisos.length > 0) && !cerrado && (
                <div className="inf-avisos">
                  {avisoCaja && (
                    <div className="inf-aviso caja">
                      <strong>Efectivo de caja a repartir</strong>
                      <span>Gestión registra <b>$ {fmtMonto(avisoCaja.cajaGastos)}</b> de gastos pagados con la caja, sin detalle. Cargalos en la columna 2 de cada sección.</span>
                      <div className="inf-barra"><span style={{ width: `${Math.min(100, (avisoCaja.cargadoCol2 / avisoCaja.cajaGastos) * 100)}%` }} /></div>
                      <small>Cargado: $ {fmtMonto(avisoCaja.cargadoCol2)} · Falta: $ {fmtMonto(Math.max(0, avisoCaja.cajaGastos - avisoCaja.cargadoCol2))}</small>
                    </div>
                  )}
                  {otrosAvisos.map((a, i) => <div key={i} className="inf-aviso">{a.texto}</div>)}
                </div>
              )}
              <TablaDetalle
                informe={informe} mes={mes} editable={!cerrado}
                onAjuste={ajustar} onRestaurar={restaurar} onOcultar={ocultar}
                onMover={(l, seccion) => mover(l.rubros, seccion)}
                onManualAgregar={manualAgregar} onManualCambio={manualCambio} onManualBorrar={manualBorrar}
              />
              {informe.excluidos?.length > 0 && (
                <details className="inf-excluidos">
                  <summary>Fuera del P&amp;L: {informe.excluidos.length} movimiento(s) de fondos · $ {fmtMonto(informe.excluidos.reduce((a, e) => a + e.total, 0))}</summary>
                  <p>Retiros de Caja Mayor, aportes y movimientos entre cuentas no son gasto. Si alguno sí lo es, mandalo a su sección.</p>
                  <table>
                    <tbody>
                      {informe.excluidos.map((e, i) => (
                        <tr key={i}>
                          <td>{e.rubro} / {e.categoria}</td><td className="dt-num">$ {fmtMonto(e.total)}</td>
                          <td>{!cerrado && (
                            <select value={EXCLUIDO} aria-label="Incluir en una sección" onChange={(ev) => mover([{ rubro: e.rubro, categoria: e.categoria }], ev.target.value)}>
                              <option value={EXCLUIDO}>No va en el P&amp;L</option>
                              {SECCIONES.filter((s) => s.key !== 'ventas').map((s) => <option key={s.key} value={s.key}>{s.num} {s.titulo}</option>)}
                            </select>
                          )}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </>
          )}

          {tab === 'resumen' && rAnio && (
            <div className="inf-resumen">
              <p className="inf-nota">
                Acumulado {mes.slice(0, 4)}: {anio.cerrados ? `${anio.cerrados} mes(es) cerrado(s) + ` : ''}{nombreMes(mes)}.
                {anio.faltan.length > 0 && <> Faltan cerrar: {anio.faltan.map((m) => nombreMes(m)).join(', ')} (no suman al acumulado).</>}
              </p>
              <TablaResumen mes={mes} rMes={rMes} rAnio={rAnio} vma={datos.vma} ipc={datos.ipc} />
            </div>
          )}

          {tab === 'presentacion' && (
            <div className="inf-presentacion">
              <div className="inf-pres-barra">
                <button className="btn-pri" onClick={descargarPdf} title="Se abre la ventana de impresión: elegí 'Guardar como PDF'">Descargar PDF</button>
                <button className="btn-sec" onClick={() => setPanelLocal(true)}>Logo, foto y razón social</button>
                <span className="inf-nota">{diapositivas.length} láminas · se arman solas con los números del detalle</span>
              </div>
              {!data.local?.razon_social && <div className="inf-aviso">Falta la razón social del local: se muestra el nombre. Cargala en "Logo, foto y razón social".</div>}
              <div className="inf-laminas">
                {diapositivas.map((d, i) => <LaminaEscalada key={i} numero={i + 1}>{d}</LaminaEscalada>)}
              </div>
            </div>
          )}
        </>
      )}

      {panelLocal && data && (
        <PanelLocal
          grupo={grupo} local={local} info={data.local}
          onCerrar={() => setPanelLocal(false)}
          onGuardado={(info) => setData((d) => ({ ...d, local: { ...d.local, ...info } }))}
        />
      )}

      {tab === 'presentacion' && diapositivas.length > 0 && createPortal(<div className="deck-print">{diapositivas}</div>, document.body)}
    </div>
  )
}

function PanelLocal({ grupo, local, info, onCerrar, onGuardado }) {
  const [razon, setRazon] = useState(info?.razon_social || '')
  const [guardando, setGuardando] = useState('')
  const [error, setError] = useState('')

  const guardar = async (patch, que) => {
    setGuardando(que); setError('')
    try {
      await api.guardarLocalInforme({ grupo, local, ...patch })
      onGuardado(patch)
    } catch (e) { setError(e.message) } finally { setGuardando('') }
  }
  const subir = async (e, campo) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const dataUrl = await comprimirImagen(f, campo === 'logo' ? { maxLado: 900, tipo: 'image/png' } : { maxLado: 1600 })
      await guardar({ [campo]: dataUrl }, campo)
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="inf-panel-fondo" onMouseDown={onCerrar}>
      <aside className="inf-panel" onMouseDown={(e) => e.stopPropagation()} aria-label="Datos del local para la presentación">
        <header><h3>{local} en la presentación</h3><button className="dt-ico" onClick={onCerrar} aria-label="Cerrar">×</button></header>
        <p className="inf-nota">Se cargan una vez y quedan para todos los meses.</p>

        <label className="inf-campo">
          <span>Razón social</span>
          <input value={razon} maxLength={120} placeholder="Ej. LORETO GARDEN BAR SOCIEDAD SIMPLE" onChange={(e) => setRazon(e.target.value)} />
          <small>{razon.length}/120 · aparece en la portada y en los separadores</small>
        </label>
        <button className="btn-pri" disabled={guardando === 'razon' || razon === (info?.razon_social || '')} onClick={() => guardar({ razon_social: razon }, 'razon')}>
          {guardando === 'razon' ? 'Guardando…' : 'Guardar razón social'}
        </button>

        {[['logo', 'Logo del local', 'PNG con fondo transparente queda mejor. Va en la portada y en el P&L acumulado.'], ['foto', 'Foto del local', 'Va al lado de los principales indicadores.']].map(([campo, titulo, ayuda]) => (
          <div key={campo} className="inf-imagen">
            <span className="inf-imagen-titulo">{titulo}</span>
            <div className={'inf-imagen-prev ' + campo}>{info?.[campo] ? <img src={info[campo]} alt={titulo} /> : <span>Sin {campo}</span>}</div>
            <small>{ayuda}</small>
            <div className="inf-imagen-acciones">
              <label className="btn-sec">
                {guardando === campo ? 'Subiendo…' : info?.[campo] ? 'Cambiar' : 'Subir'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => subir(e, campo)} />
              </label>
              {info?.[campo] && <button className="btn-sec" onClick={() => guardar({ [campo]: null }, campo)}>Quitar</button>}
            </div>
          </div>
        ))}
        {error && <div className="inf-error" role="alert">{error}</div>}
      </aside>
    </div>
  )
}
