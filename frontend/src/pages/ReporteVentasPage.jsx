// Reporte de Ventas mensual para el cliente: editor con las hojas, de dónde sale
// cada número, corrección a mano, descarga en PDF y cierre del mes.
// El armado de los números vive en lib/reporteVentas.js; acá solo se juntan las piezas.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { useGroup } from '../context/GroupContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { Hoja, mesEnPalabras } from '../components/reporteVentas/Paginas.jsx'
import { msgError } from '../components/reporteVentas/errores.js'
import PanelDatos from '../components/reporteVentas/PanelDatos.jsx'
import { armarLocal, armarReporte, canalesAuto } from '../lib/reporteVentas.js'
import '../styles/reporte-editor.css'

const ANCHO = 1456
const ALTO = 819
const ANCHO_MINI = 150

function mesAnterior() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function moverMes(mes, delta) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const mesActual = () => moverMes(mesAnterior(), 1)
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '')

// Datos de la API → un LocalMes por local, con los canales automáticos de cada mes.
function armarPorLocal(data) {
  const porLocal = {}
  for (const local of data.cliente.locales) {
    const a = data.auto[local]
    if (!a) continue
    const reglas = data.reglas.filter((r) => r.local === local)
    const meses = new Set([...Object.keys(a.detalles), ...Object.keys(a.cajasOrigen)])
    const canales = {}
    // Mayor a menor: el orden de BigQuery no es estable entre consultas.
    for (const m of meses) {
      canales[m] = canalesAuto({ detalles: a.detalles[m], cajasOrigen: a.cajasOrigen[m], reglas })
        .sort((x, y) => (y.valor ?? 0) - (x.valor ?? 0) || x.nombre.localeCompare(y.nombre))
    }
    porLocal[local] = armarLocal({
      local, mes: data.mes, auto: { meses: a.meses, canales }, valores: data.valores, cierres: data.cierres,
    })
  }
  return porLocal
}

// Miniatura: la hoja real escalada con CSS.
const Miniatura = memo(function Miniatura({ pagina, reporte, numero, etiqueta, activa, onElegir }) {
  const escala = ANCHO_MINI / ANCHO
  return (
    <button type="button" className={`rve-thumb${activa ? ' on' : ''}`} onClick={() => onElegir(pagina.id)} aria-label={`Hoja ${numero}: ${etiqueta}`} aria-current={activa}>
      <span className="rve-thumb-marco" style={{ width: ANCHO_MINI, height: Math.round(ALTO * escala) }}>
        <span className="rve-thumb-hoja" style={{ transform: `scale(${escala})` }} aria-hidden="true">
          <Hoja pagina={pagina} reporte={reporte} numero={numero} />
        </span>
      </span>
      <span className="rve-thumb-et">{numero} · {etiqueta}</span>
    </button>
  )
})

// La hoja elegida, escalada al ancho disponible.
function HojaGrande({ pagina, reporte }) {
  const ref = useRef(null)
  const [escala, setEscala] = useState(0.6)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setEscala(Math.min(1, el.clientWidth / ANCHO))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="rve-centro-marco">
      <div className="rve-hoja-caja" style={{ width: ANCHO * escala, height: ALTO * escala }}>
        <div className="rve-hoja-esc" style={{ transform: `scale(${escala})` }}>
          <Hoja pagina={pagina} reporte={reporte} />
        </div>
      </div>
    </div>
  )
}

export default function ReporteVentasPage() {
  const { grupo } = useGroup()
  const { user } = useAuth()
  const interno = (user?.roles || []).some((r) => r === 'super_admin' || r === 'dcsmart')

  const [clientes, setClientes] = useState(null) // null: todavía no llegaron
  const [clienteId, setClienteId] = useState(null)
  const [mes, setMes] = useState(mesAnterior)
  const [data, setData] = useState(null)
  const [paginaId, setPaginaId] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState(null) // 'restaurar'
  const pedido = useRef(0)

  // ── clientes del grupo ──
  const cargarClientes = useCallback(async (elegir) => {
    if (!grupo) return
    try {
      const lista = await api.rvClientes(grupo)
      setClientes(lista)
      setClienteId((act) => elegir ?? (lista.some((c) => c.id === act) ? act : lista[0]?.id ?? null))
    } catch (e) { setClientes([]); setError(msgError(e)) }
  }, [grupo])
  useEffect(() => { setClientes(null); setData(null); setClienteId(null); cargarClientes() }, [cargarClientes])

  // ── datos del cliente y mes ──
  const recargar = useCallback(async () => {
    if (!clienteId) return
    const mio = ++pedido.current
    try {
      const d = await api.rvGet(clienteId, mes)
      if (mio === pedido.current) setData(d)
    } catch (e) { if (mio === pedido.current) setError(msgError(e)) }
  }, [clienteId, mes])
  useEffect(() => { setData(null); setError(''); setConfirmar(null); recargar() }, [recargar])

  const nombreLocal = useCallback((l) => data?.cliente?.nombres?.[l] || l, [data])

  const reporte = useMemo(() => {
    if (!data) return null
    return armarReporte({ cliente: data.cliente, mes: data.mes, porLocal: armarPorLocal(data), hoy: new Date() })
  }, [data])

  const pagina = useMemo(() => {
    if (!reporte) return null
    return reporte.paginas.find((p) => p.id === paginaId)
      || reporte.paginas.find((p) => p.tipo === 'mes') || reporte.paginas[0]
  }, [reporte, paginaId])

  const cierre = data?.cierres.find((c) => c.mes === mes) || null
  const cerrado = !!cierre
  const puedeEditar = interno && !cerrado

  const etiquetaHoja = (p) => {
    const n = p.local ? nombreLocal(p.local) : ''
    return { portada: 'Portada', consolidado: 'Consolidado', mes: `${n} · mes`, historico: `${n} · histórico`,
      delivery: `${n} · delivery`, contraportada: 'Contraportada' }[p.tipo]
  }

  // ── guardar un dato ──
  const guardar = useCallback(async ({ local, mes: m, dato, valor, original }) => {
    setError('')
    setOcupado(true)
    try {
      await api.rvPutValor(clienteId, { local, mes: m, dato, valor, original })
      await recargar()
      return true
    } catch (e) { setError(msgError(e)); return false } finally { setOcupado(false) }
  }, [clienteId, recargar])

  const restaurar = async () => {
    setConfirmar(null)
    setError('')
    setOcupado(true)
    try {
      await api.rvRestaurar(clienteId, mes)
      await recargar()
    } catch (e) {
      setError(e?.status === 409 ? 'El mes está cerrado. Reabrilo para restaurar los valores.' : msgError(e))
    } finally { setOcupado(false) }
  }

  const sinClientes = clientes && clientes.length === 0
  const hayMas = mes < mesActual()

  return (
    <div className="page rve">
      <PageHeader
        title="Reporte de Ventas"
        chips={[grupo, data ? mesEnPalabras(mes) : null]}
        sub="El reporte mensual del cliente: cada número dice de dónde sale, se puede corregir y se baja en PDF."
      />

      {error && <div className="rve-error" role="alert">{error}</div>}

      {sinClientes && (
        <div className="rve-aviso">Este grupo todavía no tiene un reporte armado. Pedile al equipo DC que lo configure.</div>
      )}

      {clientes === null && <div className="rve-aviso">Cargando…</div>}

      {clienteId && (
        <>
          <section className="filters rve-barra">
            <div className="fg">
              <label htmlFor="rve-cli">Cliente</label>
              <select id="rve-cli" value={clienteId} onChange={(e) => setClienteId(Number(e.target.value))}>
                {(clientes || []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>Mes</label>
              <div className="rve-mes">
                <button type="button" className="btn-sec" onClick={() => setMes(moverMes(mes, -1))} aria-label="Mes anterior">‹</button>
                <span>{mesEnPalabras(mes)}</span>
                <button type="button" className="btn-sec" disabled={!hayMas} onClick={() => setMes(moverMes(mes, 1))} aria-label="Mes siguiente">›</button>
              </div>
            </div>
            <div className="rve-acciones">
              {puedeEditar && !confirmar && (
                <button type="button" className="btn-sec" disabled={ocupado || !data} onClick={() => setConfirmar('restaurar')}>Restaurar originales</button>
              )}
            </div>
          </section>

          {confirmar === 'restaurar' && (
            <div className="rve-aviso rve-confirmar">
              ¿Volver todos los datos de {mesEnPalabras(mes)} a sus valores originales? Las correcciones a mano se pierden (queda registro en el historial).
              <button type="button" className="btn-pri" onClick={restaurar}>Sí, restaurar</button>
              <button type="button" className="btn-sec" onClick={() => setConfirmar(null)}>No</button>
            </div>
          )}
          {cerrado && (
            <div className="rve-cerrado">
              Mes cerrado por {cierre.cerrado_por || '—'}{cierre.cerrado_at ? ` el ${fecha(cierre.cerrado_at)}` : ''}. No se puede editar.
            </div>
          )}

          {!data && !error && <div className="rve-aviso">Cargando…</div>}

          {reporte && pagina && (
            <div className="rve-grid">
              <nav className="rve-thumbs" aria-label="Hojas del reporte">
                {reporte.paginas.map((p, i) => (
                  <Miniatura key={p.id} pagina={p} reporte={reporte} numero={i + 1} etiqueta={etiquetaHoja(p)}
                    activa={p.id === pagina.id} onElegir={setPaginaId} />
                ))}
              </nav>
              <div className="rve-centro">
                <HojaGrande pagina={pagina} reporte={reporte} />
              </div>
              <aside className="rve-panel">
                <PanelDatos reporte={reporte} pagina={pagina} data={data} puedeEditar={puedeEditar} cerradoMes={cerrado}
                  ocupado={ocupado} onGuardar={guardar} onError={setError} nombreLocal={nombreLocal} />
              </aside>
            </div>
          )}
        </>
      )}

    </div>
  )
}
