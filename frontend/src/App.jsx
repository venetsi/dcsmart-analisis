import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { useGroup } from './context/GroupContext.jsx'
import AppShell from './components/AppShell.jsx'
import LoginPage from './pages/LoginPage.jsx'
import SsoPage from './pages/SsoPage.jsx'
import GroupSelectPage from './pages/GroupSelectPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import ResumenPage from './pages/ResumenPage.jsx'
import PyLPage from './pages/PyLPage.jsx'
import ResumenFinancieroPage from './pages/ResumenFinancieroPage.jsx'
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

function RequireGroup({ children }) {
  const { grupo } = useGroup()
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
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<ResumenPage />} />
        <Route path="pagos" element={<DashboardPage key="pagos" screen="pagos" />} />
        <Route path="ventas" element={<DashboardPage key="ventas" screen="ventas" />} />
        <Route path="cashflow" element={<DashboardPage key="cashflow" screen="cashflow" />} />
        <Route path="pyl" element={<PyLPage />} />
        <Route path="financiero" element={<ResumenFinancieroPage />} />
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
