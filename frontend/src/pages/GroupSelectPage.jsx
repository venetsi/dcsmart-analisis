import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useGroup } from '../context/GroupContext.jsx'
import Logo from '../components/Logo.jsx'

export default function GroupSelectPage() {
  const { grupo, setGrupo } = useGroup()
  const navigate = useNavigate()
  const [grupos, setGrupos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getGrupos().then(setGrupos).catch((err) => setError(err.message))
  }, [])

  function pick(g) {
    setGrupo(g)
    navigate('/pagos', { replace: true })
  }

  return (
    <div className="login-wrap">
      <div className="login-card grupo-card">
        <div className="brand"><Logo /></div>
        <h1>DCSMART <span>Analytics</span></h1>
        <div className="dom">¿Con qué grupo vas a trabajar?</div>
        {error && <div className="login-err">{error}</div>}
        {!grupos && !error && <div className="login-note">Cargando grupos…</div>}
        <div className="grupo-grid">
          {(grupos || []).map((g) => (
            <button
              key={g}
              type="button"
              className={'grupo-btn' + (g === grupo ? ' on' : '')}
              onClick={() => pick(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
