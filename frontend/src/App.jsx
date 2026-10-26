import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { api } from './lib/api.js'
import { useAuth } from './context/AuthContext.jsx'
import { useGroup } from './context/GroupContext.jsx'
import AppShell from './components/AppShell.jsx'
import LoginPage from './pages/LoginPage.jsx'
import SsoPage from './pages/SsoPage.jsx'
import GroupSelectPage from './pages/GroupSelectPage.jsx'
import InicioPage from './pages/InicioPage.jsx'
import ResumenPage from './pages/ResumenPage.jsx'
import PyLPage from './pages/PyLPage.jsx'
import InformePage from './pages/InformePage.jsx'
import ReporteVentasPage from './pages/ReporteVentasPage.jsx'
import CostoImpositivoPage from './pages/CostoImpositivoPage.jsx'
import AdminUsersPage from './pages/AdminUsersPage.jsx'

function RequireAuth({ children }) {
  const { user, ready } = useAuth()
  if (!ready) return null
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequireAdmin({ children }) {
  const { user } = useAuth()
  if (!user?.admin) return <Navigate to="/" replace />
  return children
}

// Grupos ya confirmados en esta sesión (no se vuelve a preguntar).
const gruposValidados = new Set()

function RequireGroup({ children }) {
  const { grupo, setGrupo } = useGroup()
  // El grupo elegido queda guardado en el navegador. Si en gestión lo
  // renombran o lo dan de baja, ese nombre ya no trae datos y todas las
  // pantallas quedan vacías (Trello #273: "GRUPO 3MONOS" pasó a "GRUPO
  // MONOS"). Se confirma contra la lista actual y, si no está, se vuelve al
  // selector. Si la consulta falla no se toca nada.
  useEffect(() => {
    if (!grupo || gruposValidados.has(grupo)) return
    let vigente = true
    api.getGrupos().then((lista) => {
      if (!vigente || !Array.isArray(lista)) return
      if (lista.includes(grupo)) gruposValidados.add(grupo)
      else setGrupo('')
    }).catch(() => {})
    return () => { vigente = false }
  }, [grupo, setGrupo])
  if (!grupo) return <Navigate to="/grupo" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/sso" element={<SsoPage />} />
      <Route
        path="/grupo"
        element={
          <RequireAuth>
            <GroupSelectPage />
          </RequireAuth>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <RequireGroup>
              <AppShell />
            </RequireGroup>
          </RequireAuth>
        }
      >
        <Route index element={<InicioPage />} />
        <Route path="dashboard" element={<ResumenPage />} />
        <Route path="pyl" element={<PyLPage />} />
        <Route path="reporte-mensual" element={<InformePage />} />
        <Route path="reporte-ventas" element={<ReporteVentasPage />} />
        <Route path="costo-impositivo" element={<CostoImpositivoPage />} />
        <Route
          path="admin/usuarios"
          element={
            <RequireAdmin>
              <AdminUsersPage />
            </RequireAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
