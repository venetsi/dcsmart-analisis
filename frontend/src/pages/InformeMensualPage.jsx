// Informe Mensual del cliente (DC Management): editor con la lista de hojas, la
// hoja elegida con sus miniaturas y el panel de datos; descarga en PDF y cierre
// del mes. Los números salen de lib/informeMensual.js (motor puro) y las hojas de
// components/informeMensual/Hojas.jsx; acá solo se juntan las piezas.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../lib/api.js'
import { useGroup } from '../context/GroupContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { msgError } from '../components/reporteVentas/errores.js'
import ConfigCliente from '../components/reporteVentas/ConfigCliente.jsx'
import { HojaIm, MazoIm } from '../components/informeMensual/Hojas.jsx'
import PanelIm, { tituloPagina } from '../components/informeMensual/PanelIm.jsx'
import ListaHojas, { configDeHojas } from '../components/informeMensual/ListaHojas.jsx'
import { armarPorLocal, armarReporte } from '../lib/reporteVentas.js'
import { claveLinea, norm, seccionPorDefecto, subCmv } from '../lib/informe.js'
import { HOJAS_DEFECTO, armarInformeMensual, hojasDe, paginasDe, snapshotIm } from '../lib/informeMensual.js'
import { mesEnPalabrasIm } from '../lib/formatosIm.js'
import '../styles/reporte-editor.css'
import '../styles/informe-editor.css'

const ANCHO = 1456
const ALTO = 819
const ANCHO_MINI = 132

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

// Una hoja que hoy no genera páginas (apagada, sin datos o que no corresponde):
// se puede elegir igual en la lista para cargarle los datos.
function paginaSinDatos(informe, clave) {
  const h = HOJAS_DEFECTO.find((x) => x.clave === clave)
  if (!h) return null
  const l = informe.locales?.[0]
  const base = { clave, titulo: h.titulo, virtual: true }
  if (['local', 'localGrupo', 'seccion'].includes(h.alcance) && l) {
    // Con local: el id del P&L acumulado y del detalle depende de la parte y la sección,
    // así que la observación se carga cuando la hoja ya sale.
    const conParte = h.alcance !== 'local'
    return { ...base, id: `${clave}:${l.local}`, local: l.local, nombre: l.nombre, sinObs: conParte }
  }
  return { ...base, id: clave }
}

// En la tira todas las miniaturas son de la misma hoja: alcanza con el local, la sección y la parte.
function etiquetaCorta(p) {
  const partes = [p.nombre || (p.grupo ? 'Grupo' : ''), p.seccionTitulo].filter(Boolean)
  const base = partes.length ? partes.join(' · ') : p.titulo
  return p.partes > 1 ? `${base} (${p.parte}/${p.partes})` : base
}

const Miniatura = memo(function Miniatura({ pagina, informe, paginas, numero, activa, onElegir }) {
  const escala = ANCHO_MINI / ANCHO
  const etiqueta = tituloPagina(pagina)
  return (
    <button type="button" className={`rve-thumb ime-thumb${activa ? ' on' : ''}`} onClick={() => onElegir(pagina.id)}
      aria-label={`Hoja ${numero}: ${etiqueta}`} aria-current={activa || undefined} title={etiqueta}>
      <span className="rve-thumb-marco" style={{ width: ANCHO_MINI, height: Math.round(ALTO * escala) }}>
        <span className="rve-thumb-hoja" style={{ transform: `scale(${escala})` }} aria-hidden="true">
          <HojaIm pagina={pagina} informe={informe} paginas={paginas} numero={numero} total={paginas.length} />
        </span>
      </span>
      <span className="rve-thumb-et">{numero} · {etiquetaCorta(pagina)}</span>
    </button>
  )
})

function HojaGrande({ pagina, informe, paginas }) {
  const ref = useRef(null)
  const [escala, setEscala] = useState(0.5)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const medir = () => setEscala(Math.min(1, el.clientWidth / ANCHO))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="rve-centro-marco">
      <div className="rve-hoja-caja ime-hoja-caja" style={{ width: ANCHO * escala, height: ALTO * escala }}>
        {pagina.virtual
          ? <div className="ime-sin-hoja">
              <strong>{pagina.titulo}</strong>
              <span>Esta hoja no sale en el PDF este mes. Mirá en la lista de la izquierda por qué; si le faltan datos, cargalos a la derecha.</span>
            </div>
          : <div className="rve-hoja-esc" style={{ transform: `scale(${escala})` }}>
              <HojaIm pagina={pagina} informe={informe} paginas={paginas} />
            </div>}
      </div>
    </div>
  )
}

export default function InformeMensualPage() {
  const { grupo } = useGroup()
  const { user } = useAuth()
  // Equipo DC (igual que el Reporte de Ventas y esInterno del backend).
  const interno = (user?.roles || []).some((r) => r === 'super_admin' || r === 'dcsmart')

  const [clientes, setClientes] = useState(null) // null: todavía no llegaron
  const [clienteId, setClienteId] = useState(null)
  const [mes, setMes] = useState(mesAnterior)
  const [datos, setDatos] = useState(null) // { im, rvData }
  const [sel, setSel] = useState(null) // { id } de una página o { clave } de una hoja
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [config, setConfig] = useState(false)
  const [confirmar, setConfirmar] = useState(null) // 'sinDatos' | 'previo' | 'previo+sinDatos'
  const [imprimir, setImprimir] = useState(null) // { borrador }
  const pedido = useRef(0)
  // Cliente y mes en pantalla: una respuesta de otro cliente o mes (pedida antes de cambiar,
  // por ejemplo al terminar un guardado) se descarta. Se actualiza apenas cambia la pantalla.
  const claveActual = useRef('')
  useLayoutEffect(() => { claveActual.current = `${clienteId}|${mes}` }, [clienteId, mes])

  // ── clientes del grupo ──
  const cargarClientes = useCallback(async (elegir) => {
    if (!grupo) return
    try {
      const lista = await api.imClientes(grupo)
      setClientes(lista)
      setClienteId((act) => elegir ?? (lista.some((c) => c.id === act) ? act : lista[0]?.id ?? null))
    } catch (e) { setClientes([]); setError(msgError(e)) }
  }, [grupo])
  useEffect(() => { setClientes(null); setDatos(null); setClienteId(null); cargarClientes() }, [cargarClientes])

  // ── datos del cliente y mes: informe y Reporte de Ventas en paralelo ──
  const recargar = useCallback(async () => {
    if (!clienteId) return false
    const clave = `${clienteId}|${mes}`
    const mio = ++pedido.current
    const vigente = () => mio === pedido.current && claveActual.current === clave
    try {
      const [im, rvData] = await Promise.all([api.imGet(clienteId, mes), api.rvGet(clienteId, mes)])
      if (vigente()) setDatos({ im, rvData })
      return vigente()
    } catch (e) { if (vigente()) setError(msgError(e)); return false }
  }, [clienteId, mes])
  useEffect(() => { setDatos(null); setError(''); setConfirmar(null); recargar() }, [recargar])

  const informe = useMemo(() => {
    if (!datos) return null
    const { im, rvData } = datos
    const rv = armarReporte({ cliente: rvData.cliente, mes, porLocal: armarPorLocal(rvData), ipc: rvData.ipc || {}, observaciones: {} })
    return armarInformeMensual({ im, rv, mes })
  }, [datos, mes])
  const paginas = useMemo(() => (informe ? paginasDe(informe) : []), [informe])
  const hojas = useMemo(() => (informe ? hojasDe(informe) : []), [informe])

  const pagina = useMemo(() => {
    if (!informe) return null
    if (sel?.id) {
      const p = paginas.find((x) => x.id === sel.id)
      if (p) return p
    }
    const clave = sel?.clave || (sel?.id ? sel.id.split(':')[0] : null)
    if (clave) return paginas.find((x) => x.clave === clave) || paginaSinDatos(informe, clave)
    return paginas[0] || paginaSinDatos(informe, 'portada')
  }, [informe, paginas, sel])
  const numero = pagina && !pagina.virtual ? paginas.findIndex((p) => p.id === pagina.id) + 1 : 0

  const im = datos?.im || null
  const cierre = im?.cierres?.find((c) => c.mes === mes && c.cerrado !== false) || null
  const cerrado = !!cierre
  const previoCerrado = !!im?.cierres?.some((c) => c.mes === moverMes(mes, -1) && c.cerrado !== false)
  const localesSinDatos = (informe?.avisos || []).filter((a) => a.tipo === 'sinDatos').map((a) => informe.locales.find((l) => l.local === a.local)?.nombre || a.local)

  // ── guardar: cada acción llama a la API y vuelve a cargar ──
  const hacer = useCallback(async (fn) => {
    setError('')
    setOcupado(true)
    try { await fn(); await recargar(); return true }
    catch (e) { setError(msgError(e)); await recargar(); return false }
    finally { setOcupado(false) }
  }, [recargar])

  // Los indicadores van en el mismo guardado que las hojas: se manda todo junto.
  const indicadoresActuales = useCallback(() => {
    const locales = informe?.cliente?.locales || []
    return Object.fromEntries(Object.entries(informe?.indicadoresConfig || {}).filter(([l]) => locales.includes(l)))
  }, [informe])

  const acciones = useMemo(() => ({
    valor: ({ local, dato, valor, original }) => hacer(() => api.imPutValor(clienteId, { local, mes, dato, valor, original: original ?? null })),
    linea: (body) => hacer(() => api.imPutLinea(clienteId, { mes, ...body })),
    borrarLinea: (id) => hacer(() => api.imDelLinea(clienteId, id)),
    texto: ({ local, clave, texto }) => hacer(() => api.imPutTexto(clienteId, { local: local || '', mes, clave, texto })),
    obs: (paginaId, texto) => hacer(() => api.imPutObs(clienteId, { mes, pagina: paginaId, texto })),
    razonSocial: (texto) => hacer(async () => { await api.imPutRazonSocial(clienteId, { razon_social: texto || null }); await cargarClientes(clienteId) }),
    indicadores: (local, lista) => hacer(() => api.imPutHojas(clienteId, {
      hojas: configDeHojas(hojasDe(informe)), indicadores: { ...indicadoresActuales(), [local]: lista },
    })),
    // Mover una categoría de sección: regla del grupo para cada rubro / categoría de la
    // línea. La clave de la línea cambia (`seccion|concepto`): con la última regla va el
    // `traslado`, y el servidor pasa a la clave nueva (o borra) las correcciones de la vieja
    // en la misma transacción, para todos los clientes del grupo y los meses abiertos.
    mover: (l, seccion) => hacer(async () => {
      const reglas = im?.reglas || []
      const pares = l.rubros || []
      for (const [i, r] of pares.entries()) {
        // Si ya hay una regla guardada, se usa su escritura: el servidor la busca tal cual.
        const previa = reglas.find((x) => norm(x.rubro) === norm(r.rubro) && norm(x.categoria) === norm(r.categoria))
        const rubro = previa?.rubro ?? r.rubro
        const categoria = previa?.categoria ?? r.categoria
        const concepto = previa?.concepto || null
        const porDefecto = seccionPorDefecto(rubro, categoria) === seccion && !concepto
        const traslado = i === pares.length - 1
          ? { de: l.clave, a: seccion === 'excluido' ? null : claveLinea(seccion, l.concepto), sub: seccion === 'cmv' ? subCmv(rubro) : null }
          : undefined
        await api.imPutRegla({ grupo: informe.cliente.grupo, rubro, categoria, seccion: porDefecto ? null : seccion, concepto, traslado })
      }
    }),
  }), [hacer, clienteId, mes, informe, im, indicadoresActuales, cargarClientes])

  // Lista de hojas: siempre la lista completa (ListaHojas arma el orden de todas).
  const guardarHojas = (lista) => hacer(() => api.imPutHojas(clienteId, { hojas: lista, indicadores: indicadoresActuales() }))

  // ── descarga en PDF ──
  useEffect(() => {
    if (!imprimir || !informe) return undefined
    const anterior = document.title
    document.title = `Informe mensual - ${informe.cliente.nombre} - ${mesEnPalabrasIm(mes)}${imprimir.borrador ? ' (borrador)' : ''}`
    const fin = () => {
      document.title = anterior
      document.body.classList.remove('imprimiendo-im')
      window.removeEventListener('afterprint', fin)
      setImprimir(null)
    }
    window.addEventListener('afterprint', fin)
    document.body.classList.add('imprimiendo-im')
    const t = setTimeout(() => window.print(), 80)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', fin); document.title = anterior; document.body.classList.remove('imprimiendo-im') }
  }, [imprimir])

  // ── cierre: pregunta por los locales sin datos y por el mes anterior abierto ──
  const cerrarMes = async ({ sinDatosOk = false, previoOk = false } = {}) => {
    setConfirmar(null)
    setError('')
    if (localesSinDatos.length && !sinDatosOk) { setConfirmar('sinDatos'); return }
    if (!previoCerrado && !previoOk) { setConfirmar(sinDatosOk ? 'previo+sinDatos' : 'previo'); return }
    await hacer(() => api.imCerrar(clienteId, mes, snapshotIm(informe)))
  }
  const reabrir = () => hacer(() => api.imReabrir(clienteId, mes))

  const sinClientes = clientes && clientes.length === 0
  const hayMas = mes < mesActual()
  const clienteConfig = datos?.rvData?.cliente || clientes?.find((c) => c.id === clienteId) || null

  return (
    <div className="page rve ime">
      <PageHeader
        title="Informe mensual"
        chips={[grupo, informe ? mesEnPalabrasIm(mes) : null]}
        sub="P&L, gastos, cash flow y resumen del mes para el cliente. Se corrige acá y se baja en PDF."
        actions={interno && clienteId && (
          <button type="button" className="btn-sec" onClick={() => setConfig((v) => !v)}>{config ? 'Volver al informe' : 'Configurar'}</button>
        )}
      />

      {error && <div className="rve-error" role="alert">{error}</div>}

      {(config || sinClientes) && interno && (
        <ConfigCliente
          grupo={grupo} cliente={clienteConfig} data={datos?.rvData || null}
          onGuardado={async (id) => { await cargarClientes(id); await recargar() }}
          onCerrar={() => setConfig(false)}
        />
      )}
      {sinClientes && !interno && (
        <div className="rve-aviso">Este grupo todavía no tiene un informe armado. Pedile al equipo DC que lo configure.</div>
      )}
      {clientes === null && <div className="rve-aviso">Cargando…</div>}

      {clienteId && !(config && interno) && (
        <>
          <section className="filters rve-barra">
            <div className="fg">
              <label htmlFor="ime-cli">Cliente</label>
              <select id="ime-cli" value={clienteId} disabled={ocupado} onChange={(e) => { setClienteId(Number(e.target.value)); setSel(null) }}>
                {(clientes || []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>Mes</label>
              <div className="rve-mes">
                <button type="button" className="btn-sec" disabled={ocupado} onClick={() => setMes(moverMes(mes, -1))} aria-label="Mes anterior">‹</button>
                <span>{mesEnPalabrasIm(mes)}</span>
                <button type="button" className="btn-sec" disabled={ocupado || !hayMas} onClick={() => setMes(moverMes(mes, 1))} aria-label="Mes siguiente">›</button>
              </div>
            </div>
            {informe && <span className={`ime-estado${cerrado ? ' cerrado' : ''}`}>{cerrado ? 'Cerrado' : 'Borrador'}</span>}
            <div className="rve-acciones">
              <button type="button" className={cerrado ? 'btn-pri' : 'btn-sec'} disabled={!informe || !paginas.length}
                onClick={() => setImprimir({ borrador: !cerrado })}>{cerrado ? 'Descargar PDF final' : 'Descargar PDF (borrador)'}</button>
              {interno && !cerrado && (
                <button type="button" className="btn-pri" disabled={ocupado || !informe} onClick={() => cerrarMes()}>Cerrar el mes</button>
              )}
              {interno && cerrado && (
                <button type="button" className="btn-sec" disabled={ocupado} onClick={reabrir}>Reabrir el mes</button>
              )}
            </div>
          </section>

          {confirmar === 'sinDatos' && (
            <div className="rve-aviso rve-confirmar" role="alert">
              {localesSinDatos.length === 1 ? 'Este local no tiene' : 'Estos locales no tienen'} ventas ni gastos en {mesEnPalabrasIm(mes)}: <strong>{localesSinDatos.join(', ')}</strong>.
              {' '}En el informe final sus números salen como "—". ¿Cerrar igual?
              <button type="button" className="btn-pri" onClick={() => cerrarMes({ sinDatosOk: true })}>Sí, cerrar así</button>
              <button type="button" className="btn-sec" onClick={() => setConfirmar(null)}>Cancelar</button>
            </div>
          )}
          {(confirmar === 'previo' || confirmar === 'previo+sinDatos') && (
            <div className="rve-aviso rve-confirmar">
              El mes anterior no está cerrado: sus números todavía pueden cambiar y la comparación de {mesEnPalabrasIm(mes)} con él también. ¿Cerrar igual?
              <button type="button" className="btn-pri" onClick={() => cerrarMes({ sinDatosOk: confirmar === 'previo+sinDatos', previoOk: true })}>Sí, cerrar</button>
              <button type="button" className="btn-sec" onClick={() => setConfirmar(null)}>Cancelar</button>
            </div>
          )}
          {cerrado && (
            <div className="rve-cerrado">
              Mes cerrado por {cierre.cerrado_por || '—'}{cierre.cerrado_at ? ` el ${fecha(cierre.cerrado_at)}` : ''}.
              {interno ? ' Los números quedan como estaban al cerrar; los textos, las observaciones y las hojas se pueden cambiar.' : ' No se puede editar.'}
            </div>
          )}

          {!informe && !error && <div className="rve-aviso">Cargando…</div>}

          {informe && pagina && (
            <div className="ime-grid">
              <ListaHojas hojas={hojas} paginas={paginas} claveActiva={pagina.clave} interno={interno} ocupado={ocupado}
                onElegir={(clave) => setSel({ clave })} onGuardar={guardarHojas} />
              <div className="ime-centro">
                <div className="ime-centro-cab">
                  <span>{numero ? `Hoja ${numero} de ${paginas.length}` : 'No sale en el PDF'} · {tituloPagina(pagina)}</span>
                  {ocupado && <span className="ime-guardando">Guardando…</span>}
                </div>
                <HojaGrande pagina={pagina} informe={informe} paginas={paginas} />
                {/* Miniaturas de la hoja elegida (una por local o por parte); las flechas recorren todo el informe. */}
                <div className="ime-tira-fila">
                  <button type="button" className="btn-sec ime-paso" disabled={numero <= 1} onClick={() => setSel({ id: paginas[numero - 2].id })}
                    aria-label="Página anterior del informe" title="Página anterior">‹</button>
                  <nav className="ime-tira" aria-label="Páginas de esta hoja">
                    {paginas.map((p, i) => (p.clave === pagina.clave ? (
                      <Miniatura key={p.id} pagina={p} informe={informe} paginas={paginas} numero={i + 1}
                        activa={p.id === pagina.id} onElegir={(id) => setSel({ id })} />
                    ) : null))}
                  </nav>
                  <button type="button" className="btn-sec ime-paso" disabled={!numero || numero >= paginas.length} onClick={() => setSel({ id: paginas[numero].id })}
                    aria-label="Página siguiente del informe" title="Página siguiente">›</button>
                </div>
              </div>
              <aside className="rve-panel ime-panel">
                <PanelIm informe={informe} im={im} pagina={pagina} interno={interno} cerrado={cerrado}
                  ocupado={ocupado} acciones={acciones} onError={setError} />
              </aside>
            </div>
          )}
        </>
      )}

      {imprimir && informe && createPortal(<MazoIm informe={informe} paginas={paginas} borrador={imprimir.borrador} imprimir />, document.body)}
    </div>
  )
}
