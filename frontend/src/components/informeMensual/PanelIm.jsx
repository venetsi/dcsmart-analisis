// Panel "Datos de la hoja" del editor del Informe Mensual: lo que se carga o se
// corrige para la hoja elegida, según pagina.clave. No guarda nada por su cuenta:
// cada cambio pasa por `acciones` (la página llama a la API y vuelve a cargar).
//
// Regla de oro: lo que no está se ve "—" o "Falta cargar", nunca 0.
// Mes cerrado: todo lo que cambia números queda deshabilitado; textos,
// observaciones y hojas se siguen editando. Solo el equipo DC edita.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CampoNum } from '../reporteVentas/PanelDatos.jsx'
import { SECCIONES, SECCION } from '../../lib/informe.js'
import { GRUPOS_SECCION, cashflowDe, deudaDe, resumenDe } from '../../lib/informeMensual.js'
import { fmtNumIm, fmtPesosIm, mesEnPalabrasIm } from '../../lib/formatosIm.js'

export const MSG_CERRADO = 'El mes está cerrado. Reabrilo para hacer cambios.'
const OBS_MAX = 280
const COMENTARIO_MAX = 400
const CONCEPTO_MAX = 80

const num = (v) => {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const fechaCorta = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-AR')
}

const SUBS_CMV = [['alimentos', 'Alimentos'], ['bebidas', 'Bebidas'], ['movstock', 'Movimiento de stock']]
const HOJAS_PYL = new Set(['pyl_acumulado', 'pyl_historico', 'consolidado', 'cmv', 'detalle', 'apertura'])

// ── Campos ───────────────────────────────────────────────────────────────────

// Texto largo con contador y alto automático. Guardar / Quitar explícitos.
function TextoLargo({ id, etiqueta, texto, max, placeholder, ayuda, ocupado, puedeEditar = true, onGuardar }) {
  const [t, setT] = useState(texto)
  const ref = useRef(null)
  useEffect(() => { setT(texto) }, [texto])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [t])
  if (!puedeEditar) {
    return texto ? <div className="ime-texto-largo"><div className="rve-k">{etiqueta}</div><p className="rve-vacio">{texto}</p></div> : null
  }
  const cambio = t.trim() !== texto
  return (
    <div className="ime-texto-largo">
      <label className="rve-k" htmlFor={id}>{etiqueta}</label>
      <textarea id={id} ref={ref} rows={2} maxLength={max} value={t} placeholder={placeholder} onChange={(e) => setT(e.target.value)} />
      <div className="rve-obs-pie">
        <small>{t.length}/{max}{ayuda ? ` · ${ayuda}` : ''}</small>
        <div className="rve-obs-botones">
          {texto && <button type="button" className="btn-sec" disabled={ocupado} onClick={() => onGuardar('')}>Quitar</button>}
          <button type="button" className="btn-pri" disabled={ocupado || !cambio} onClick={() => onGuardar(t.trim())}>Guardar</button>
        </div>
      </div>
    </div>
  )
}

// Texto de una línea con contador. Guarda al salir del campo o con Enter; Escape vuelve atrás.
function CampoTexto({ valor, max, etiqueta, placeholder, disabled = false, obligatorio = false, onGuardar, onError }) {
  const inicial = valor || ''
  const [t, setT] = useState(inicial)
  const foco = useRef(false)
  const saltar = useRef(false)
  useEffect(() => { if (!foco.current) setT(inicial) }, [inicial])
  const confirmar = () => {
    foco.current = false
    const v = t.trim()
    if (disabled || saltar.current || v === inicial.trim()) { saltar.current = false; setT(inicial); return }
    if (obligatorio && !v) { setT(inicial); onError?.('Escribí el concepto.'); return }
    onGuardar(v)
  }
  return (
    <label className="rve-nom ime-texto">
      <input type="text" maxLength={max} value={t} aria-label={etiqueta} placeholder={placeholder} autoComplete="off"
        readOnly={disabled} aria-disabled={disabled || undefined}
        onFocus={() => { foco.current = true }} onChange={(e) => setT(e.target.value)} onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') { saltar.current = true; e.currentTarget.blur() }
        }} />
      <small>{t.length}/{max}</small>
    </label>
  )
}

const Etiqueta = ({ tipo, children }) => <span className={`rve-b rve-b-${tipo}`}>{children}</span>
const AvisoCerrado = () => <div className="rve-solo-lectura ime-cerrado">{MSG_CERRADO}</div>
const Vacio = ({ texto }) => <p className="rve-vacio">{texto}</p>

function Avisos({ lista }) {
  if (!lista.length) return null
  return (
    <div className="rve-aviso ime-avisos" role="status">
      <strong>Para revisar</strong>
      <ul>{lista.map((a, i) => <li key={i}>{a.texto}</li>)}</ul>
    </div>
  )
}

// ── Panel ────────────────────────────────────────────────────────────────────

// props: { informe, im (respuesta cruda del GET), pagina, interno, cerrado, ocupado, acciones, onError }
// acciones (cada una devuelve una promesa con true si se guardó):
//   valor({ local, dato, valor, original }), linea(body), borrarLinea(id),
//   texto({ local, clave, texto }), obs(paginaId, texto), indicadores(local, lista),
//   mover(linea, seccion), razonSocial(texto)
export default function PanelIm(props) {
  const { pagina, informe, interno, ocupado, acciones } = props
  if (!pagina || !informe) return null
  const obs = informe.observaciones?.[pagina.id]
  // Portada y contraportada no tienen franja de observación; en una hoja que todavía
  // no sale (sin datos) solo se puede cuando su id ya es el definitivo.
  const conObs = !['portada', 'contraportada'].includes(pagina.clave) && !pagina.sinObs
  return (
    <div className="ime-panel-int">
      <div className="ime-panel-cab">
        <div className="ime-panel-tit">Datos de la hoja</div>
        <span className="ime-panel-hoja">{tituloPagina(pagina)}</span>
      </div>
      {!interno && <div className="rve-solo-lectura">Solo el equipo DC puede editar el informe.</div>}
      <Cuerpo {...props} />
      {conObs && (
        <div className="ime-obs">
          <TextoLargo key={pagina.id} id="ime-obs" etiqueta="Observación de esta hoja (opcional)" texto={obs?.texto || ''} max={OBS_MAX}
            placeholder="Sale en la franja de abajo de la hoja. Ej.: el local estuvo cerrado 4 días por obras."
            ayuda={obs?.actualizado_por && obs?.texto ? `última edición: ${obs.actualizado_por}${obs.actualizado_at ? ` el ${fechaCorta(obs.actualizado_at)}` : ''}` : 'sale en la hoja, arriba del pie'}
            ocupado={ocupado} puedeEditar={interno} onGuardar={(t) => acciones.obs(pagina.id, t)} />
        </div>
      )}
      {pagina.sinObs && <Vacio texto="La observación se carga cuando la hoja sale en el informe." />}
    </div>
  )
}

export function tituloPagina(p) {
  if (!p) return ''
  const partes = [p.titulo]
  if (p.nombre) partes.push(p.nombre)
  else if (p.grupo) partes.push('Grupo')
  if (p.seccionTitulo) partes.push(p.seccionTitulo)
  const base = partes.join(' · ')
  return p.partes > 1 ? `${base} (${p.parte} de ${p.partes})` : base
}

function Cuerpo(props) {
  const { pagina } = props
  switch (pagina.clave) {
    case 'portada': return <PanelPortada {...props} />
    case 'indice': return <Vacio texto="El índice se arma solo con las hojas que salen en el informe." />
    case 'contraportada': return <Vacio texto="Esta hoja no tiene datos para editar." />
    case 'historico': return <Vacio texto="La venta, los cubiertos y el promedio salen del Reporte de Ventas. Para corregirlos, usá el Reporte de Ventas de este mes." />
    case 'indicadores':
    case 'ind_locales': return <PanelValores {...props} />
    case 'cashflow':
    case 'deuda': return <PanelCliente {...props} />
    case 'resumen': return <PanelResumen {...props} />
    default: return HOJAS_PYL.has(pagina.clave) ? <PanelLineas {...props} /> : <Vacio texto="Esta hoja no tiene datos para editar." />
  }
}

// ── Portada: razón social ────────────────────────────────────────────────────

function PanelPortada({ informe, im, interno, ocupado, acciones, onError }) {
  const propia = informe.cliente?.razon_social || ''
  const deGestion = im?.razonSocialGestion || ''
  return (
    <div className="ime-bloque">
      <div className="rve-k">Razón social</div>
      {interno
        ? <CampoTexto valor={propia} max={120} etiqueta="Razón social" placeholder={deGestion || 'Ej.: Corno S.A.S.'} disabled={ocupado}
            onGuardar={(t) => acciones.razonSocial(t)} onError={onError} />
        : <p className="ime-dato">{informe.razonSocial || '—'}</p>}
      <Vacio texto={deGestion
        ? `En gestión figura "${deGestion}". Si dejás el campo vacío, sale esa.`
        : 'Gestión no tiene una razón social para este cliente. Si la dejás vacía, la portada sale sin razón social.'} />
      <Vacio texto="Los logos y los nombres de los locales se cambian en Configurar." />
    </div>
  )
}

// ── Indicadores: pax, días e indicadores propios ─────────────────────────────

function PanelValores({ informe, im, pagina, interno, cerrado, ocupado, acciones, onError }) {
  const locales = pagina.clave === 'indicadores' ? informe.locales.slice(0, 1) : informe.locales
  return (
    <>
      {interno && cerrado && <AvisoCerrado />}
      {locales.map((l) => (
        <ValoresLocal key={l.local} l={l} informe={informe} im={im} interno={interno} cerrado={cerrado}
          ocupado={ocupado} acciones={acciones} onError={onError} />
      ))}
    </>
  )
}

const claveIndicador = (nombre, usadas) => {
  const base = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 26) || 'indicador'
  let k = base
  for (let i = 2; usadas.has(k); i++) k = `${base}_${i}`
  return k
}

function ValoresLocal({ l, informe, im, interno, cerrado, ocupado, acciones, onError }) {
  const [nombre, setNombre] = useState('')
  const [formato, setFormato] = useState('numero')
  const [err, setErr] = useState('')
  const mes = informe.mes
  const editable = interno && !cerrado
  const auto = im?.auto?.[l.local]?.[mes] || {}
  const mano = (dato) => (im?.valores || informe.valores || []).find((v) => v.local === l.local && v.mes === mes && v.dato === dato) || null
  const propios = informe.indicadoresConfig?.[l.local] || []

  const fila = ({ dato, etiqueta, original, formatoNum = 'numero' }) => {
    const m = mano(dato)
    const deGestion = num(original) > 0 ? num(original) : null
    const valor = m ? num(m.valor) : deGestion
    const fuente = m ? 'mano' : deGestion != null ? 'auto' : 'falta'
    const guardar = (v) => acciones.valor({ local: l.local, dato, valor: v, original: deGestion })
    return (
      <tr key={dato}>
        <td className="rve-dato">{etiqueta}</td>
        <td className="rve-valor">
          {editable
            ? <CampoNum valor={valor} tieneCorreccion={!!m} disabled={ocupado} etiqueta={`${etiqueta} de ${l.nombre}`}
                onGuardar={guardar} onRestaurar={() => guardar(null)} onError={onError} placeholder="Falta cargar" />
            : <span>{valor == null ? '—' : formatoNum === 'pesos' ? fmtPesosIm(valor) : fmtNumIm(valor)}</span>}
        </td>
        <td className="rve-src">
          <div className="rve-fuente">
            {fuente === 'mano' && <Etiqueta tipo="mano">A MANO</Etiqueta>}
            {fuente === 'auto' && <Etiqueta tipo="auto">GESTIÓN</Etiqueta>}
            {fuente === 'falta' && <Etiqueta tipo="falta">FALTA CARGAR</Etiqueta>}
            {fuente === 'mano' && deGestion != null && <span className="rve-orig" title="Valor de gestión">{fmtNumIm(deGestion)}</span>}
            {fuente === 'mano' && m?.actualizado_por && <small>por {m.actualizado_por}{m.actualizado_at ? ` el ${fechaCorta(m.actualizado_at)}` : ''}</small>}
          </div>
          {editable && !ocupado && m && (
            <button type="button" className="rve-volver" onClick={() => guardar(null)}>{deGestion != null ? 'Volver al de gestión' : 'Quitar'}</button>
          )}
        </td>
      </tr>
    )
  }

  const agregar = async (e) => {
    e.preventDefault()
    const n = nombre.trim()
    if (!n) return setErr('Escribí el nombre del indicador.')
    if (propios.length >= 8) return setErr('Cada local puede tener hasta 8 indicadores propios.')
    if (propios.some((i) => i.nombre.toLowerCase() === n.toLowerCase())) return setErr('Ese indicador ya está.')
    setErr('')
    const clave = claveIndicador(n, new Set(propios.map((i) => i.clave)))
    if (await acciones.indicadores(l.local, [...propios, { clave, nombre: n, formato }])) { setNombre(''); setFormato('numero') }
  }

  return (
    <div className="ime-bloque">
      <div className="ime-local">{l.nombre}</div>
      <table className="rve-tabla">
        <thead><tr><th>Dato</th><th>{mesEnPalabrasIm(mes)}</th><th>De dónde sale</th></tr></thead>
        <tbody>
          {fila({ dato: 'pax', etiqueta: 'Cubiertos (pax)', original: auto.pax })}
          {fila({ dato: 'dias', etiqueta: 'Días de venta', original: auto.dias })}
          {propios.map((i) => fila({ dato: `ind:${i.clave}`, etiqueta: i.nombre, original: null, formatoNum: i.formato }))}
        </tbody>
      </table>
      {interno && propios.length > 0 && (
        <div className="ime-propios">
          {propios.map((i) => (
            <span key={i.clave} className="ime-chip">
              {i.nombre} · {i.formato === 'pesos' ? 'en pesos' : 'número'}
              <button type="button" disabled={ocupado} aria-label={`Quitar el indicador ${i.nombre}`} title="Quitar el indicador"
                onClick={() => acciones.indicadores(l.local, propios.filter((x) => x.clave !== i.clave))}>×</button>
            </span>
          ))}
        </div>
      )}
      {interno && (
        <form className="rve-agregar" onSubmit={agregar}>
          <div className="rve-k">+ Indicador propio de {l.nombre}</div>
          <div className="ime-agregar-ind">
            <label className="rve-nom">
              <input type="text" maxLength={40} value={nombre} placeholder="Nombre (ej. Ticket promedio delivery)" aria-label="Nombre del indicador"
                autoComplete="off" onChange={(e) => setNombre(e.target.value)} />
              <small>{nombre.length}/40</small>
            </label>
            <select className="ime-select" value={formato} onChange={(e) => setFormato(e.target.value)} aria-label="Cómo se muestra">
              <option value="numero">Número</option>
              <option value="pesos">En pesos</option>
            </select>
            <button type="submit" className="btn-sec" disabled={ocupado}>Agregar</button>
          </div>
          {err && <div className="rve-err-chico">{err}</div>}
          <Vacio texto="El valor de cada mes se carga en la tabla de arriba. Sale en la hoja de indicadores." />
        </form>
      )}
    </div>
  )
}

// ── P&L: líneas del local ────────────────────────────────────────────────────

const AVISOS_LINEAS = new Set(['otros', 'tipo', 'caja', 'venta', 'canal', 'sinDatos'])

function PanelLineas({ informe, im, pagina, interno, cerrado, ocupado, acciones, onError }) {
  const [localElegido, setLocalElegido] = useState(null)
  const locales = informe.locales || []
  const local = pagina.local || (locales.some((l) => l.local === localElegido) ? localElegido : locales[0]?.local)
  const L = locales.find((l) => l.local === local)
  const mes = informe.mes
  const mesInf = L?.meses?.[mes] || null
  const editable = interno && !cerrado

  // Qué secciones se muestran: las de la hoja (CMV, o el grupo del detalle / apertura) o todo el P&L.
  const grupo = pagina.seccion ? GRUPOS_SECCION.find((g) => g.key === pagina.seccion) : null
  const filtro = pagina.clave === 'cmv' ? ['cmv'] : grupo ? grupo.secciones : null
  const secciones = SECCIONES.filter((s) => (filtro ? filtro.includes(s.key) : true))
  const datosSec = (key) => mesInf?.secciones?.find((s) => s.key === key) || null
  const mostradas = filtro ? secciones : secciones.filter((s) => datosSec(s.key)?.lineas?.length)

  // Filas de im_linea de este local y mes (correcciones y líneas a mano).
  const filas = (im?.lineas || []).filter((f) => f.hoja === 'pyl' && f.local === local && f.mes === mes)
  const correccionDe = (clave) => filas.find((f) => f.corrige === clave) || null
  const filaManual = (id) => filas.find((f) => !f.corrige && String(f.id) === String(id)) || null

  // Corrección de una línea de gestión: los montos que no se tocan quedan como estaban.
  // Sin montos corregidos y sin ocultar, la corrección se borra (vuelve al de gestión).
  const corregir = (l, cambios) => {
    const f = correccionDe(l.clave)
    const monto = 'col1' in cambios ? cambios.col1 : num(f?.monto)
    const monto2 = 'col2' in cambios ? cambios.col2 : num(f?.monto2)
    const oculta = 'oculta' in cambios ? cambios.oculta : !!f?.oculta
    if (monto == null && monto2 == null && !oculta) return f ? acciones.borrarLinea(Number(f.id)) : Promise.resolve(true)
    return acciones.linea({
      ...(f ? { id: Number(f.id) } : {}), local, mes, hoja: 'pyl', seccion: l.seccion, concepto: l.concepto,
      corrige: l.clave, monto, monto2, oculta, sub: l.seccion === 'cmv' ? f?.sub || l.sub || null : null,
      orden: Number.isInteger(f?.orden) ? f.orden : 0,
    })
  }
  const guardarManual = (l, cambios) => {
    const f = filaManual(l.id)
    if (!f) return Promise.resolve(false)
    return acciones.linea({
      id: Number(f.id), local, mes, hoja: 'pyl', seccion: f.seccion, concepto: f.concepto,
      monto: num(f.monto) ?? 0, monto2: num(f.monto2) ?? 0, oculta: false,
      sub: f.seccion === 'cmv' ? f.sub || 'alimentos' : null, orden: Number.isInteger(f.orden) ? f.orden : 0, ...cambios,
    })
  }

  const avisos = (informe.avisos || []).filter((a) => a.local === local && AVISOS_LINEAS.has(a.tipo))

  const montos = (l, manual) => {
    const corr = manual ? null : correccionDe(l.clave)
    const campo = (col, valor) => {
      const corregido = manual ? false : num(corr?.[col === 'col1' ? 'monto' : 'monto2']) != null
      return (
        <CampoNum valor={valor} tieneCorreccion={corregido} disabled={ocupado} etiqueta={`${l.concepto}, columna ${col === 'col1' ? 1 : 2}`}
          placeholder="—" onError={onError}
          onGuardar={(v) => (manual ? guardarManual(l, { [col === 'col1' ? 'monto' : 'monto2']: v }) : corregir(l, { [col]: v }))}
          onRestaurar={() => (manual ? null : corregir(l, { [col]: null }))} />
      )
    }
    if (!editable) {
      return (
        <div className="ime-ln-montos">
          <span>{fmtPesosIm(l.col1 || null)}</span><span>{fmtPesosIm(l.col2 || null)}</span><span className="ime-ln-total">{fmtPesosIm(l.total || null)}</span>
        </div>
      )
    }
    return (
      <div className="ime-ln-montos">
        {campo('col1', l.col1 || null)}{campo('col2', l.col2 || null)}<span className="ime-ln-total">{fmtPesosIm(l.total || null)}</span>
      </div>
    )
  }

  const linea = (l) => {
    const manual = l.origen === 'manual'
    const corr = manual ? null : correccionDe(l.clave)
    const deGestion = l.seccion === 'ventas' ? 'REPORTE DE VENTAS' : 'GESTIÓN'
    const origenes = l.rubros?.length ? l.rubros.map((r) => `${r.rubro} / ${r.categoria}`).join(' · ') : null
    const puedeMover = editable && !manual && l.seccion !== 'ventas' && l.rubros?.length > 0
    return (
      <div key={l.clave} className={`ime-ln${l.oculto ? ' oculta' : ''}`}>
        <div className="ime-ln-cab">
          {manual && editable
            ? <CampoTexto valor={l.concepto} max={CONCEPTO_MAX} etiqueta="Concepto de la línea" disabled={ocupado} obligatorio
                onGuardar={(t) => guardarManual(l, { concepto: t })} onError={onError} />
            : <span className="ime-ln-con" title={origenes ? `De gestión: ${origenes}` : undefined}>{l.concepto}</span>}
          <span className="ime-ln-tags">
            {manual && <Etiqueta tipo="mano">A MANO</Etiqueta>}
            {!manual && l.huerfana && <Etiqueta tipo="falta">YA NO ESTÁ EN GESTIÓN</Etiqueta>}
            {!manual && !l.huerfana && l.editado && <Etiqueta tipo="mano">CORREGIDA</Etiqueta>}
            {!manual && !l.huerfana && !l.editado && <Etiqueta tipo="auto">{deGestion}</Etiqueta>}
            {l.oculto && <Etiqueta tipo="cerrado">OCULTA</Etiqueta>}
          </span>
        </div>
        {montos(l, manual)}
        {!manual && l.editado && !l.huerfana && (
          <small className="ime-ln-nota">En {deGestion === 'GESTIÓN' ? 'gestión' : 'el Reporte de Ventas'}: {fmtPesosIm(l.auto?.col1 || null)} y {fmtPesosIm(l.auto?.col2 || null)}{corr?.actualizado_por ? ` · corregida por ${corr.actualizado_por}` : ''}</small>
        )}
        {editable && (
          <div className="ime-ln-acc">
            {!manual && !l.huerfana && (
              <button type="button" className="rve-volver" disabled={ocupado} onClick={() => corregir(l, { oculta: !l.oculto })}>
                {l.oculto ? 'Mostrar (vuelve a sumar)' : 'Ocultar (deja de sumar)'}
              </button>
            )}
            {!manual && corr && (
              <button type="button" className="rve-volver" disabled={ocupado} onClick={() => acciones.borrarLinea(Number(corr.id))}>
                {l.huerfana ? 'Quitar la línea' : 'Volver al de gestión'}
              </button>
            )}
            {manual && l.seccion === 'cmv' && (
              <select className="ime-select" value={l.sub || 'alimentos'} disabled={ocupado} aria-label={`Tipo de CMV de ${l.concepto}`}
                onChange={(e) => guardarManual(l, { sub: e.target.value })}>
                {SUBS_CMV.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            )}
            {manual && (
              <button type="button" className="rve-volver ime-rojo" disabled={ocupado} onClick={() => acciones.borrarLinea(Number(l.id))}>Borrar la línea</button>
            )}
            {puedeMover && (
              <label className="ime-mover">
                <span>Sección</span>
                <select className="ime-select" value={l.seccion} disabled={ocupado} aria-label={`Mover ${l.concepto} a otra sección`}
                  title="Mover a otra sección: vale para todo el grupo y los meses abiertos" onChange={(e) => acciones.mover(l, e.target.value)}>
                  {SECCIONES.filter((s) => s.key !== 'ventas').map((s) => <option key={s.key} value={s.key}>{s.num} · {s.titulo}</option>)}
                  <option value="excluido">No va en el P&amp;L</option>
                </select>
              </label>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {locales.length > 1 && !pagina.local && (
        <div className="ime-bloque">
          <label className="rve-k" htmlFor="ime-local">Local que corregís</label>
          <select id="ime-local" className="ime-select ime-select-ancho" value={local || ''} onChange={(e) => setLocalElegido(e.target.value)}>
            {locales.map((l) => <option key={l.local} value={l.local}>{l.nombre}</option>)}
          </select>
        </div>
      )}
      <div className="ime-local">{L?.nombre || local} · {mesEnPalabrasIm(mes)}</div>
      <Vacio texto={`Se corrige ${mesEnPalabrasIm(mes)}. Columna 1: bancarizado o facturado. Columna 2: efectivo o sin factura.`} />
      {interno && cerrado && <AvisoCerrado />}
      <Avisos lista={avisos} />
      {!mesInf && <Vacio texto="Este local no tiene ventas ni gastos en el mes. Podés agregar líneas a mano." />}
      {mostradas.map((s) => {
        const d = datosSec(s.key)
        return (
          <section key={s.key} className="ime-sec">
            <div className="ime-sec-cab"><span>{s.num} · {s.titulo}</span><span>{fmtPesosIm(d?.total || null)}</span></div>
            {d?.lineas?.length ? d.lineas.map(linea) : <Vacio texto="Sin líneas este mes." />}
          </section>
        )
      })}
      {mesInf && !filtro && mostradas.length === 0 && <Vacio texto="No hay líneas este mes." />}
      {editable && L && (
        <NuevaLineaPyl key={`${local}:${filtro?.join(',') || 'todo'}`} secciones={secciones} ocupado={ocupado} onError={onError}
          onAgregar={(b) => acciones.linea({ local, mes, hoja: 'pyl', oculta: false, orden: 0, ...b })} />
      )}
      {editable && <Vacio texto="Mover una categoría de sección vale para todo el grupo y para los meses abiertos. Si tenía una corrección, se pasa a la sección nueva." />}
    </>
  )
}

function NuevaLineaPyl({ secciones, ocupado, onError, onAgregar }) {
  const [seccion, setSeccion] = useState(secciones.find((s) => s.key !== 'ventas')?.key || secciones[0]?.key)
  const [concepto, setConcepto] = useState('')
  const [col1, setCol1] = useState(null)
  const [col2, setCol2] = useState(null)
  const [sub, setSub] = useState('alimentos')
  const [vuelta, setVuelta] = useState(0)
  const [err, setErr] = useState('')
  const enviando = useRef(false)
  // `extra`: el monto recién escrito cuando se aprieta Enter en una columna (todavía no está
  // en el estado). Enter puede disparar también el envío del formulario: `enviando` evita
  // que la línea se agregue dos veces.
  const enviar = async (e, extra = {}) => {
    e?.preventDefault()
    if (enviando.current) return
    const c = concepto.trim()
    const v1 = 'col1' in extra ? extra.col1 : col1
    const v2 = 'col2' in extra ? extra.col2 : col2
    if (!c) return setErr('Escribí el concepto de la línea.')
    if (v1 == null && v2 == null) return setErr('Escribí el monto en la columna 1, en la 2 o en las dos.')
    setErr('')
    enviando.current = true
    try {
      const ok = await onAgregar({ seccion, concepto: c, monto: v1 ?? 0, monto2: v2 ?? 0, sub: seccion === 'cmv' ? sub : null })
      if (ok) { setConcepto(''); setCol1(null); setCol2(null); setVuelta((v) => v + 1) }
    } finally { enviando.current = false }
  }
  return (
    <form className="rve-agregar" onSubmit={enviar}>
      <div className="rve-k">+ Agregar línea a mano</div>
      <div className="ime-nueva">
        <select className="ime-select" value={seccion} onChange={(e) => setSeccion(e.target.value)} aria-label="Sección de la línea nueva">
          {secciones.map((s) => <option key={s.key} value={s.key}>{s.num} · {SECCION[s.key].titulo}</option>)}
        </select>
        {seccion === 'cmv' && (
          <select className="ime-select" value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Tipo de CMV">
            {SUBS_CMV.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        )}
        <label className="rve-nom ime-nueva-con">
          <input type="text" maxLength={CONCEPTO_MAX} value={concepto} placeholder="Concepto (ej. IVA 09-26)" aria-label="Concepto de la línea nueva"
            autoComplete="off" onChange={(e) => setConcepto(e.target.value)} />
          <small>{concepto.length}/{CONCEPTO_MAX}</small>
        </label>
        <div className="ime-ln-montos">
          <CampoNum key={`a${vuelta}`} valor={null} etiqueta="Columna 1 de la línea nueva" placeholder="Columna 1"
            onGuardar={setCol1} onRestaurar={() => setCol1(null)} onEnter={(n) => enviar(null, { col1: n })} onError={onError} />
          <CampoNum key={`b${vuelta}`} valor={null} etiqueta="Columna 2 de la línea nueva" placeholder="Columna 2"
            onGuardar={setCol2} onRestaurar={() => setCol2(null)} onEnter={(n) => enviar(null, { col2: n })} onError={onError} />
          <button type="submit" className="btn-sec" disabled={ocupado}>Agregar</button>
        </div>
      </div>
      {err && <div className="rve-err-chico">{err}</div>}
    </form>
  )
}

// ── Cash flow y deuda: líneas del cliente y fechas ───────────────────────────

const SECCIONES_CLIENTE = {
  cashflow: [['disponible', 'Disponibilidades'], ['pagar', 'Pagos a realizar'], ['mp_liquidar', 'Mercado Pago a liquidar']],
  deuda: [['deuda', 'Deuda corriente'], ['venta_periodo', 'Venta del período (opcional)']],
}
const FECHAS = {
  cashflow: [['cashflow:elaborado', 'Elaborado el', 400], ['cashflow:proyectado', 'Proyectado al', 400]],
  deuda: [['deuda:fecha', 'Deuda al', 40]],
}

function PanelCliente({ informe, im, pagina, interno, cerrado, ocupado, acciones, onError }) {
  const hoja = pagina.clave
  const mes = informe.mes
  const editable = interno && !cerrado
  const filas = (im?.lineas || [])
    .filter((f) => f.hoja === hoja && f.local == null && f.mes === mes && !f.oculta)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || Number(a.id) - Number(b.id))
  const texto = (clave) => (informe.textos || []).find((t) => (t.local || '') === '' && t.mes === mes && t.clave === clave)?.texto || ''
  const cf = hoja === 'cashflow' ? cashflowDe(informe) : null
  const dd = hoja === 'deuda' ? deudaDe(informe) : null
  const totalDe = (sec) => (cf ? { disponible: cf.disponible.total, pagar: cf.pagar.total, mp_liquidar: cf.mpLiquidar }[sec]
    : sec === 'deuda' ? dd.total : dd.ventaPeriodoCargada ? dd.ventaPeriodo : null)

  const guardar = (f, cambios) => acciones.linea({
    id: Number(f.id), local: null, mes, hoja, seccion: f.seccion, concepto: f.concepto,
    monto: num(f.monto), monto2: null, oculta: false, orden: Number.isInteger(f.orden) ? f.orden : 0, ...cambios,
  })
  const ordenSiguiente = (sec) => filas.filter((f) => f.seccion === sec).reduce((m, f) => Math.max(m, Number.isInteger(f.orden) ? f.orden + 1 : 0), 0)

  return (
    <>
      <div className="ime-bloque ime-fechas">
        {FECHAS[hoja].map(([clave, etiqueta, max]) => (
          <div key={clave}>
            <div className="rve-k">{etiqueta}</div>
            {interno
              ? <CampoTexto valor={texto(clave)} max={Math.min(max, 40)} etiqueta={etiqueta} placeholder="dd/mm/aaaa" disabled={ocupado}
                  onGuardar={(t) => acciones.texto({ local: '', clave, texto: t })} onError={onError} />
              : <p className="ime-dato">{texto(clave) || '—'}</p>}
          </div>
        ))}
      </div>
      {interno && cerrado && <AvisoCerrado />}
      {!filas.length && <Vacio texto={`Todavía no hay nada cargado en ${mesEnPalabrasIm(mes)}: sin líneas, la hoja no sale en el PDF.`} />}
      {SECCIONES_CLIENTE[hoja].map(([sec, titulo]) => {
        const ls = filas.filter((f) => f.seccion === sec)
        return (
          <section key={sec} className="ime-sec">
            <div className="ime-sec-cab"><span>{titulo}</span><span>{fmtPesosIm(totalDe(sec))}</span></div>
            {sec === 'venta_periodo' && (
              <Vacio texto={dd?.ventaPeriodoCargada
                ? 'La deuda se compara contra esta venta.'
                : `Si no la cargás, la deuda se compara contra la venta de ${mesEnPalabrasIm(mes)} de todos los locales (${fmtPesosIm(dd?.ventaPeriodo)}).`} />
            )}
            {ls.map((f) => (
              <div key={f.id} className="ime-cl">
                {editable
                  ? <CampoTexto valor={f.concepto} max={CONCEPTO_MAX} etiqueta={`Concepto de ${titulo}`} disabled={ocupado} obligatorio
                      onGuardar={(t) => guardar(f, { concepto: t })} onError={onError} />
                  : <span className="ime-ln-con">{f.concepto}</span>}
                {editable
                  ? <CampoNum valor={num(f.monto)} disabled={ocupado} etiqueta={`Monto de ${f.concepto}`} onError={onError}
                      onGuardar={(v) => guardar(f, { monto: v })} />
                  : <span className="ime-cl-monto">{fmtPesosIm(num(f.monto))}</span>}
                {editable && (
                  <button type="button" className="ime-x" disabled={ocupado} aria-label={`Quitar ${f.concepto}`} title="Quitar la línea"
                    onClick={() => acciones.borrarLinea(Number(f.id))}>×</button>
                )}
              </div>
            ))}
            {editable && (
              <NuevaLineaCliente key={`${sec}:${ls.length}`} ocupado={ocupado} onError={onError}
                onAgregar={(concepto, monto) => acciones.linea({ local: null, mes, hoja, seccion: sec, concepto, monto, monto2: null, oculta: false, orden: ordenSiguiente(sec) })} />
            )}
          </section>
        )
      })}
    </>
  )
}

function NuevaLineaCliente({ ocupado, onError, onAgregar }) {
  const [abierta, setAbierta] = useState(false)
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState(null)
  const [err, setErr] = useState('')
  const enviando = useRef(false) // Enter en el monto puede disparar también el envío del formulario
  if (!abierta) return <button type="button" className="ime-add" disabled={ocupado} onClick={() => setAbierta(true)}>+ Agregar línea</button>
  const enviar = async (e, montoEnter) => {
    e?.preventDefault()
    if (enviando.current) return
    const c = concepto.trim()
    const m = montoEnter ?? monto
    if (!c) return setErr('Escribí el concepto.')
    if (m == null) return setErr('Escribí el monto.')
    setErr('')
    enviando.current = true
    // si se guardó, la sección se vuelve a armar y el formulario queda limpio
    try { await onAgregar(c, m) } finally { enviando.current = false }
  }
  return (
    <form className="ime-cl ime-cl-nueva" onSubmit={enviar}>
      <label className="rve-nom ime-texto">
        <input type="text" maxLength={CONCEPTO_MAX} value={concepto} placeholder="Concepto" aria-label="Concepto de la línea nueva"
          autoComplete="off" autoFocus onChange={(e) => setConcepto(e.target.value)} />
        <small>{concepto.length}/{CONCEPTO_MAX}</small>
      </label>
      <CampoNum valor={null} etiqueta="Monto de la línea nueva" placeholder="Monto" onError={onError}
        onGuardar={setMonto} onRestaurar={() => setMonto(null)} onEnter={(n) => enviar(null, n)} />
      <button type="submit" className="btn-sec ime-cl-ok" disabled={ocupado}>Agregar</button>
      <button type="button" className="ime-x" aria-label="Cancelar" title="Cancelar" onClick={() => { setAbierta(false); setErr('') }}>×</button>
      {err && <div className="rve-err-chico ime-cl-err">{err}</div>}
    </form>
  )
}

// ── Resumen ejecutivo: comentario por renglón ────────────────────────────────

function PanelResumen({ informe, pagina, interno, ocupado, acciones }) {
  const [abiertos, setAbiertos] = useState(() => new Set())
  const local = pagina.local || informe.locales?.[0]?.local
  const L = informe.locales?.find((l) => l.local === local)
  const filas = local ? resumenDe(informe, local) : []
  const ver = (f, v) => (f.formato === 'numero' ? fmtNumIm(v) : fmtPesosIm(v))
  return (
    <>
      <div className="ime-local">{L?.nombre || local}</div>
      <Vacio texto="La frase de cada renglón se arma sola con los números. El comentario es opcional y se agrega al final; se puede escribir aunque el mes esté cerrado." />
      {filas.map((f) => {
        const abierto = abiertos.has(f.clave) || !!f.comentario
        return (
          <div key={f.clave} className="ime-res">
            <div className="ime-res-cab">
              <strong>{f.titulo}</strong>
              <span>{ver(f, f.actual)}<small> · mes anterior {ver(f, f.anterior)}</small></span>
            </div>
            {abierto
              ? <TextoLargo key={`${local}:${f.clave}`} id={`ime-res-${f.clave}`} etiqueta={`Comentario de ${f.titulo}`} texto={f.comentario || ''}
                  max={COMENTARIO_MAX} placeholder="Ej.: subió por el aumento de proveedores de carnes." ocupado={ocupado} puedeEditar={interno}
                  onGuardar={(t) => acciones.texto({ local, clave: `resumen:${f.clave}`, texto: t })} />
              : interno && <button type="button" className="ime-add" onClick={() => setAbiertos((s) => new Set(s).add(f.clave))}>+ Comentario</button>}
          </div>
        )
      })}
    </>
  )
}
