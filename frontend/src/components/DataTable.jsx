import { fmtMoney, fmtNum } from '../lib/format.js'

const MAX_ROWS = 100

export default function DataTable({ meta, rows, totalRows }) {
  const shown = rows.slice(0, MAX_ROWS)

  return (
    <section className="tbl-card">
      <div className="tbl-head">
        <h4>Detalle</h4>
        <div className="info">Mostrando {shown.length} de {fmtNum(totalRows)} registros</div>
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
            <tr key={r.id ?? i}>
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
    </section>
  )
}
