import { fmtMonto, fmtPct, mesCorto } from '../../lib/informe.js'

// El "P&L acumulado" de la planilla: bloques con etiqueta a la izquierda y dos
// grupos de columnas, el mes y el total del año, cada uno con su incidencia.
// Se usa igual en la pantalla y en la lámina de la presentación.
export default function TablaResumen({ mes, rMes, rAnio, vma = 'N/A', ipc = 'N/A', compacta = false }) {
  const filas = (bloque, lista) => lista.map((f, i) => (
    <tr key={bloque + f.clave} className={f.total ? 'rs-total' : ''}>
      {i === 0 && <th rowSpan={lista.length} className="rs-bloque">{bloque}</th>}
      <td className="rs-label">{f.label}</td>
      <td className="rs-num">{fmtMonto(f.monto)}</td>
      <td className="rs-pct">{fmtPct(f.pct)}</td>
      <td className="rs-num">{fmtMonto(buscar(rAnio, bloque, f.clave)?.monto)}</td>
      <td className="rs-pct">{fmtPct(buscar(rAnio, bloque, f.clave)?.pct)}</td>
    </tr>
  ))
  const im = rMes.indicadores
  const ia = rAnio.indicadores
  return (
    <table className={'tabla-resumen' + (compacta ? ' compacta' : '')}>
      <thead>
        <tr>
          <th />
          <th>Turno</th>
          <th>{mesCorto(mes)}</th>
          <th>% INC</th>
          <th>TOTALES {mes.slice(0, 4)}</th>
          <th>% INC</th>
        </tr>
      </thead>
      <tbody>
        {filas('VENTAS', rMes.ventas)}
        <tr className="rs-sep"><td colSpan={6} /></tr>
        <tr className="rs-ind"><th rowSpan={2} className="rs-bloque">Indicadores</th><td className="rs-label">VMA</td><td colSpan={2} className="rs-centro">{vma || 'N/A'}</td><td colSpan={2} /></tr>
        <tr className="rs-ind"><td className="rs-label">IPC</td><td colSpan={2} className="rs-centro">{ipc || 'N/A'}</td><td colSpan={2} /></tr>
        <tr className="rs-sep"><td colSpan={6} /></tr>
        <tr><th colSpan={2} className="rs-bloque">DÍAS</th><td colSpan={2} className="rs-centro">{fmtMonto(im.dias)}</td><td colSpan={2} className="rs-centro">{fmtMonto(ia.dias)}</td></tr>
        <tr className="rs-total"><th colSpan={2} className="rs-bloque">PROM DÍAS</th><td colSpan={2} className="rs-centro">{fmtMonto(im.promDias)}</td><td colSpan={2} className="rs-centro">{fmtMonto(ia.promDias)}</td></tr>
        <tr className="rs-sep"><td colSpan={6} /></tr>
        <tr><th colSpan={2} className="rs-bloque">PAX</th><td colSpan={2} className="rs-centro">{fmtMonto(im.pax)}</td><td colSpan={2} className="rs-centro">{fmtMonto(ia.pax)}</td></tr>
        <tr className="rs-total"><th colSpan={2} className="rs-bloque">PROM PAX</th><td colSpan={2} className="rs-centro">{fmtMonto(im.promPax)}</td><td colSpan={2} className="rs-centro">{fmtMonto(ia.promPax)}</td></tr>
        <tr className="rs-sep"><td colSpan={6} /></tr>
        {filas('CMV', rMes.cmv)}
        <tr className="rs-sep"><td colSpan={6} /></tr>
        <tr className="rs-destacado">
          <th colSpan={2} className="rs-bloque">Resultado Bruto</th>
          <td className="rs-num">{fmtMonto(rMes.resultadoBruto.monto)}</td><td className="rs-pct">{fmtPct(rMes.resultadoBruto.pct)}</td>
          <td className="rs-num">{fmtMonto(rAnio.resultadoBruto.monto)}</td><td className="rs-pct">{fmtPct(rAnio.resultadoBruto.pct)}</td>
        </tr>
        <tr className="rs-sep"><td colSpan={6} /></tr>
        {filas('EGRESOS', rMes.egresos)}
        <tr className="rs-sep"><td colSpan={6} /></tr>
        {filas('Resultado Económico', rMes.economico)}
        <tr className="rs-sep"><td colSpan={6} /></tr>
        {filas('Resultado Final', rMes.final)}
      </tbody>
    </table>
  )
}

// El año puede no tener el mismo renglón opcional (p. ej. "Otros"): se busca por clave.
function buscar(r, bloque, clave) {
  const lista = { VENTAS: r.ventas, CMV: r.cmv, EGRESOS: r.egresos, 'Resultado Económico': r.economico, 'Resultado Final': r.final }[bloque] || []
  return lista.find((f) => f.clave === clave)
}
