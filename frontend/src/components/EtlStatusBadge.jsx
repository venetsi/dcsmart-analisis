import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

export default function EtlStatusBadge() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    api.getEtlStatus().then(setStatus).catch(() => setStatus(null))
  }, [])

  if (!status?.corte) return null

  const ok = !Number(status.mismatches) && !Number(status.errores)
  return (
    <div className="etl-badge">
      Último corte: <b>{status.corte}</b> · cuadratura{' '}
      <b style={{ color: ok ? 'var(--ok)' : 'var(--bad)' }}>{ok ? 'OK' : 'MISMATCH'}</b>
      <br />
      <span style={{ fontSize: 10 }}>Próximo: 06:00 · 12:00 · 20:00 (AR)</span>
    </div>
  )
}
