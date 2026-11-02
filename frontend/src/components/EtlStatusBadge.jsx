import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'

function IcoRefresh() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  )
}

// Hora Argentina en HH:MM, sin importar el huso de la PC que mira. Si el último
// movimiento no es de hoy (de madrugada o un feriado no hay novedades), se
// antepone el día para que no parezca que los datos están atrasados.
export function horaArgentina(iso, ahora = new Date()) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const TZ = 'America/Argentina/Buenos_Aires'
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
  const dia = (x) => x.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: TZ })
  return dia(d) === dia(ahora) ? hora : `${dia(d)} ${hora}`
}

// Hasta qué hora llegan los datos de gestión y un botón para volver a pedirlos.
// Los datos se replican solos cada ~5 minutos: la hora es la del último
// movimiento de gestión que ya se ve acá (Trello #301).
export default function EtlStatusBadge() {
  const [frescura, setFrescura] = useState(null)
  const [actualizando, setActualizando] = useState(false)

  const consultar = useCallback(() => api.getFrescura().then(setFrescura).catch(() => setFrescura(null)), [])

  useEffect(() => { consultar() }, [consultar])

  const actualizar = async () => {
    setActualizando(true)
    await consultar()
    // Recarga la pantalla actual para que vuelva a pedir sus datos.
    window.location.reload()
  }

  const hora = frescura?.ultimoDato ? horaArgentina(frescura.ultimoDato) : null
  if (!hora) return null

  return (
    <div className="etl-badge" title="Hora del último movimiento de gestión que ya se ve acá. Los datos llegan solos cada 5 minutos.">
      <div className="etl-badge-row">
        <span className="etl-dot" />
        <span>Datos al <b>{hora}</b></span>
      </div>
      <div className="etl-badge-foot">
        <small>Se actualizan solos cada 5 min</small>
        <button
          type="button"
          className={'etl-badge-refresh' + (actualizando ? ' girando' : '')}
          onClick={actualizar}
          disabled={actualizando}
          title="Volver a pedir los datos"
        >
          <IcoRefresh /> {actualizando ? 'Actualizando' : 'Actualizar'}
        </button>
      </div>
    </div>
  )
}
