// Panel "Datos de esta hoja" del editor del Reporte de Ventas: cada número de la
// hoja con su valor y de dónde sale (automático, calculado, a mano, falta o cerrado).
// Regla de oro: un dato que no está se ve "—" y FALTA, nunca 0.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fmtAR, parseNumeroAR } from '../../lib/reporteVentas.js'
import { mesEnPalabras } from './Paginas.jsx'

const esNum = (v) => v != null && Number.isFinite(v)
const MSG_NUMERO = 'No se entiende ese número. Escribilo así: 1.250.000 (con coma para los decimales).'

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const mesCorto = (mes) => `${MESES_CORTOS[Number(mes.slice(5, 7)) - 1]} ${mes.slice(2, 4)}`
const fechaCorta = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-AR')
}
const verNum = (v) => (esNum(v) ? fmtAR(v, Number.isInteger(v) ? 0 : 2) : '—')

// Texto con miles con punto mientras se escribe (la coma es el decimal).
function formatear(t) {
  const neg = t.trim().startsWith('-')
  const limpio = t.replace(/[^\d,]/g, '')
  const i = limpio.indexOf(',')
  const ent = (i === -1 ? limpio : limpio.slice(0, i)).replace(/^0+(?=\d)/, '')
  const dec = i === -1 ? null : limpio.slice(i + 1).replace(/,/g, '')
  const grupos = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return (neg ? '-' : '') + grupos + (dec === null ? '' : ',' + dec)
}

// Campo numérico: texto con miles con punto, lee con parseNumeroAR.
// Enter o salir del campo guarda; Escape o vaciarlo vuelve al original.
export function CampoNum({ valor, tieneCorreccion = false, disabled = false, etiqueta, onGuardar, onRestaurar, onEnter, onError, placeholder = '—' }) {
  const inicial = esNum(valor) ? verNum(valor) : ''
  const [texto, setTexto] = useState(inicial)
  const foco = useRef(false)
  const saltar = useRef(false)
  const caret = useRef(null)
  const ref = useRef(null)

  useEffect(() => { if (!foco.current) setTexto(inicial) }, [inicial])
  useLayoutEffect(() => {
    if (caret.current == null || !ref.current) return
    let sig = caret.current
    let pos = 0
    while (pos < texto.length && sig > 0) { if (/[\d,]/.test(texto[pos])) sig--; pos++ }
    ref.current.setSelectionRange(pos, pos)
    caret.current = null
  }, [texto])

  const cambiar = (e) => {
    const el = e.target
    caret.current = el.value.slice(0, el.selectionStart).replace(/[^\d,]/g, '').length
    setTexto(formatear(el.value))
  }
  const confirmar = () => {
    foco.current = false
    if (disabled) { saltar.current = false; setTexto(inicial); return } // guardando: no se manda otra vez
    if (saltar.current) { saltar.current = false; setTexto(inicial); return }
    const t = texto.trim()
    if (t === '') {
      if (tieneCorreccion) onRestaurar?.()
      else setTexto(inicial)
      return
    }
    const n = parseNumeroAR(t)
    if (n == null) { setTexto(inicial); onError?.(MSG_NUMERO); return }
    if (n === valor) { setTexto(inicial); return }
    onGuardar(n)
  }
  const tecla = (e) => {
    if (e.key === 'Enter') {
      const n = parseNumeroAR(texto)
      e.currentTarget.blur()
      if (n != null) onEnter?.(n)
    }
    else if (e.key === 'Escape') {
      saltar.current = true
      if (tieneCorreccion) onRestaurar?.()
      e.currentTarget.blur()
    }
  }
  // readOnly y no disabled mientras se guarda: un campo deshabilitado pierde el
  // foco sin blur y quedaba marcado como "en edición", sin refrescarse nunca más.
  return (
    <input ref={ref} className="rve-campo" type="text" inputMode="decimal" autoComplete="off" maxLength={20}
      aria-label={etiqueta} placeholder={placeholder} value={texto}
      readOnly={disabled} aria-disabled={disabled || undefined}
      onFocus={() => { foco.current = true }} onChange={cambiar} onBlur={confirmar} onKeyDown={tecla} />
  )
}

const Candado = () => (
  <svg viewBox="0 0 24 24" width={10} height={10} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)

const ETIQUETAS = {
  auto: ['AUTOMÁTICO', 'rve-b-auto'], calc: ['CALCULADO', 'rve-b-calc'], mano: ['A MANO', 'rve-b-mano'],
  falta: ['FALTA', 'rve-b-falta'], cerrado: ['CERRADO', 'rve-b-cerrado'],
}

function Fuente({ d, nota }) {
  const [txt, clase] = ETIQUETAS[d.fuente] || ETIQUETAS.falta
  return (
    <div className="rve-fuente">
      <span className={`rve-b ${clase}`}>{d.fuente === 'cerrado' && <Candado />}{txt}</span>
      {d.fuente === 'mano' && d.original != null && <span className="rve-orig" title="Valor automático">{verNum(d.original)}</span>}
      {d.fuente === 'mano' && (d.por || d.at) && (
        <small>{d.por ? `por ${d.por}` : ''}{d.at ? ` el ${fechaCorta(d.at)}` : ''}</small>
      )}
      {d.fuente === 'falta' && d.parcial && <small className="rve-parcial">{textoParcial(d.parcial)}</small>}
      {nota && <small>{nota}</small>}
    </div>
  )
}

// Pista de una suma automática incompleta: no es un dato, se carga a mano si sirve.
function textoParcial({ valor, cajas, sin }) {
  const suma = `parcial: ${verNum(valor)}`
  if (esNum(cajas) && esNum(sin) && sin > 0) return `${suma} (${fmtAR(sin)} de ${fmtAR(cajas)} cajas sin dato)`
  return `${suma} (las cajas no lo informaron)`
}

const NOTA_CALC = { 'Local': 'Venta del mes menos los demás canales' }

// `interno`: equipo DC. En un mes abierto edita lo automático, lo cargado a mano
// y lo que falta; en uno cerrado solo completa lo que la foto no trae (FALTA) y
// corrige o quita lo que se completó después (A MANO). El servidor lo valida igual.
export default function PanelDatos({ reporte, pagina, data, interno, cerradoMes, ocupado, onGuardar, onError, nombreLocal }) {
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoImporte, setNuevoImporte] = useState(null)
  const [claveImporte, setClaveImporte] = useState(0)
  const [errNuevo, setErrNuevo] = useState('')

  const l = pagina?.local ? reporte.locales.find((x) => x.local === pagina.local) : null
  const mesesCerrados = new Set(data.cierres.map((c) => c.mes))
  const abierto = (mes) => !mesesCerrados.has(mes)
  // Fuentes que se pueden tocar según el mes.
  const tocable = (mes, d) => (abierto(mes) ? ['auto', 'mano', 'falta'] : ['mano', 'falta']).includes(d.fuente)

  if (!pagina || pagina.tipo === 'portada' || pagina.tipo === 'contraportada') {
    return <PanelVacio texto="Esta hoja no tiene datos para editar." />
  }
  if (pagina.tipo === 'comparativo') {
    return <PanelVacio texto="Esta hoja solo compara con el año anterior. Para corregir un número, usá la hoja histórico del local." />
  }
  if (pagina.tipo === 'consolidado') {
    return <PanelVacio texto="El consolidado suma las ventas de cada local. Para corregir un número, elegí la hoja de ese local." />
  }
  if (!l) return <PanelVacio texto="Esta hoja no tiene datos para editar." />

  // Fila editable: etiqueta, dato, fuente. `mes` es el mes del dato.
  const fila = ({ clave, etiqueta, mes, dato, d, nota }) => {
    const editable = interno && tocable(mes, d) && !ocupado
    const original = d.fuente === 'mano' ? (d.original ?? null) : d.fuente === 'auto' ? d.valor : null
    const quitar = !esNum(original) && d.fuente === 'mano' && dato.startsWith('canal:')
    const guardar = (valor) => onGuardar({ local: l.local, mes, dato, valor, original })
    return (
      <tr key={clave}>
        <td className="rve-dato">{etiqueta}</td>
        <td className="rve-valor">
          {interno && tocable(mes, d)
            ? <CampoNum valor={d.valor} tieneCorreccion={d.fuente === 'mano'} disabled={!editable} etiqueta={`${etiqueta}, ${mesEnPalabras(mes)}`}
                onGuardar={guardar} onRestaurar={() => guardar(null)} onError={onError} />
            : <span className={esNum(d.valor) && d.valor < 0 ? 'rve-neg' : undefined}>{verNum(d.valor)}</span>}
        </td>
        <td className="rve-src">
          <Fuente d={d} nota={nota} />
          {editable && d.fuente === 'mano' && (
            <button type="button" className="rve-volver" onClick={() => guardar(null)}>{quitar ? 'Quitar' : 'Volver al original'}</button>
          )}
        </td>
      </tr>
    )
  }

  const encabezado = (
    <thead><tr><th>Dato</th><th>Valor</th><th>De dónde sale</th></tr></thead>
  )
  let cuerpo = null
  let agregar = null

  if (pagina.tipo === 'mes') {
    const mes = reporte.mes
    cuerpo = [
      fila({ clave: 'venta', etiqueta: 'Venta total', mes, dato: 'venta', d: l.venta }),
      fila({ clave: 'cubiertos', etiqueta: 'Cubiertos', mes, dato: 'cubiertos', d: l.cubiertos }),
      fila({ clave: 'ordenes', etiqueta: 'Órdenes', mes, dato: 'ordenes', d: l.ordenes }),
      ...l.canales.map((c) => fila({
        clave: `canal:${c.nombre}`, etiqueta: c.nombre, mes, dato: `canal:${c.nombre}`, d: c,
        nota: c.fuente === 'calc' ? NOTA_CALC[c.nombre] : undefined,
      })),
    ]
    if (interno && abierto(mes)) {
      const agregarCanal = (e, importeEnter) => {
        e?.preventDefault()
        const importe = importeEnter ?? nuevoImporte
        const nombre = nuevoNombre.trim()
        if (!nombre) return setErrNuevo('Escribí el nombre del canal.')
        if (nombre.toLowerCase() === 'local') return setErrNuevo('"Local" se calcula solo: es la venta menos los demás canales.')
        if (l.canales.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) return setErrNuevo('Ese canal ya está en la hoja. Corregí su importe en la tabla.')
        if (!esNum(importe)) return setErrNuevo('Escribí el importe del canal.')
        setErrNuevo('')
        onGuardar({ local: l.local, mes, dato: `canal:${nombre}`, valor: importe, original: null }).then((ok) => {
          if (ok) { setNuevoNombre(''); setNuevoImporte(null); setClaveImporte((k) => k + 1) }
        })
      }
      agregar = (
        <form className="rve-agregar" onSubmit={agregarCanal}>
          <div className="rve-k">+ Agregar canal</div>
          <div className="rve-agregar-fila">
            <label className="rve-nom">
              <input type="text" maxLength={40} placeholder="Nombre (ej. Eventos)" value={nuevoNombre} aria-label="Nombre del canal"
                autoComplete="off" onChange={(e) => setNuevoNombre(e.target.value)} />
              <small>{nuevoNombre.length}/40</small>
            </label>
            <CampoNum key={claveImporte} valor={null} etiqueta="Importe del canal" placeholder="Importe"
              onGuardar={(n) => setNuevoImporte(n)} onEnter={(n) => agregarCanal(null, n)} onRestaurar={() => setNuevoImporte(null)} onError={onError} />
            <button type="submit" className="btn-sec" disabled={ocupado}>Agregar</button>
          </div>
          {errNuevo && <div className="rve-err-chico">{errNuevo}</div>}
        </form>
      )
    }
  } else if (pagina.tipo === 'historico') {
    cuerpo = l.historico.flatMap((h) => [
      <tr key={`h-${h.mes}`} className="rve-sub"><td colSpan={3}>{mesEnPalabras(h.mes)}{mesesCerrados.has(h.mes) ? ' · cerrado' : ''}</td></tr>,
      fila({ clave: `${h.mes}:venta`, etiqueta: `${mesCorto(h.mes)} · Venta`, mes: h.mes, dato: 'venta', d: h.venta }),
      fila({ clave: `${h.mes}:cubiertos`, etiqueta: `${mesCorto(h.mes)} · Cubiertos`, mes: h.mes, dato: 'cubiertos', d: h.cubiertos }),
      fila({ clave: `${h.mes}:ordenes`, etiqueta: `${mesCorto(h.mes)} · Órdenes`, mes: h.mes, dato: 'ordenes', d: h.ordenes }),
    ])
  } else if (pagina.tipo === 'delivery') {
    const filas = l.delivery.filter((d) => Object.values(d.apps).some((a) => esNum(a.venta)))
    cuerpo = filas.flatMap((d) => [
      <tr key={`h-${d.mes}`} className="rve-sub"><td colSpan={3}>{mesEnPalabras(d.mes)}</td></tr>,
      ...Object.entries(d.apps).map(([app, a]) => fila({
        clave: `${d.mes}:${app}`, etiqueta: `${app} · Tickets`, mes: d.mes, dato: `tickets:${app}`,
        d: a.ticketsDato,
      })),
    ])
  }

  return (
    <div className="rve-panel-int">
      <div className="rve-k">Datos de esta hoja</div>
      <div className="rve-titulo-panel">{nombreLocal(l.local)}</div>
      {!interno && <div className="rve-solo-lectura">Solo el equipo DC puede corregir los datos.</div>}
      {interno && cerradoMes && (
        <div className="rve-solo-lectura">Mes cerrado: lo que quedó en el cierre no se edita. Solo se completan los datos que faltan.</div>
      )}
      <table className="rve-tabla">{encabezado}<tbody>{cuerpo}</tbody></table>
      {agregar}
    </div>
  )
}

function PanelVacio({ texto }) {
  return (
    <div className="rve-panel-int">
      <div className="rve-k">Datos de esta hoja</div>
      <p className="rve-vacio">{texto}</p>
    </div>
  )
}
