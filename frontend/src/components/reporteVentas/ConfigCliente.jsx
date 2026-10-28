// Configuración del Reporte de Ventas: qué locales forman el cliente, cómo se llaman
// en el reporte y a qué canal va cada método de cobro u origen de caja.
// Solo lista lo que trajo la consulta del mes: no inventa métodos ni montos.
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api.js'
import { canalesAuto, fmtAR } from '../../lib/reporteVentas.js'
import { mesEnPalabras } from './Paginas.jsx'
import { msgError } from './errores.js'

// Por origen de caja solo se asigna la carga manual: las cajas de un POS (TapTap,
// Fudo…) ya traen sus cobros por método, y una regla por origen las contaría dos veces.
const ORIGEN_MANUAL = 'DCSMART'
const esOrigenManual = (o) => String(o ?? '').trim().toUpperCase() === ORIGEN_MANUAL

const verMonto = (v) => (v == null || !Number.isFinite(v) ? '—' : fmtAR(v, Number.isInteger(v) ? 0 : 2))

// Una fila de regla: lo que cobró/entró, a qué canal va y si es delivery.
function FilaRegla({ item, regla, canalDefecto, sugerencias, listaId, onGuardar, onQuitar, ocupado }) {
  const [canal, setCanal] = useState(regla?.canal ?? '')
  const [delivery, setDelivery] = useState(!!regla?.delivery)
  useEffect(() => { setCanal(regla?.canal ?? ''); setDelivery(!!regla?.delivery) }, [regla?.canal, regla?.delivery])
  const cambio = canal.trim() !== (regla?.canal ?? '') || delivery !== !!regla?.delivery
  // Regla vieja por origen de un POS: ya no se puede guardar, solo quitar.
  const soloQuitar = item.match === 'origen' && !esOrigenManual(item.valor)
  const guardar = (e) => { e.preventDefault(); if (canal.trim()) onGuardar(canal.trim(), delivery) }
  return (
    <form className="rve-regla" onSubmit={guardar}>
      <div className="rve-regla-que">
        <span className="rve-regla-tipo">{item.match === 'metodo' ? 'Método de cobro' : 'Origen de caja'}</span>
        <strong>{item.valor}</strong>
      </div>
      <div className="rve-regla-monto">{verMonto(item.monto)}</div>
      <div className="rve-regla-canal">
        <input type="text" list={listaId} maxLength={40} value={canal} placeholder={canalDefecto} autoComplete="off" readOnly={soloQuitar}
          aria-label={`Canal de ${item.valor}`} onChange={(e) => setCanal(e.target.value)} />
        <small>{soloQuitar ? 'Las cajas de este origen se asignan por método de cobro: quitá esta regla.' : `${canal.length}/40`}</small>
      </div>
      <label className="rve-regla-del">
        <input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} /> delivery
      </label>
      <div className="rve-regla-btn">
        <button type="submit" className="btn-sec" disabled={ocupado || soloQuitar || !cambio || !canal.trim()}>Guardar</button>
        {regla && <button type="button" className="btn-sec" disabled={ocupado} onClick={onQuitar}>Quitar regla</button>}
      </div>
      <datalist id={listaId}>{sugerencias.map((s) => <option key={s} value={s} />)}</datalist>
    </form>
  )
}

export default function ConfigCliente({ grupo, cliente, data, onGuardado, onCerrar }) {
  const [localesGrupo, setLocalesGrupo] = useState(null) // null: todavía no llegaron
  const [nombre, setNombre] = useState(cliente?.nombre ?? grupo ?? '')
  const [elegidos, setElegidos] = useState(cliente?.locales ?? [])
  const [nombres, setNombres] = useState(cliente?.nombres ?? {})
  // Los reportes ya no muestran logos de los locales: los que había se guardan como estaban.
  const [logos, setLogos] = useState(cliente?.logos ?? {})
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    setNombre(cliente?.nombre ?? grupo ?? '')
    setElegidos(cliente?.locales ?? [])
    setNombres(cliente?.nombres ?? {})
    setLogos(cliente?.logos ?? {})
  }, [cliente?.id, cliente?.nombre, cliente?.locales, cliente?.nombres, cliente?.logos, grupo])

  // Los locales del grupo salen de la misma consulta que usa el Informe Mensual.
  useEffect(() => {
    if (!grupo) return
    setLocalesGrupo(null)
    api.getDatasetOptions('pagos', { grupo })
      .then((o) => setLocalesGrupo(o?.local || []))
      .catch(() => setLocalesGrupo([]))
  }, [grupo])

  // Primero los que el cliente ya tiene (en su orden: define el orden de las hojas) y después el resto del grupo.
  const opciones = useMemo(() => [...new Set([...(cliente?.locales || []), ...(localesGrupo || [])])], [localesGrupo, cliente])

  const correr = async (fn) => {
    setError('')
    setOcupado(true)
    try { return await fn() } catch (e) { setError(msgError(e)); return undefined } finally { setOcupado(false) }
  }

  const limpiarNombres = (locales) => Object.fromEntries(
    Object.entries(nombres).map(([k, v]) => [k, (v || '').trim()]).filter(([k, v]) => v && locales.includes(k)))

  const crear = () => correr(async () => {
    const creado = await api.rvCrearCliente({ grupo, nombre: grupo, locales: opciones })
    await onGuardado(creado.id)
  })

  const guardarCliente = () => correr(async () => {
    if (!nombre.trim()) { setError('Escribí el nombre del cliente.'); return }
    if (!elegidos.length) { setError('Elegí al menos un local.'); return }
    const locales = opciones.filter((l) => elegidos.includes(l))
    await api.rvGuardarCliente(cliente.id, { nombre: nombre.trim(), locales, nombres: limpiarNombres(locales), logos: Object.fromEntries(Object.entries(logos).filter(([k]) => locales.includes(k))) })
    setGuardado(true)
    await onGuardado(cliente.id)
  })

  // ── reglas ──
  const reglas = data?.reglas || []
  const sugerencias = useMemo(() => {
    const s = new Set(reglas.map((r) => r.canal))
    for (const l of data?.cliente?.locales || []) {
      const a = data.auto[l]
      for (const m of Object.keys(a?.detalles || {})) {
        for (const c of canalesAuto({ detalles: a.detalles[m] })) s.add(c.nombre)
      }
    }
    return [...s].filter((x) => x && x !== 'Local').sort()
  }, [data, reglas])

  const guardarRegla = (local, item, canal, delivery) => correr(async () => {
    await api.rvPutRegla(cliente.id, { local, match: item.match, valor: item.valor, canal, delivery })
    await onGuardado(cliente.id)
  })
  const quitarRegla = (local, item) => correr(async () => {
    await api.rvDelRegla(cliente.id, { local, match: item.match, valor: item.valor })
    await onGuardado(cliente.id)
  })

  const itemsDe = (local) => {
    const a = data.auto[local] || {}
    const items = [
      ...(a.detalles?.[data.mes] || []).map((d) => ({ match: 'metodo', valor: d.metodo, monto: d.monto })),
      ...(a.cajasOrigen?.[data.mes] || []).filter((c) => esOrigenManual(c.origin))
        .map((c) => ({ match: 'origen', valor: c.origin, monto: c.total })),
    ].filter((i) => i.valor)
      // Mayor monto primero: el orden de BigQuery no es estable entre consultas.
      .sort((x, y) => (x.match === y.match ? 0 : x.match === 'metodo' ? -1 : 1) || (y.monto ?? 0) - (x.monto ?? 0))
    const mismo = (x, y) => String(x).trim().toLowerCase() === String(y).trim().toLowerCase()
    // Reglas que existen pero no aplican a lo que trajo este mes: se muestran para poder quitarlas.
    const sueltas = reglas
      .filter((r) => r.local === local && !items.some((i) => i.match === r.match && mismo(i.valor, r.valor)))
      .map((r) => ({ match: r.match, valor: r.valor, monto: null }))
    return [...items, ...sueltas]
  }

  return (
    <div className="rve-config">
      <section className="rve-config-sec">
        <h3>Cliente</h3>
        {!cliente ? (
          <>
            <p>{grupo} todavía no tiene un reporte armado.</p>
            <button type="button" className="btn-pri" disabled={ocupado || !localesGrupo?.length} onClick={crear}>
              Crear el reporte de {grupo} con {localesGrupo?.length ? (localesGrupo.length === 1 ? 'su local' : `sus ${localesGrupo.length} locales`) : 'todos los locales'}
            </button>
            {localesGrupo?.length === 0 && <p className="rve-chico">No encontramos locales con pagos en este grupo, así que no hay con qué armar el reporte.</p>}
          </>
        ) : (
          <>
            <div className="fg">
              <label htmlFor="rve-nom-cli">Nombre del cliente</label>
              <input id="rve-nom-cli" type="text" maxLength={80} value={nombre} autoComplete="off" onChange={(e) => { setNombre(e.target.value); setGuardado(false) }} />
              <small>{nombre.length}/80</small>
            </div>
            <div className="rve-config-locales">
              <div className="rve-k">Locales del reporte y cómo se llaman en las hojas</div>
              {localesGrupo === null && <p className="rve-chico">Cargando locales…</p>}
              {opciones.map((l) => (
                <div key={l} className="rve-config-local">
                  <label className="rve-check">
                    <input type="checkbox" checked={elegidos.includes(l)}
                      onChange={(e) => { setElegidos((act) => (e.target.checked ? [...act, l] : act.filter((x) => x !== l))); setGuardado(false) }} />
                    <span>{l}</span>
                  </label>
                  <div className="rve-config-nombre">
                    <input type="text" maxLength={60} placeholder={l} value={nombres[l] ?? ''} autoComplete="off" disabled={!elegidos.includes(l)}
                      aria-label={`Nombre de ${l} en el reporte`}
                      onChange={(e) => { setNombres((n) => ({ ...n, [l]: e.target.value })); setGuardado(false) }} />
                    <small>{(nombres[l] ?? '').length}/60</small>
                  </div>
                </div>
              ))}
            </div>
            <div className="rve-config-btns">
              <button type="button" className="btn-pri" disabled={ocupado} onClick={guardarCliente}>Guardar cliente</button>
              {guardado && <span className="rve-ok">Guardado</span>}
            </div>
          </>
        )}
        {error && <div className="rve-error" role="alert">{error}</div>}
      </section>

      {cliente && data && data.cliente.id === cliente.id && (
        <section className="rve-config-sec">
          <h3>Canales por local · {mesEnPalabras(data.mes)}</h3>
          <p className="rve-chico">
            Los métodos de cobro del mes y las cajas cargadas a mano (DCSMART), con su monto. Lo que no tiene regla va a "Local" salvo que
            sea una app de delivery (Rappi, Pedidos Ya…), que se detecta sola. Las cajas de TapTap o Fudo se asignan por método de cobro.
          </p>
          {data.cliente.locales.map((local) => {
            const items = itemsDe(local)
            return (
              <div key={local} className="rve-config-local-reglas">
                <div className="rve-config-titulo">{data.cliente.nombres?.[local] || local}</div>
                {items.length === 0 && <p className="rve-chico">Este local no tiene cobros ni cajas en {mesEnPalabras(data.mes)}.</p>}
                {items.map((item) => {
                  const regla = reglas.find((r) => r.local === local && r.match === item.match
                    && String(r.valor).trim().toLowerCase() === String(item.valor).trim().toLowerCase())
                  const defecto = item.match === 'metodo' ? (canalesAuto({ detalles: [{ metodo: item.valor, monto: 1 }] })[0]?.nombre || '—') : '—'
                  return (
                    <FilaRegla key={`${item.match}:${item.valor}`} item={item} regla={regla} canalDefecto={defecto}
                      sugerencias={sugerencias} listaId={`rve-sug-${local}`} ocupado={ocupado}
                      onGuardar={(canal, delivery) => guardarRegla(local, item, canal, delivery)}
                      onQuitar={() => quitarRegla(local, item)} />
                  )
                })}
              </div>
            )
          })}
        </section>
      )}
      {cliente && onCerrar && (
        <div className="rve-config-btns"><button type="button" className="btn-sec" onClick={onCerrar}>Volver al reporte</button></div>
      )}
    </div>
  )
}
