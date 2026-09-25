import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useGroup } from '../context/GroupContext.jsx'
import AppLogo from '../components/AppLogo.jsx'

function IcoBuscar() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
function IcoFlecha() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}
function IcoSalir() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

// La misma pantalla que el selector de grupos de gestión: tarjetas grandes y
// un buscador, porque son más de 30 grupos.
export default function GroupSelectPage() {
  const { grupo, setGrupo } = useGroup()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [grupos, setGrupos] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    api.getGrupos().then(setGrupos).catch((err) => setError(err.message))
  }, [])

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (grupos || []).filter((g) => !t || g.toLowerCase().includes(t))
  }, [grupos, q])

  function pick(g) {
    setGrupo(g)
    navigate('/', { replace: true })
  }

  return (
    <div className="gs-root">
      <header className="gs-top">
        <AppLogo variant="horizontal" />
        <div className="gs-user">
          <span>{user?.nombre || user?.email}</span>
          <button className="gs-logout" onClick={logout}><IcoSalir /> Cerrar sesión</button>
        </div>
      </header>

      <div className="gs-body">
        <h1 className="gs-title">Seleccioná tu grupo de trabajo</h1>
        <p className="gs-sub">Elegí el grupo que querés analizar. Lo podés cambiar cuando quieras desde el menú.</p>

        <div className="gs-search">
          <IcoBuscar />
          <input
            autoFocus
            placeholder="Buscar grupo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && visibles.length === 1) pick(visibles[0]) }}
            aria-label="Buscar grupo"
          />
        </div>

        {error && <div className="login-err" style={{ maxWidth: 420, margin: '0 auto 20px' }}>{error}</div>}
        {!grupos && !error && <div className="gs-empty">Cargando grupos…</div>}
        {grupos && visibles.length === 0 && <div className="gs-empty">Ningún grupo coincide con "{q}".</div>}

        <div className="gs-grid">
          {visibles.map((g, i) => (
            <button
              key={g}
              type="button"
              className={'gs-card' + (g === grupo ? ' on' : '')}
              style={{ '--i': Math.min(i, 24) }}
              onClick={() => pick(g)}
            >
              <span className="gs-card-name">{g}</span>
              <span className="gs-card-foot"><span className="qac-arrow"><IcoFlecha /></span></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
