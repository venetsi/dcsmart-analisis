import { fmtMesLargo } from '../lib/format.js'
import { mesAnterior } from '../lib/pyl.js'

// Selector de mes de los tableros (P&L, Costo impositivo): los últimos seis
// meses a un clic, el actual primero porque está en curso, y "Otro" para
// cualquier mes anterior. Los estilos están en styles/pyl.css.

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function mesActual() {
  return new Date().toISOString().slice(0, 7)
}

function ultimosMeses(n = 6) {
  const out = []
  let m = mesActual()
  for (let i = 0; i < n; i++) { out.push(m); m = mesAnterior(m) }
  return out
}

function etiquetaMes(mes) {
  const [y, m] = mes.split('-')
  return `${MESES_CORTOS[Number(m) - 1]} ${y.slice(2)}`
}

export default function SelectorMes({ mes, onChange }) {
  return (
    <div className="pyl-filtro">
      <div className="pyl-filtro-label">Mes</div>
      <div className="pyl-meses">
        {ultimosMeses().map((m, i) => (
          <button
            key={m}
            type="button"
            className={'pyl-mes' + (m === mes ? ' active' : '')}
            onClick={() => onChange(m)}
            title={i === 0 ? 'Mes en curso: todavía faltan días' : fmtMesLargo(m)}
          >
            {etiquetaMes(m)}{i === 0 && <small>en curso</small>}
          </button>
        ))}
        <label className="pyl-mes-otro" title="Elegir otro mes">
          <span>Otro</span>
          <input type="month" value={mes} max={mesActual()} onChange={(e) => e.target.value && onChange(e.target.value)} />
        </label>
      </div>
    </div>
  )
}
