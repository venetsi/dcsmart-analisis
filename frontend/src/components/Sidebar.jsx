import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useGroup } from '../context/GroupContext.jsx'
import Logo from './Logo.jsx'
import EtlStatusBadge from './EtlStatusBadge.jsx'

/* ── SVG icons (estilo Feather, igual criterio que la app de gestión) ── */
function IcoDashboard() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/>
      <rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
      <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  )
}
function IcoPagos() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  )
}
function IcoVentas() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  )
}
function IcoCashflow() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3v6h-6"/>
      <path d="M21 9a9 9 0 0 0-15-6.7L3 5"/>
      <path d="M7 21v-6h6"/>
      <path d="M3 15a9 9 0 0 0 15 6.7l3-2.7"/>
    </svg>
  )
}
function IcoPyl() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="16 4 16 9 21 9"/>
      <path d="M8 13h6"/><path d="M8 17h4"/>
    </svg>
  )
}
function IcoResumenFin() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 7v5l3.5 2"/>
    </svg>
  )
}
function IcoUsers() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}
function IcoLogout() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}

function navClass({ isActive }) {
  return 'nav-item' + (isActive ? ' on' : '')
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { grupo } = useGroup()

  return (
    <aside className="side">
      <div className="brand">
        <Logo size={34} />
        <h1>
          DCSMART <span>Analytics</span>
          <small>analisis.dcsmart.app</small>
        </h1>
      </div>

      <div className="grupo-box">
        <span>Grupo<br /><b>{grupo}</b></span>
        <Link to="/grupo">Cambiar</Link>
      </div>

      <div className="sec">Tableros</div>
      <NavLink to="/dashboard" className={navClass}>
        <span className="ic"><IcoDashboard /></span> Dashboard
      </NavLink>
      <NavLink to="/pagos" className={navClass}>
        <span className="ic"><IcoPagos /></span> Pagos
      </NavLink>
      <NavLink to="/ventas" className={navClass}>
        <span className="ic"><IcoVentas /></span> Ventas
      </NavLink>
      <NavLink to="/cashflow" className={navClass}>
        <span className="ic"><IcoCashflow /></span> Cashflow
      </NavLink>
      <NavLink to="/pyl" className={navClass}>
        <span className="ic"><IcoPyl /></span> P&amp;L
      </NavLink>
      <NavLink to="/financiero" className={navClass}>
        <span className="ic"><IcoResumenFin /></span> Resumen Financiero
      </NavLink>

      {user?.admin && (
        <>
          <div className="sec">Administración</div>
          <NavLink to="/admin/usuarios" className={navClass}>
            <span className="ic"><IcoUsers /></span> Usuarios
          </NavLink>
        </>
      )}

      <div className="foot">
        <EtlStatusBadge />
        <div className="userbox">
          <div className="av">{user?.nombre?.[0]?.toUpperCase() || '?'}</div>
          <div>
            <div className="nm">{user?.nombre}</div>
            <div className="rl">{user?.admin ? 'DCADMIN' : 'Analista'}</div>
          </div>
        </div>
        <button className="btn-out" onClick={logout}><IcoLogout /> Cerrar sesión</button>
      </div>
    </aside>
  )
}
