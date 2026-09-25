import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useGroup } from '../context/GroupContext.jsx'
import AppLogo from './AppLogo.jsx'
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
function IcoReporteMensual() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="17" rx="2"/>
      <line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <path d="M7 13h4"/><path d="M7 17h7"/>
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

function IcoInicio() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>
    </svg>
  )
}

// Las mismas secciones de siempre; el orden sigue el recorrido del dinero:
// resumen, lo que entra y sale, y los reportes que se arman con eso.
export const TABLEROS = [
  { to: '/dashboard',       label: 'Dashboard',          sub: 'Ventas, pagos y CMV del período', Icon: IcoDashboard },
  { to: '/pagos',           label: 'Pagos',              sub: 'Egresos por rubro y proveedor', Icon: IcoPagos },
  { to: '/ventas',          label: 'Ventas',             sub: 'Venta por local, canal y turno', Icon: IcoVentas },
  { to: '/cashflow',        label: 'Cashflow',           sub: 'Entradas y salidas de dinero', Icon: IcoCashflow },
  { to: '/pyl',             label: 'P&L',                sub: 'Resultado mensual por rubro', Icon: IcoPyl },
  { to: '/reporte-mensual', label: 'Reporte Mensual',    sub: 'Ventas mensuales con carga manual', Icon: IcoReporteMensual },
  { to: '/financiero',      label: 'Resumen Financiero', sub: 'Flujo, márgenes y rentabilidad', Icon: IcoResumenFin },
]

function iniciales(nombre, email) {
  const base = (nombre || email || '?').trim()
  const partes = base.split(/\s+/).filter(Boolean)
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || base.slice(0, 2).toUpperCase()
}

export default function Sidebar({ collapsed, mobileOpen, onNavigate }) {
  const { user, logout } = useAuth()
  const { grupo } = useGroup()
  const navigate = useNavigate()
  const [fotoRota, setFotoRota] = useState(false)

  const item = ({ to, label, Icon, end }) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
    >
      <Icon />
      <span className="nav-item-label">{label}</span>
    </NavLink>
  )

  return (
    <aside className={'sidebar' + (mobileOpen ? ' mobile-open' : '') + (collapsed ? ' collapsed' : '')}>
      <div className="sidebar-brand">
        <AppLogo variant="horizontal" />
      </div>

      {!collapsed && (
        <div className="sidebar-context">
          <div className="sidebar-context-label">Grupo</div>
          <div className="sidebar-app-name">{grupo}</div>
          <button className="sidebar-change-link" onClick={() => { onNavigate?.(); navigate('/grupo') }}>
            Cambiar grupo
          </button>
        </div>
      )}

      <nav className="sidebar-nav">
        {item({ to: '/', label: 'Inicio', Icon: IcoInicio, end: true })}
        <div className="nav-section-label">Tableros</div>
        {TABLEROS.map(item)}
        {user?.admin && (
          <>
            <div className="nav-section-label">Administración</div>
            {item({ to: '/admin/usuarios', label: 'Usuarios', Icon: IcoUsers })}
          </>
        )}
      </nav>

      {!collapsed && <EtlStatusBadge />}

      <div className="sidebar-user">
        <div className="sidebar-user-avatar" title={collapsed ? user?.nombre : undefined}>
          {user?.avatar_url && !fotoRota
            ? <img src={user.avatar_url} alt="" referrerPolicy="no-referrer" onError={() => setFotoRota(true)} />
            : iniciales(user?.nombre, user?.email)}
        </div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{user?.nombre || user?.email}</div>
          <div className="sidebar-version">{user?.admin ? 'Administrador' : 'Analista'}</div>
        </div>
        <button className="sidebar-logout" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión">
          <IcoLogout />
        </button>
      </div>
    </aside>
  )
}
