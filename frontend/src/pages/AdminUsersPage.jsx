import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

export default function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')

  function load(q) {
    api.getUsers(q).then(setUsers).catch((err) => setError(err.message))
  }

  // Debounce cubre también la carga inicial (search arranca en '', dispara a los 300ms).
  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  async function toggle(user, field) {
    const body = { enabled: user.acceso, is_admin: Boolean(user.grant?.is_admin) }
    body[field] = !body[field]
    try {
      await api.updateUserAccess(user.id, body)
      load(search)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <div className="page-hdr">
        <h2>Administrador de usuarios</h2>
        <p>
          Usuarios reales de la tabla <b>users</b> original (solo lectura). Habilitar/deshabilitar
          escribe únicamente en <code>dcsmart_analytics.access_grants</code> — la base de producción
          no se toca. Los roles <b>super_admin</b> y <b>dcsmart</b> (perfil DCADMIN) entran por defecto.
        </p>
      </div>

      <div style={{ marginBottom: 14 }}>
        <input
          className="search-box"
          placeholder="Buscar por nombre o email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <p className="login-err">{error}</p>}

      <section className="tbl-card">
        <table>
          <thead>
            <tr>
              <th>Usuario</th><th>Email</th><th>Roles (app original)</th>
              <th>Acceso analytics</th><th>Admin plataforma</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.nombre}</b></td>
                <td style={{ color: 'var(--txt2)' }}>{u.email}</td>
                <td>
                  {u.roles.map((r) => <span key={r} className="tag">{r}</span>)}
                  {u.por_rol && (
                    <span className="tag" style={{ background: 'rgba(8,124,133,.2)', color: 'var(--teal-l)' }}>
                      acceso por rol
                    </span>
                  )}
                </td>
                <td><span className={`sw ${u.acceso ? 'on' : ''}`} onClick={() => toggle(u, 'enabled')} /></td>
                <td>
                  <span
                    className={`sw ${u.por_rol || u.grant?.is_admin ? 'on' : ''}`}
                    style={u.por_rol ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                    title={u.por_rol ? 'Admin por rol' : undefined}
                    onClick={() => !u.por_rol && toggle(u, 'is_admin')}
                  />
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr><td colSpan={5} className="empty-state">Sin resultados.</td></tr>
            )}
          </tbody>
        </table>
      </section>
      <p className="note">
        Regla efectiva: <b>puede entrar = (rol permitido O habilitado manualmente) Y activo Y no revocado</b>.
      </p>
    </div>
  )
}
