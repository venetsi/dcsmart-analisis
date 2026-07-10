import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useGroup } from '../context/GroupContext.jsx'
import Logo from './Logo.jsx'
import EtlStatusBadge from './EtlStatusBadge.jsx'

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
        <span className="ic">◈</span> Dashboard
      </NavLink>
      <NavLink to="/pagos" className={navClass}>
        <span className="ic">◨</span> Pagos
      </NavLink>
      <NavLink to="/ventas" className={navClass}>
        <span className="ic">▤</span> Ventas
      </NavLink>
      <NavLink to="/cashflow" className={navClass}>
        <span className="ic">⇅</span> Cashflow
      </NavLink>
      <NavLink to="/pyl" className={navClass}>
        <span className="ic">▣</span> P&amp;L
      </NavLink>
      <NavLink to="/financiero" className={navClass}>
        <span className="ic">◆</span> Resumen Financiero
      </NavLink>

      {user?.admin && (
        <>
          <div className="sec">Administración</div>
          <NavLink to="/admin/usuarios" className={navClass}>
            <span className="ic">◉</span> Usuarios
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
        <button className="btn-out" onClick={logout}>Cerrar sesión</button>
      </div>
    </aside>
  )
}
