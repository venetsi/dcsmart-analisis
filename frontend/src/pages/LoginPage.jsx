import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Logo from '../components/Logo.jsx'

export default function LoginPage() {
  const { user, ready, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (ready && user) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('Ingresá email y contraseña.'); return }
    setLoading(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Credenciales inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand"><Logo /></div>
        <h1>DCSMART <span>Analytics</span></h1>
        <div className="dom">analisis.dcsmart.app</div>
        <form onSubmit={handleSubmit}>
          <label htmlFor="lg-email">Email</label>
          <input
            id="lg-email"
            type="email"
            autoComplete="username"
            placeholder="tu@dcsmart.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label htmlFor="lg-pass">Contraseña</label>
          <input
            id="lg-pass"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn-login" type="submit" disabled={loading}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
        {error && <div className="login-err">{error}</div>}
        <div className="login-note">
          Ingresan los perfiles <b>DCADMIN</b> (roles super_admin / dcsmart) o usuarios
          habilitados individualmente por un administrador de la plataforma.
        </div>
      </div>
    </div>
  )
}
