import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'

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
  return (
    <>
      <AvisoAmbiente />
      <div className="app">
        <Sidebar />
        <main className="main">
          <Outlet />
        </main>
      </div>
    </>
  )
}
