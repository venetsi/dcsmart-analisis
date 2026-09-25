// Encabezado de página con el mismo tratamiento que gestión y costos: título
// grande, chips del contexto (grupo y local) y una bajada corta. Las acciones
// (exportar, etc.) van a la derecha.
export default function PageHeader({ title, chips = [], sub, actions, className = '' }) {
  return (
    <div className={`page-head${className ? ' ' + className : ''}`}>
      <div className="page-head-left">
        <h2 className="page-title">{title}</h2>
        {chips.filter(Boolean).length > 0 && (
          <div className="page-chips">
            {chips.filter(Boolean).map((c, i) => (
              <span key={i} className={'local-badge' + (i > 0 ? ' local-badge-soft' : '')}>
                {c}
              </span>
            ))}
          </div>
        )}
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}
