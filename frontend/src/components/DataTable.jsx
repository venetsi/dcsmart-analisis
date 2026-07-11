import { useEffect, useState } from 'react'
import { fmtMoney, fmtNum } from '../lib/format.js'

const PAGE_SIZE = 100

export default function DataTable({ meta, rows, totalRows }) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))

  // Al cambiar de dataset/filtros (cambia la cantidad de filas) volvemos a la página 1.
  useEffect(() => { setPage(0) }, [rows])

  const start = page * PAGE_SIZE
  const shown = rows.slice(start, start + PAGE_SIZE)
  const hasta = start + shown.length

  return (
    <section className="tbl-card">
      <div className="tbl-head">
        <h4>Detalle</h4>
        <div className="info">
          {rows.length ? `${fmtNum(start + 1)}–${fmtNum(hasta)} de ${fmtNum(rows.length)}` : '0'} filas
          {totalRows > rows.length ? ` (de ${fmtNum(totalRows)} traídas)` : ''}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            {meta.columns.map((c) => (
              <th key={c.key} className={c.numeric ? 'num' : ''}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={r.id ?? start + i}>
              {meta.columns.map((c) => {
                const v = r[c.key]
                if (c.pill) {
                  return <td key={c.key}><span className={`pill ${c.pill(v)}`}>{v}</span></td>
                }
                if (c.money) {
                  const n = Number(v)
                  const style = meta.negativeCapable && n < 0 ? { color: 'var(--bad)' } : undefined
                  return <td key={c.key} className="num" style={style}>{fmtMoney(n)}</td>
                }
                if (c.numeric) {
                  return <td key={c.key} className="num">{fmtNum(v)}</td>
                }
                return <td key={c.key}>{v ?? '—'}</td>
              })}
            </tr>
          ))}
          {!shown.length && (
            <tr><td colSpan={meta.columns.length} className="empty-state">Sin registros para los filtros actuales.</td></tr>
          )}
        </tbody>
      </table>
      {pages > 1 && (
        <div className="pager">
          <button type="button" onClick={() => setPage(0)} disabled={page === 0}>« Primera</button>
          <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>‹ Anterior</button>
          <span className="pager-info">Página {page + 1} de {pages}</span>
          <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}>Siguiente ›</button>
          <button type="button" onClick={() => setPage(pages - 1)} disabled={page >= pages - 1}>Última »</button>
        </div>
      )}
    </section>
  )
}
