import { useEffect, useRef, useState } from 'react'
import { SECCIONES, fmtMonto, fmtPct, pct, nombreMes } from '../../lib/informe.js'

// El detalle del P&L con la estructura de la planilla, editable:
// - clic en un monto para corregirlo (queda marcado y se puede volver al de gestión);
// - cada línea de gestión se puede ocultar o mover de sección (se recuerda para el grupo);
// - cada sección tiene "Agregar línea" para lo que no pasa por gestión.

// Siempre visibles, aunque estén vacías: son los renglones de la planilla y
// ahí se cargan los manuales. Las demás aparecen solo si tienen algo.
const SIEMPRE = new Set(['ventas', 'cmv', 'alquiler', 'publicidad', 'descartables', 'instalaciones', 'financieros', 'sueldos', 'sueldos_socios', 'desvinculaciones', 'honorarios', 'eventos', 'impositivos', 'pasivo', 'dividendos'])

export function parseMonto(txt) {
  const s = String(txt ?? '').trim().replace(/\$/g, '').replace(/\s/g, '')
  if (!s) return 0
  // "1.234.567,50" (es-AR) o "1234567.5"
  const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : (/^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s)
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

function MontoCelda({ valor, editable, onCambio, editado, original, titulo }) {
  const [editando, setEditando] = useState(false)
  const [txt, setTxt] = useState('')
  const [error, setError] = useState(false)
  const ref = useRef(null)
  useEffect(() => { if (editando) ref.current?.select() }, [editando])

  if (!editable) return <span className="dt-monto">{valor ? fmtMonto(valor) : ''}</span>
  if (editando) {
    const confirmar = () => {
      const n = parseMonto(txt)
      if (n === null) { setError(true); return }
      setEditando(false); setError(false)
      if (n !== valor) onCambio(n)
    }
    return (
      <input
        ref={ref}
        className={'dt-input' + (error ? ' error' : '')}
        value={txt}
        inputMode="decimal"
        aria-label={titulo}
        title={error ? 'Número inválido: usá 1.234.567 o 1234567,50' : 'Enter para guardar, Esc para cancelar'}
        onChange={(e) => { setTxt(e.target.value); setError(false) }}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirmar()
          if (e.key === 'Escape') { setEditando(false); setError(false) }
        }}
      />
    )
  }
  return (
    <button
      type="button"
      className={'dt-monto dt-editable' + (editado ? ' editado' : '')}
      onClick={() => { setTxt(valor ? String(Math.round(valor * 100) / 100).replace('.', ',') : ''); setEditando(true) }}
      title={editado ? `Corregido a mano. En gestión: ${fmtMonto(original)}` : 'Clic para corregir'}
    >
      {valor ? fmtMonto(valor) : <span className="dt-vacio">—</span>}
    </button>
  )
}

function ConceptoCelda({ valor, onCambio }) {
  const [txt, setTxt] = useState(valor)
  useEffect(() => setTxt(valor), [valor])
  return (
    <span className="dt-concepto-wrap">
      <input
        className="dt-concepto-input"
        value={txt}
        maxLength={80}
        placeholder="Nombre de la línea (ej. IVA 08-26)"
        onChange={(e) => setTxt(e.target.value)}
        onBlur={() => { if (txt !== valor) onCambio(txt) }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
      {txt.length > 60 && <small className="dt-contador">{txt.length}/80</small>}
    </span>
  )
}

function Icono({ d }) {
  return <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
}
const IcoOjo = () => <Icono d={<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>} />
const IcoOjoTachado = () => <Icono d={<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>} />
const IcoDeshacer = () => <Icono d={<><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></>} />
const IcoBorrar = () => <Icono d={<><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></>} />

export default function TablaDetalle({ informe, mes, editable, onAjuste, onRestaurar, onOcultar, onMover, onManualCambio, onManualBorrar, onManualAgregar }) {
  const vt = informe.totales.ventas
  const S = Object.fromEntries(informe.secciones.map((s) => [s.key, s]))
  const visibles = informe.secciones.filter((s) => SIEMPRE.has(s.key) || s.lineas.length)

  const filasSeccion = (s) => {
    const out = []
    out.push(<tr key={s.key + '-h'} className="dt-sec"><td colSpan={8}>{s.num}- {s.titulo}</td></tr>)
    for (const l of s.lineas) {
      const manual = l.origen === 'manual'
      out.push(
        <tr key={l.clave} className={'dt-linea' + (l.oculto ? ' oculta' : '') + (manual ? ' manual' : '')}>
          <td className="dt-label">
            {manual && editable
              ? <ConceptoCelda valor={l.concepto} onCambio={(c) => onManualCambio(l.id, { concepto: c })} />
              : <span title={l.rubros?.length ? 'De gestión: ' + l.rubros.map((r) => `${r.rubro} / ${r.categoria}`).join(' · ') : undefined}>{l.concepto}</span>}
            {manual && <span className="dt-tag">a mano</span>}
            {l.editado && <span className="dt-tag dt-tag-editado">editado</span>}
          </td>
          <td className="dt-num fuerte">{l.total ? fmtMonto(l.total) : ''}</td>
          <td className="dt-pct">{fmtPct(pct(l.total, vt.total))}</td>
          <td className="dt-num">
            <MontoCelda valor={l.col1} editable={editable && !l.oculto} editado={l.editado} original={l.auto?.col1} titulo={`${l.concepto} columna 1`}
              onCambio={(n) => (manual ? onManualCambio(l.id, { col1: n }) : onAjuste(l.clave, { col1: n }))} />
          </td>
          <td className="dt-pct">{fmtPct(pct(l.col1, vt.col1))}</td>
          <td className="dt-num">
            <MontoCelda valor={l.col2} editable={editable && !l.oculto} editado={l.editado} original={l.auto?.col2} titulo={`${l.concepto} columna 2`}
              onCambio={(n) => (manual ? onManualCambio(l.id, { col2: n }) : onAjuste(l.clave, { col2: n }))} />
          </td>
          <td className="dt-pct">{fmtPct(pct(l.col2, vt.col2))}</td>
          <td className="dt-acciones">
            {editable && !manual && s.key !== 'ventas' && l.rubros?.length > 0 && (
              <select className="dt-mover" value={s.key} title="Mover a otra sección (se recuerda para todo el grupo)" aria-label={`Mover ${l.concepto} a otra sección`}
                onChange={(e) => onMover(l, e.target.value)}>
                {SECCIONES.filter((x) => x.key !== 'ventas').map((x) => <option key={x.key} value={x.key}>{x.num} {x.titulo}</option>)}
                <option value="excluido">No va en el P&amp;L</option>
              </select>
            )}
            {editable && l.editado && <button type="button" className="dt-ico" title="Volver al valor de gestión" onClick={() => onRestaurar(l.clave)}><IcoDeshacer /></button>}
            {editable && !manual && <button type="button" className="dt-ico" title={l.oculto ? 'Mostrar (vuelve a sumar)' : 'Ocultar (deja de sumar)'} onClick={() => onOcultar(l.clave, !l.oculto)}>{l.oculto ? <IcoOjoTachado /> : <IcoOjo />}</button>}
            {editable && manual && <button type="button" className="dt-ico dt-ico-rojo" title="Borrar línea" onClick={() => onManualBorrar(l.id)}><IcoBorrar /></button>}
          </td>
        </tr>
      )
    }
    if (editable) {
      out.push(
        <tr key={s.key + '-add'} className="dt-add"><td colSpan={8}>
          <button type="button" onClick={() => onManualAgregar(s.key)}>+ Agregar línea en {s.titulo}</button>
        </td></tr>
      )
    }
    out.push(
      <tr key={s.key + '-t'} className="dt-total">
        <td className="dt-label">TOTAL {s.num}</td>
        <td className="dt-num">{fmtMonto(s.total)}</td><td className="dt-pct">{fmtPct(pct(s.total, vt.total))}</td>
        <td className="dt-num">{fmtMonto(s.col1)}</td><td className="dt-pct">{fmtPct(pct(s.col1, vt.col1))}</td>
        <td className="dt-num">{fmtMonto(s.col2)}</td><td className="dt-pct">{fmtPct(pct(s.col2, vt.col2))}</td>
        <td />
      </tr>
    )
    return out
  }

  const resultado = (clave, texto, v, clase = 'dt-resultado') => (
    <tr key={clave} className={clase}>
      <td className="dt-label">{texto}</td>
      <td className="dt-num">{fmtMonto(v.total)}</td><td className="dt-pct">{fmtPct(pct(v.total, vt.total))}</td>
      <td className="dt-num">{fmtMonto(v.col1)}</td><td className="dt-pct">{fmtPct(pct(v.col1, vt.col1))}</td>
      <td className="dt-num">{fmtMonto(v.col2)}</td><td className="dt-pct">{fmtPct(pct(v.col2, vt.col2))}</td>
      <td />
    </tr>
  )

  const filas = []
  let bloqueAnterior = null
  for (const s of visibles) {
    if (s.bloque !== bloqueAnterior && s.num.includes('.')) {
      filas.push(<tr key={'b-' + s.bloque} className="dt-bloque"><td colSpan={8}>{s.bloque}</td></tr>)
    }
    bloqueAnterior = s.bloque
    filas.push(...filasSeccion(s))
    if (s.key === 'cmv') filas.push(resultado('bruto', '3- RESULTADO BRUTO (1-2)', informe.totales.resultadoBruto))
    if (s.key === 'impositivos') filas.push(resultado('eco', '11.- RESULTADO ECONÓMICO', informe.totales.resultadoEconomico))
  }
  filas.push(resultado('final', `RESULTADO ${nombreMes(mes).toUpperCase()}`, informe.totales.resultadoFinal, 'dt-resultado dt-final'))

  return (
    <div className="dt-wrap">
      <table className="tabla-detalle">
        <thead>
          <tr>
            <th className="dt-label">Concepto</th>
            <th>Total</th><th>%</th>
            <th title="Bancarizado / facturado">1 · Bancarizado</th><th>%</th>
            <th title="Efectivo / sin factura">2 · Efectivo</th><th>%</th>
            <th />
          </tr>
        </thead>
        <tbody>{filas}</tbody>
      </table>
      {S.otros.lineas.length > 0 && <p className="dt-nota">Las líneas en "8 Otros" no tienen sección: movelas con el selector de la derecha y queda recordado para los próximos meses.</p>}
    </div>
  )
}
