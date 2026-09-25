import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'

// Armazón igual al de gestión y costos: sidebar colapsable a un riel de íconos
// (la preferencia se recuerda), y en celular una barra arriba con el menú.
const CLAVE_COLAPSADO = 'dcsmart_analytics_sidebar_colapsado'

function leerColapsado() {
  try { return localStorage.getItem(CLAVE_COLAPSADO) === '1' } catch { return false }
}

function IcoMenu() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function IcoChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

// Franja del ambiente de dev (build con VITE_APP_ENV=dev). Mismo aviso que en
// gestión: los datos son una copia y nada de lo que se haga acá toca producción.
function AvisoAmbiente() {
  if (import.meta.env.VITE_APP_ENV !== 'dev') return null
  return (
    <div className="aviso-ambiente" role="note">
      <strong>Ambiente de pruebas</strong>
      <span>Datos copiados de producción. Lo que cargues acá no llega a producción.</span>
    </div>
  )
}

export default function AppShell() {
  const [colapsado, setColapsado] = useState(leerColapsado)
  const [menuMobile, setMenuMobile] = useState(false)
  const location = useLocation()

  useEffect(() => { setMenuMobile(false) }, [location.pathname])

  const alternar = () => {
    setColapsado((c) => {
      try { localStorage.setItem(CLAVE_COLAPSADO, c ? '0' : '1') } catch { /* modo privado */ }
      return !c
    })
  }

  const collapsed = colapsado && !menuMobile

  return (
    <div className="app-layout">
      <div className={'sidebar-mobile-backdrop' + (menuMobile ? ' open' : '')} onClick={() => setMenuMobile(false)} />
      <Sidebar collapsed={collapsed} mobileOpen={menuMobile} onNavigate={() => setMenuMobile(false)} />
      <button
        className={'sidebar-collapse-toggle' + (colapsado ? ' collapsed' : '')}
        onClick={alternar}
        title={colapsado ? 'Expandir menú' : 'Colapsar menú'}
        aria-label={colapsado ? 'Expandir menú' : 'Colapsar menú'}
      >
        <span className={colapsado ? 'flipped' : ''}><IcoChevronLeft /></span>
      </button>
      <div className="app-body">
        <AvisoAmbiente />
        <div className="mobile-topbar">
          <button className="mobile-topbar-menu" onClick={() => setMenuMobile(true)} aria-label="Abrir menú">
            <IcoMenu />
          </button>
          <span className="mobile-topbar-title">Analytics</span>
        </div>
        <main className="app-main">
          <div className="main">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
