// Lista de hojas del Informe Mensual (columna izquierda del editor): interruptor
// para que salga o no en el PDF, subir / bajar y cuántas páginas genera.
// Se guarda SIEMPRE la lista completa con el orden de todas las hojas: una lista
// parcial se mezclaría con el orden por defecto (lib/informeMensual.js, hojasDe).
import { useMemo } from 'react'

// Configuración completa para PUT /hojas: [{ clave, visible, orden }] en el orden de la lista.
export const configDeHojas = (hojas) => hojas.map((h, i) => ({ clave: h.clave, visible: !!h.visible, orden: i }))

// Por qué una hoja no sale en el PDF (null si sale).
export function motivoHoja(h, paginas) {
  if (!h.aplica) return h.motivo || 'No corresponde a este cliente.'
  if (!h.visible) return 'Apagada: no sale en el PDF.'
  if (!paginas) return 'Sin datos este mes: no sale en el PDF.'
  return null
}

const Flecha = ({ arriba }) => (
  <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points={arriba ? '6 15 12 9 18 15' : '6 9 12 15 18 9'} />
  </svg>
)

export default function ListaHojas({ hojas, paginas, claveActiva, interno, ocupado, onElegir, onGuardar }) {
  const cuenta = useMemo(() => {
    const c = {}
    for (const p of paginas || []) c[p.clave] = (c[p.clave] || 0) + 1
    return c
  }, [paginas])

  const guardar = (lista) => onGuardar(configDeHojas(lista))
  const alternar = (clave) => guardar(hojas.map((h) => (h.clave === clave ? { ...h, visible: !h.visible } : h)))
  const mover = (i, d) => {
    const j = i + d
    if (j < 0 || j >= hojas.length) return
    const lista = [...hojas]
    ;[lista[i], lista[j]] = [lista[j], lista[i]]
    guardar(lista)
  }

  return (
    <nav className="ime-hojas" aria-label="Hojas del informe">
      <div className="rve-k ime-hojas-tit">Hojas del informe</div>
      <ul>
        {hojas.map((h, i) => {
          const n = cuenta[h.clave] || 0
          const motivo = motivoHoja(h, n)
          const activa = h.clave === claveActiva
          return (
            <li key={h.clave} className={`ime-hj${activa ? ' on' : ''}${motivo ? ' apagada' : ''}`}>
              <button type="button" role="switch" aria-checked={!!h.visible} className={`ime-switch${h.visible ? ' si' : ''}`}
                disabled={!interno || ocupado} onClick={() => alternar(h.clave)}
                aria-label={`${h.titulo}: ${h.visible ? 'sale en el informe' : 'no sale en el informe'}`}
                title={interno ? (h.visible ? 'Sacarla del informe' : 'Ponerla en el informe') : 'Solo el equipo DC puede cambiar las hojas'} />
              <button type="button" className="ime-hj-nom" onClick={() => onElegir(h.clave)} aria-current={activa || undefined}>
                <span className="ime-hj-tit">{h.titulo}{n > 1 && <em>{n}</em>}</span>
                {motivo && <small>{motivo}</small>}
              </button>
              {interno && (
                <span className="ime-hj-orden">
                  <button type="button" disabled={ocupado || i === 0} onClick={() => mover(i, -1)} aria-label={`Subir ${h.titulo}`} title="Subir"><Flecha arriba /></button>
                  <button type="button" disabled={ocupado || i === hojas.length - 1} onClick={() => mover(i, 1)} aria-label={`Bajar ${h.titulo}`} title="Bajar"><Flecha /></button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="ime-hojas-nota">
        Las hojas por local salen una vez por cada local. Con varios locales se suman los indicadores por local y el consolidado del grupo.
      </p>
    </nav>
  )
}
