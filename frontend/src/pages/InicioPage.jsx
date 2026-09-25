import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useGroup } from '../context/GroupContext.jsx'
import { TABLEROS } from '../components/Sidebar.jsx'

function IcoCalendario() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="17" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" />
    </svg>
  )
}
function IcoCambiar() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )
}
function IcoFlecha() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

const fechaHoy = () => {
  const t = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Portada: el mismo "acceso rápido" de gestión y costos, con un tablero por
// tarjeta. Los íconos son los del menú, así se reconocen de un lado al otro.
export default function InicioPage() {
  const { user } = useAuth()
  const { grupo } = useGroup()
  const nombre = (user?.nombre || '').split(/\s+/)[0]

  return (
    <div className="page">
      <div className="inicio-hero">
        <div>
          <h2 className="page-title">{nombre ? `Hola, ${nombre}` : 'Hola'}</h2>
          <div className="inicio-fecha"><IcoCalendario /> {fechaHoy()}</div>
        </div>
        <Link to="/grupo" className="inicio-grupo-btn" title="Cambiar de grupo"><IcoCambiar /> {grupo}</Link>
      </div>

      <div className="section-label">Tableros</div>
      <div className="quick-actions-grid">
        {TABLEROS.map(({ to, label, sub, Icon }, i) => (
          <Link key={to} to={to} className="quick-action-card" style={{ '--i': i }}>
            {to === '/reporte-mensual' && <span className="qac-tag">Nuevo</span>}
            <div className="qac-icon"><Icon /></div>
            <div>
              <div className="qac-title">{label}</div>
              <div className="qac-sub">{sub}</div>
            </div>
            <div className="qac-arrow"><IcoFlecha /></div>
          </Link>
        ))}
      </div>
    </div>
  )
}
