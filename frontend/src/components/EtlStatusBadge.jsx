import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

// Cuándo se copiaron por última vez los datos de gestión y si la copia cuadró.
export default function EtlStatusBadge() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    api.getEtlStatus().then(setStatus).catch(() => setStatus(null))
  }, [])

  if (!status?.corte) return null

  const ok = !Number(status.mismatches) && !Number(status.errores)
  return (
    <div className="etl-badge" title="Los datos se copian de gestión cada 1 hora y se verifica que las sumas coincidan">
      <div className="etl-badge-row">
        <span className={'etl-dot' + (ok ? '' : ' bad')} />
        <span>Datos al <b>{status.corte}</b> · {ok ? 'cuadran' : 'revisar'}</span>
      </div>
      <small>Se actualiza cada 1 hora</small>
    </div>
  )
}
