export default function FilterBar({
  meta, filters, defaultDesde, options, onChange, onClear, matchCount,
  dateColValue, onDateColChange
}) {
  return (
    <section className="filters">
      {meta.dateColOptions && (
        <div className="fg">
          <label>Filtrar por fecha</label>
          <select value={dateColValue} onChange={(e) => onDateColChange(e.target.value)}>
            {meta.dateColOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="fg">
        <label>Desde</label>
        <input
          type="date"
          value={filters.desde || defaultDesde}
          onChange={(e) => onChange('desde', e.target.value)}
        />
      </div>
      <div className="fg">
        <label>Hasta</label>
        <input
          type="date"
          value={filters.hasta || ''}
          onChange={(e) => onChange('hasta', e.target.value)}
        />
      </div>

      {meta.filterFields.map((f) => (
        <div className="fg" key={f.key}>
          <label>{f.label}</label>
          <select value={filters[f.key] || ''} onChange={(e) => onChange(f.key, e.target.value)}>
            <option value="">Todos</option>
            {(f.options || options[f.key] || []).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      ))}

      <button className="btn-clear" type="button" onClick={onClear}>Limpiar</button>
      <div className="match">{matchCount} registros coinciden</div>
    </section>
  )
}
