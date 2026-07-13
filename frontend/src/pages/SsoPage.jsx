import { useEffect, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// Destino del link "Reportes" de la app de gestión: recibe un ticket de un
// solo uso (60s) y lo canjea por una sesión propia, sin pedir credenciales
// de nuevo. Si el ticket es inválido/expiró, manda a /login con el motivo.
export default function SsoPage() {
  const { loginSso } = useAuth()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const tried = useRef(false)

  useEffect(() => {
    if (tried.current) return
    tried.current = true
    const ticket = searchParams.get('ticket')
    if (!ticket) { setError('Falta el ticket de acceso.'); return }
    loginSso(ticket)
      .then(() => setDone(true))
      .catch((err) => setError(err.message || 'No se pudo iniciar sesión'))
  }, [searchParams, loginSso])

  if (done) return <Navigate to="/" replace />
  if (error) return <Navigate to="/login" replace state={{ ssoError: error }} />

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <span className="spin" style={{ margin: '0 auto' }} />
        Ingresando desde gestión…
      </div>
    </div>
  )
}
