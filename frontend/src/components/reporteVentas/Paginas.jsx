// Hojas del Reporte de Ventas mensual (lo que se imprime y se entrega al cliente).
// Entrada: el resultado de armarReporte (lib/reporteVentas.js). Regla de oro: solo
// datos reales; un null se muestra "—", nunca 0, y no hay texto interpretativo.
// Cada hoja es un div.rv-hoja de 1456×819 px; los gráficos son SVG propio para que
// impriman nítidos.
import { Fragment } from 'react'
import { fmtAR } from '../../lib/reporteVentas.js'
import LogoDcManagement from '../informe/LogoDcManagement.jsx'
import '../../styles/reporte-ventas.css'

const NAVY = '#0f1b2d'
const GOLD = '#c9a24a'
const ANTERIOR = '#6f8fbf' // año anterior: azul acero, se distingue del azul marino del año actual

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// '2026-09' → 'Septiembre 2026'
export function mesEnPalabras(mes) {
  const [a, m] = mes.split('-').map(Number)
  return `${MESES[m - 1]} ${a}`
}
// '2026-09' → 'sep 26'
function mesCorto(mes) {
  const [a, m] = mes.split('-').map(Number)
  return `${MESES[m - 1].slice(0, 3).toLowerCase()} ${String(a).slice(2)}`
}

// Nombre para mostrar de un local (el cliente puede definir uno; si no, el código).
const nom = (reporte, l) => reporte.cliente?.nombres?.[l] || l

const esNum = (v) => v != null && Number.isFinite(v)
const neg = (v) => esNum(v) && v < 0

// Importe (enteros, negativos entre paréntesis) o % con 2 decimales. null → "—".
function Num({ v, pct = false, signo = false }) {
  if (!esNum(v)) return <span className="rv-nulo">—</span>
  const txt = pct ? `${fmtAR(v, 2)}%` : fmtAR(Math.round(v))
  return <span className={neg(v) ? 'rv-neg' : undefined}>{signo && v > 0 ? '+' : ''}{txt}</span>
}
const Pesos = ({ v }) => (esNum(v) ? <>$ <Num v={v} /></> : <Num v={v} />)

// Suma que no inventa: si falta un sumando, el total falta.
function suma(vals) {
  return vals.length && vals.every(esNum) ? vals.reduce((t, v) => t + v, 0) : null
}
const dividir = (a, b) => (esNum(a) && esNum(b) && b !== 0 ? a / b : null)

// ---------------------------------------------------------------------------
// Gráficos

// Barras horizontales con nombre arriba y porcentaje a la derecha.
function Barras({ filas, ancho = 600, alto = 72 }) {
  const max = Math.max(0, ...filas.map((f) => (esNum(f.valor) ? f.valor : 0)))
  const h = filas.length * alto
  return (
    <svg className="rv-svg" width={ancho} height={h} viewBox={`0 0 ${ancho} ${h}`}>
      {filas.map((f, i) => {
        const y = i * alto
        const w = max > 0 && esNum(f.valor) && f.valor > 0 ? (ancho * f.valor) / max : 0
        return (
          <g key={f.nombre}>
            <text x={0} y={y + 20} className="rv-svg-nom">{f.nombre}</text>
            <text x={ancho} y={y + 20} textAnchor="end" className={`rv-svg-pct${neg(f.pct) ? ' rv-neg' : ''}`}>
              {esNum(f.pct) ? `${fmtAR(f.pct, 2)}%` : '—'}
            </text>
            <rect x={0} y={y + 30} width={ancho} height={22} rx={4} fill="#eef0f4" />
            {w > 0 && <rect x={0} y={y + 30} width={w} height={22} rx={4} fill={i === 0 ? NAVY : GOLD} />}
          </g>
        )
      })}
    </svg>
  )
}

// Venta mes a mes del año (sin comparación): una barra por mes, el último en dorado.
function BarrasAnio({ filas, ancho = 600, alto = 560 }) {
  const etiqueta = 52
  const margenDer = 120
  const max = Math.max(0, ...filas.map((f) => f.venta).filter(esNum))
  const fila = alto / Math.max(filas.length, 1)
  const util = ancho - etiqueta - margenDer
  const x = (v) => etiqueta + (max > 0 && esNum(v) && v > 0 ? (util * v) / max : 0)
  return (
    <svg className="rv-svg" width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`}>
      {filas.map((f, i) => {
        const y = i * fila
        const barra = Math.min(26, fila * 0.5)
        const ult = i === filas.length - 1
        return (
          <g key={f.mes}>
            <text x={0} y={y + fila * 0.5} className="rv-svg-mes">{mesCorto(f.mes).slice(0, 3)}</text>
            {esNum(f.venta) && f.venta > 0 && (
              <rect x={etiqueta} y={y + fila * 0.5 - barra * 0.6} width={x(f.venta) - etiqueta} height={barra} rx={3}
                fill={ult ? GOLD : NAVY} />
            )}
            <text x={x(f.venta) + 8} y={y + fila * 0.5 + 5} className="rv-svg-val">
              {esNum(f.venta) ? fmtAR(f.venta) : '—'}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// Venta del año contra el año anterior, mes a mes: dos barras gruesas por mes, cada una con su importe.
function BarrasComparativo({ filas, ancho = 1360, alto = 560 }) {
  const etiqueta = 64
  const margenDer = 130
  const max = Math.max(0, ...filas.flatMap((f) => [f.venta, f.anterior]).filter(esNum))
  const fila = alto / Math.max(filas.length, 1)
  const barra = Math.min(20, (fila - 10) / 2)
  const util = ancho - etiqueta - margenDer
  const largo = (v) => (max > 0 && esNum(v) && v > 0 ? (util * v) / max : 0)
  const barraDe = (y, v, color, claseVal) => (
    <>
      {largo(v) > 0 && <rect x={etiqueta} y={y} width={largo(v)} height={barra} rx={3} fill={color} />}
      <text x={etiqueta + largo(v) + 8} y={y + barra * 0.5 + 5} className={claseVal}>{esNum(v) ? fmtAR(v) : '—'}</text>
    </>
  )
  return (
    <svg className="rv-svg" width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`}>
      {filas.map((f, i) => {
        const y0 = i * fila + (fila - (2 * barra + 3)) / 2
        return (
          <g key={f.mes}>
            <text x={0} y={y0 + barra + 6} className="rv-svg-mes">{mesCorto(f.mes).slice(0, 3)}</text>
            {barraDe(y0, f.venta, NAVY, 'rv-svg-val')}
            {barraDe(y0 + barra + 3, f.anterior, ANTERIOR, 'rv-svg-ant')}
          </g>
        )
      })}
    </svg>
  )
}

// Tendencia chica de una serie mensual; los meses sin dato cortan la línea.
function MiniTendencia({ serie, ancho = 400, alto = 110 }) {
  const vals = serie.map((p) => p.valor).filter(esNum)
  if (!vals.length) return <div className="rv-mini-vacia">—</div>
  const max = Math.max(...vals)
  const min = Math.min(0, ...vals)
  const pad = 8
  const x = (i) => pad + (serie.length > 1 ? (i * (ancho - 2 * pad)) / (serie.length - 1) : (ancho - 2 * pad) / 2)
  const y = (v) => alto - 24 - ((v - min) / (max - min || 1)) * (alto - 58)
  const tramos = []
  let tramo = []
  serie.forEach((p, i) => {
    if (esNum(p.valor)) tramo.push(`${x(i)},${y(p.valor)}`)
    else if (tramo.length) { tramos.push(tramo); tramo = [] }
  })
  if (tramo.length) tramos.push(tramo)
  const ultimo = serie.reduce((u, p, i) => (esNum(p.valor) ? i : u), null)
  return (
    <svg className="rv-svg" width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`}>
      <line x1={pad} x2={ancho - pad} y1={alto - 20} y2={alto - 20} stroke="#e3e6ec" strokeWidth={1} />
      {tramos.map((t, i) => (t.length > 1
        ? <polyline key={i} points={t.join(' ')} fill="none" stroke={NAVY} strokeWidth={2.5} strokeLinejoin="round" />
        : null))}
      {serie.map((p, i) => (esNum(p.valor)
        ? <circle key={p.mes} cx={x(i)} cy={y(p.valor)} r={i === serie.length - 1 ? 5 : 3} fill={i === serie.length - 1 ? GOLD : NAVY} />
        : null))}
      {ultimo != null && (
        <text x={x(ultimo)} y={y(serie[ultimo].valor) - 12} textAnchor={serie.length > 1 && ultimo === 0 ? 'start' : 'end'}
          className="rv-svg-val">{fmtAR(serie[ultimo].valor)}</text>
      )}
      <text x={pad} y={alto - 4} className="rv-svg-eje">{mesCorto(serie[0].mes)}</text>
      <text x={ancho - pad} y={alto - 4} textAnchor="end" className="rv-svg-eje">{mesCorto(serie[serie.length - 1].mes)}</text>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Armazón común

function Marco({ titulo, sub, derecha, children, pie, borrador, oscura = false }) {
  return (
    <div className={`rv-hoja${oscura ? ' rv-oscura' : ''}`}>
      {titulo && (
        <div className="rv-hd">
          <div className="rv-hd-tit">{titulo}{sub && <span className="rv-gold"> · {sub}</span>}</div>
          <div className="rv-k">{derecha}</div>
        </div>
      )}
      {children}
      <div className="rv-pie">
        <span>DC Management · Reporte de Ventas</span>
        <span>{pie}</span>
      </div>
      {borrador && <div className="rv-marca" aria-hidden="true">BORRADOR</div>}
    </div>
  )
}

function Kpi({ k, children, chico = false }) {
  return (
    <div className="rv-kpi">
      <div className="rv-k">{k}</div>
      <div className={`rv-big${chico ? ' rv-big-chico' : ''}`}>{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hojas

function Portada({ reporte, ...m }) {
  // Logos de los locales que lo tienen cargado, en el orden de las hojas.
  const logos = reporte.locales.map((l) => ({ local: l.local, src: reporte.cliente?.logos?.[l.local] })).filter((x) => x.src)
  return (
    <Marco {...m} oscura>
      <div className="rv-portada-brillo" />
      <LogoDcManagement className="rv-portada-logo" />
      {logos.length > 0 && (
        <div className={`rv-portada-logos rv-logos-${Math.min(logos.length, 4)}`}>
          {logos.map((x) => <img key={x.local} src={x.src} alt={`Logo de ${nom(reporte, x.local)}`} />)}
        </div>
      )}
      <div className="rv-portada-txt">
        <div className="rv-portada-tit">Reporte de Ventas</div>
        <div className="rv-portada-sub">{reporte.cliente?.nombre} · {mesEnPalabras(reporte.mes)}</div>
        <div className="rv-portada-locales">{reporte.locales.map((l) => nom(reporte, l.local)).join(' · ')}</div>
      </div>
      <div className="rv-portada-lema">Tu Rentabilidad, Nuestra Gestión</div>
    </Marco>
  )
}

function Contraportada(m) {
  return (
    <Marco {...m} oscura>
      <div className="rv-portada-brillo rv-brillo-centro" />
      <div className="rv-contra">
        <LogoDcManagement className="rv-contra-logo" />
        <div className="rv-contra-lema">Tu Rentabilidad, Nuestra Gestión</div>
      </div>
    </Marco>
  )
}

function Consolidado({ reporte, ...m }) {
  const c = reporte.consolidado
  const anio = Number(reporte.mes.slice(0, 4))
  const locales = c.filas.map((f) => f.local)
  const barras = [...c.filas].sort((a, b) => (b.valor ?? -Infinity) - (a.valor ?? -Infinity))
    .map((f) => ({ nombre: nom(reporte, f.local), valor: f.valor, pct: f.inc }))
  const muchos = locales.length > 4 || c.historico.length > 9
  const hayAnt = c.historico.some((h) => esNum(h.anterior))
  return (
    <Marco {...m} titulo="Consolidado del grupo" derecha={mesEnPalabras(reporte.mes)}>
      <div className="rv-cuerpo rv-consol">
        <div className="rv-consol-arriba">
          <Kpi k="Venta total del grupo"><Pesos v={c.total} /></Kpi>
          <div>
            <table className="rv-tabla">
              <thead><tr><th>Local</th><th>Importe</th><th>INC</th></tr></thead>
              <tbody>
                {c.filas.map((f) => (
                  <tr key={f.local}><td>{nom(reporte, f.local)}</td><td><Num v={f.valor} /></td><td><Num v={f.inc} pct /></td></tr>
                ))}
                <tr className="rv-tot"><td>Total</td><td><Num v={c.total} /></td><td>{esNum(c.total) ? '100,00%' : '—'}</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <div className="rv-k rv-k-graf">Participación por local</div>
            <Barras filas={barras} ancho={460} alto={Math.min(62, 200 / Math.max(barras.length, 1))} />
          </div>
        </div>
        <div className="rv-k rv-k-graf">Histórico consolidado {anio}</div>
        <table className={`rv-tabla rv-tabla-chica${muchos ? ' rv-tabla-mini' : ''}`}>
          <thead>
            <tr>
              <th>Período</th>
              {locales.map((l) => <th key={l}>{nom(reporte, l)}</th>)}
              <th>Total</th><th>Var % VMA</th>{hayAnt && <><th>{anio - 1}</th><th>vs {anio - 1}</th></>}
            </tr>
          </thead>
          <tbody>
            {c.historico.map((h, i) => (
              <tr key={h.mes} className={i === c.historico.length - 1 ? 'rv-cur' : undefined}>
                <td>{mesCorto(h.mes)}</td>
                {locales.map((l) => <td key={l}><Num v={h.porLocal[l]} /></td>)}
                <td className="rv-fuerte"><Num v={h.total} /></td>
                <td><Num v={h.varPct} pct /></td>
                {hayAnt && <><td className="rv-tenue"><Num v={h.anterior} /></td><td><Num v={h.varAnual} pct /></td></>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Marco>
  )
}

// "Local" primero, como en los decks; el motor lo deja último.
function canalesEnOrden(canales) {
  const local = canales.filter((c) => c.nombre === 'Local')
  return [...local, ...canales.filter((c) => c.nombre !== 'Local')]
}

function Mes({ reporte, local: l, ...m }) {
  const h = l.historico[l.historico.length - 1]
  const anio = Number(reporte.mes.slice(0, 4))
  const canales = canalesEnOrden(l.canales)
  const hayCub = esNum(l.cubiertos.valor)
  const hayOrd = esNum(l.ordenes.valor)
  return (
    <Marco {...m} titulo={nom(reporte, l.local)} sub="ventas por canal" derecha={mesEnPalabras(reporte.mes)}>
      <div className="rv-cuerpo">
        <div className="rv-kpis">
          <Kpi k="Venta del mes"><Pesos v={l.venta.valor} /></Kpi>
          <Kpi k="Variable $ vs mes anterior"><Num v={h.varPesos} /></Kpi>
          <Kpi k="Variable % vs mes anterior"><Num v={h.varPct} pct signo /></Kpi>
          <Kpi k={`Variable vs ${anio - 1}`}><Num v={h.varAnual} pct signo /></Kpi>
        </div>
        {(hayCub || hayOrd) && (
          <div className="rv-kpis rv-kpis-sec">
            {hayCub && <Kpi k="Cubiertos" chico><Num v={l.cubiertos.valor} /></Kpi>}
            {hayCub && <Kpi k="Promedio por cubierto" chico><Pesos v={l.promCubierto} /></Kpi>}
            {hayOrd && <Kpi k="Órdenes" chico><Num v={l.ordenes.valor} /></Kpi>}
            {hayOrd && <Kpi k="Promedio por orden" chico><Pesos v={l.promOrden} /></Kpi>}
          </div>
        )}
        <div className="rv-dos">
          <table className="rv-tabla">
            <thead><tr><th>Canal de venta</th><th>Importe</th><th>INC</th></tr></thead>
            <tbody>
              {canales.map((c) => (
                <tr key={c.nombre}><td>{c.nombre}</td><td><Num v={c.valor} /></td><td><Num v={c.inc} pct /></td></tr>
              ))}
              <tr className="rv-tot"><td>Total</td><td><Num v={l.venta.valor} /></td><td>{esNum(l.venta.valor) ? '100,00%' : '—'}</td></tr>
            </tbody>
          </table>
          <div>
            <div className="rv-k rv-k-graf">Participación por canal</div>
            <Barras filas={canales.map((c) => ({ nombre: c.nombre, valor: c.valor, pct: c.inc }))} ancho={600}
              alto={Math.min(84, (hayCub || hayOrd ? 290 : 400) / Math.max(canales.length, 1))} />
          </div>
        </div>
      </div>
    </Marco>
  )
}

function Historico({ reporte, local: l, ...m }) {
  const anio = Number(reporte.mes.slice(0, 4))
  const hist = l.historico
  const hayCub = hist.some((h) => esNum(h.cubiertos.valor))
  const hayOrd = hist.some((h) => esNum(h.ordenes.valor))
  const hayAnt = hist.some((h) => esNum(h.anterior))
  const extra = (hayCub ? 1 : 0) + (hayOrd ? 1 : 0)
  const tVenta = suma(hist.map((h) => h.venta.valor))
  const tAnt = suma(hist.map((h) => h.anterior))
  const tCub = suma(hist.map((h) => h.cubiertos.valor))
  const tOrd = suma(hist.map((h) => h.ordenes.valor))
  const rango = hist.length > 1 ? `${MESES[0]} – ${mesEnPalabras(reporte.mes)}` : mesEnPalabras(reporte.mes)
  return (
    <Marco {...m} titulo={nom(reporte, l.local)} sub={`histórico ${anio}`} derecha={rango}>
      <div className={`rv-cuerpo rv-hist ${hayAnt ? 'rv-hist-solo' : `rv-hist-${extra}`}`}>
        <table className={`rv-tabla rv-tabla-chica${extra === 2 ? ' rv-tabla-mini' : ''}`}>
          <thead>
            <tr>
              <th>Período</th><th>Venta</th>{hayAnt && <th>{anio - 1}</th>}<th>Var $ VMA</th><th>Var % VMA</th>
              {hayAnt && <th>vs {anio - 1}</th>}
              {hayCub && <><th>Cubiertos</th><th>Prom. cub.</th></>}
              {hayOrd && <><th>Órdenes</th><th>Prom. orden</th></>}
            </tr>
          </thead>
          <tbody>
            {hist.map((h, i) => (
              <tr key={h.mes} className={i === hist.length - 1 ? 'rv-cur' : undefined}>
                <td>{mesCorto(h.mes)}</td>
                <td className="rv-fuerte"><Num v={h.venta.valor} /></td>
                {hayAnt && <td className="rv-tenue"><Num v={h.anterior} /></td>}
                <td><Num v={h.varPesos} /></td>
                <td><Num v={h.varPct} pct /></td>
                {hayAnt && <td><Num v={h.varAnual} pct /></td>}
                {hayCub && <><td><Num v={h.cubiertos.valor} /></td><td><Num v={h.promCubierto} /></td></>}
                {hayOrd && <><td><Num v={h.ordenes.valor} /></td><td><Num v={h.promOrden} /></td></>}
              </tr>
            ))}
            <tr className="rv-tot">
              <td>Total</td><td><Num v={tVenta} /></td>{hayAnt && <td><Num v={tAnt} /></td>}<td /><td />{hayAnt && <td />}
              {hayCub && <><td><Num v={tCub} /></td><td><Num v={dividir(tVenta, tCub)} /></td></>}
              {hayOrd && <><td><Num v={tOrd} /></td><td><Num v={dividir(tVenta, tOrd)} /></td></>}
            </tr>
          </tbody>
        </table>
        {!hayAnt && (
          <div>
            <div className="rv-k rv-k-graf">{`Venta ${anio}`}</div>
            <BarrasAnio filas={hist.map((h) => ({ mes: h.mes, venta: h.venta.valor }))}
              ancho={extra === 2 ? 440 : extra === 1 ? 500 : 600} alto={Math.min(560, hist.length * 62)} />
          </div>
        )}
      </div>
    </Marco>
  )
}

// Hoja aparte: la venta del año contra el año anterior, mes a mes.
function Comparativo({ reporte, local: l, ...m }) {
  const anio = Number(reporte.mes.slice(0, 4))
  const hist = l.historico
  const rango = hist.length > 1 ? `${MESES[0]} – ${mesEnPalabras(reporte.mes)}` : mesEnPalabras(reporte.mes)
  return (
    <Marco {...m} titulo={nom(reporte, l.local)} sub={`venta ${anio} vs ${anio - 1}`} derecha={rango}>
      <div className="rv-cuerpo rv-comp">
        <div className="rv-leyenda rv-leyenda-grande">
          <span><i className="rv-ley-act" /> {anio}</span>
          <span><i className="rv-ley-ant" /> {anio - 1}</span>
        </div>
        <BarrasComparativo filas={hist.map((h) => ({ mes: h.mes, venta: h.venta.valor, anterior: h.anterior }))}
          alto={Math.min(560, Math.max(hist.length, 6) * 54)} />
      </div>
    </Marco>
  )
}

function Delivery({ reporte, local: l, ...m }) {
  const anio = Number(reporte.mes.slice(0, 4))
  // Solo los meses con algún dato de app: nada de filas enteras en "—".
  const filas = l.delivery.filter((d) => Object.values(d.apps).some((a) => esNum(a.venta)))
  const apps = []
  for (const d of filas) for (const a of Object.keys(d.apps)) if (!apps.includes(a)) apps.push(a)
  const muchas = apps.length > 3 || filas.length > 9
  return (
    <Marco {...m} titulo={nom(reporte, l.local)} sub="delivery por aplicación" derecha={String(anio)}>
      <div className="rv-cuerpo">
        <table className={`rv-tabla rv-tabla-chica${muchas ? ' rv-tabla-mini' : ''}`}
          style={{ width: Math.min(1360, 520 + apps.length * 380) }}>
          <thead>
            <tr className="rv-grupo">
              <th colSpan={3} />
              {apps.map((a) => <th key={a} colSpan={3}>{a}</th>)}
            </tr>
            <tr>
              <th>Período</th><th>Venta delivery</th><th>Var % MA</th>
              {apps.map((a) => <Fragment key={a}><th className="rv-sep">Venta</th><th>Tickets</th><th>Prom.</th></Fragment>)}
            </tr>
          </thead>
          <tbody>
            {filas.map((d) => (
              <tr key={d.mes} className={d.mes === reporte.mes ? 'rv-cur' : undefined}>
                <td>{mesCorto(d.mes)}</td>
                <td className="rv-fuerte"><Num v={d.total} /></td>
                <td><Num v={d.varPct} pct /></td>
                {apps.map((a) => {
                  const x = d.apps[a]
                  return (
                    <Fragment key={a}>
                      <td className="rv-sep"><Num v={x?.venta} /></td><td><Num v={x?.tickets} /></td><td><Num v={x?.prom} /></td>
                    </Fragment>
                  )
                })}
              </tr>
            ))}
            <tr className="rv-tot">
              <td>Total</td><td><Num v={suma(filas.map((d) => d.total).filter(esNum))} /></td><td />
              {apps.map((a) => {
                // Meses en que la app vendió: la venta se suma; los tickets solo si están todos.
                const conVenta = filas.map((d) => d.apps[a]).filter((x) => esNum(x?.venta))
                return (
                  <Fragment key={a}>
                    <td className="rv-sep"><Num v={suma(conVenta.map((x) => x.venta))} /></td>
                    <td><Num v={suma(conVenta.map((x) => x.tickets))} /></td><td />
                  </Fragment>
                )
              })}
            </tr>
          </tbody>
        </table>
        <div className="rv-minis" style={{ gridTemplateColumns: `repeat(${Math.min(apps.length, 4)}, 1fr)` }}>
          {apps.slice(0, 4).map((a) => (
            <div key={a} className="rv-mini">
              <div className="rv-k">{a} · venta por mes</div>
              <MiniTendencia serie={filas.map((d) => ({ mes: d.mes, valor: d.apps[a]?.venta ?? null }))}
                ancho={Math.floor(1360 / Math.min(apps.length, 4)) - 24} alto={filas.length > 9 ? 90 : 110} />
            </div>
          ))}
        </div>
      </div>
    </Marco>
  )
}

const HOJAS = { portada: Portada, consolidado: Consolidado, mes: Mes, historico: Historico, comparativo: Comparativo, delivery: Delivery, contraportada: Contraportada }

// Una hoja según pagina.tipo. `local` (LocalMes) es opcional: si no viene se busca
// por pagina.local. `numero` también: si no viene sale de la posición en reporte.paginas.
export function Hoja({ pagina, reporte, local, borrador = false, numero }) {
  const Comp = HOJAS[pagina.tipo]
  if (!Comp) return null
  const l = local ?? (pagina.local ? reporte.locales.find((x) => x.local === pagina.local) : undefined)
  if (pagina.local && !l) return null
  if (pagina.tipo === 'consolidado' && !reporte.consolidado) return null
  const n = numero ?? reporte.paginas.findIndex((p) => p.id === pagina.id) + 1
  const pie = `${reporte.cliente?.nombre ?? ''} · ${n} / ${reporte.paginas.length}`
  return <Comp reporte={reporte} local={l} borrador={borrador} pie={pie} />
}

// Todas las hojas en orden. Para imprimir, pasar `imprimir`: el contenedor queda oculto
// en pantalla y se muestra solo con body.imprimiendo-rv (ver styles/reporte-ventas.css).
export function Mazo({ reporte, borrador = false, imprimir = false }) {
  return (
    <div className={`rv-mazo${imprimir ? ' rv-print' : ''}`}>
      {reporte.paginas.map((p, i) => (
        <Hoja key={p.id} pagina={p} reporte={reporte} borrador={borrador} numero={i + 1} />
      ))}
    </div>
  )
}

export default Mazo
