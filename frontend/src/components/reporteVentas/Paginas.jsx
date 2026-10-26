// Hojas del Reporte de Ventas mensual (lo que se imprime y se entrega al cliente).
// Entrada: el resultado de armarReporte (lib/reporteVentas.js). Regla de oro: solo
// datos reales; un null se muestra "—", nunca 0. Los titulares salen de
// lib/titularesReporte.js y solo repiten los números de la hoja.
// Diseño oscuro de oct-26 (referencia: "Reporte de ventas · 3 Monos · Septiembre 2026").
// Cada hoja es un div.rv-hoja de 1456×819 px; los gráficos son SVG o divs para que impriman nítidos.
import { Fragment, useEffect, useState } from 'react'
import { fmtAR } from '../../lib/reporteVentas.js'
import { recortarLogo } from '../../lib/recorteLogo.js'
import { titularCanales, titularComparativo, titularConsolidado, titularSintesis } from '../../lib/titularesReporte.js'
import '../../styles/reporte-ventas.css'

const LOGO = '/logos/DCSMART-ANALYTICS-horizontal.png'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// '2026-09' → 'Septiembre 2026'
export function mesEnPalabras(mes) {
  const [a, m] = mes.split('-').map(Number)
  return `${MESES[m - 1]} ${a}`
}
const nombreMes = (mes) => MESES[Number(mes.slice(5, 7)) - 1]
const mes3 = (mes) => nombreMes(mes).slice(0, 3)
function mesSiguiente(mes) {
  const [a, m] = mes.split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}
function mesPrevio(mes) {
  const [a, m] = mes.split('-').map(Number)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
}

// Nombre para mostrar de un local (el cliente puede definir uno; si no, el código).
const nom = (reporte, l) => reporte.cliente?.nombres?.[l] || l

const esNum = (v) => v != null && Number.isFinite(v)
const dividir = (a, b) => (esNum(a) && esNum(b) && b !== 0 ? a / b : null)
// Suma que no inventa: si falta un sumando, el total falta.
function suma(vals) {
  return vals.length && vals.every(esNum) ? vals.reduce((t, v) => t + v, 0) : null
}

// ---------------------------------------------------------------------------
// Números. Negativos con signo menos (−) y en rojo; con `signo`, positivos con + y en verde.

const MENOS = '−'
const NBSP = String.fromCharCode(160) // el $ no se separa del número
const tono = (v) => (v > 0 ? 'rv-pos' : v < 0 ? 'rv-neg' : undefined)
function texto(v, { pct = false, pesos = false, signo = false } = {}) {
  const abs = pct ? `${fmtAR(Math.abs(v), 2)}%` : fmtAR(Math.round(Math.abs(v)))
  const s = v < 0 && abs.replace(/[^1-9]/g, '') ? MENOS : signo && v > 0 ? '+' : ''
  return `${s}${pesos ? '$' + NBSP : ''}${abs}`
}
// Importe o porcentaje; null → "—". `color`: verde/rojo según el signo.
function Num({ v, pct = false, pesos = false, signo = false, color = signo }) {
  if (!esNum(v)) return <span className="rv-nulo">—</span>
  return <span className={color ? tono(v) : undefined}>{texto(v, { pct, pesos, signo })}</span>
}

// ---------------------------------------------------------------------------
// Armazón común

function Pie({ reporte, numero, total, nota }) {
  return (
    <div className="rv-pie">
      <span className="rv-pie-izq">
        <span className="rv-pie-logo" aria-hidden="true" />
        DC Management · Reporte de ventas · {reporte.cliente?.nombre}{nota ? ` · ${nota}` : ''}
      </span>
      <span>{numero} / {total}</span>
    </div>
  )
}

function Marco({ ceja, titulo, derecha, children, clase = '', brillo = false, pie = true, notaPie, m }) {
  return (
    <div className={`rv-hoja ${clase}`}>
      {brillo && <div className="rv-brillo" />}
      {(ceja || titulo) && (
        <div className="rv-cab">
          <div>
            {ceja && <div className="rv-ceja">{ceja}</div>}
            {titulo && <h2 className="rv-tit">{titulo}</h2>}
          </div>
          {derecha}
        </div>
      )}
      {children}
      {pie && <Pie reporte={m.reporte} numero={m.numero} total={m.total} nota={notaPie} />}
      {m.borrador && <div className="rv-marca" aria-hidden="true">BORRADOR</div>}
    </div>
  )
}

// Ceja de las hojas de un local: con más de un local va el nombre adelante.
function cejaLocal(reporte, l, txt) {
  return reporte.locales.length > 1 ? `${nom(reporte, l.local)} · ${txt}` : txt
}

function Tarjeta({ k, children, sub, clase = '' }) {
  return (
    <div className={`rv-card ${clase}`}>
      <div className="rv-card-k">{k}</div>
      <div className="rv-card-v">{children}</div>
      {sub && <div className="rv-card-sub">{sub}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gráficos

// Columnas mes a mes: el año (claro) contra el anterior (gris azulado). El mes del reporte en dorado.
// Los importes van en millones con un decimal.
function Columnas({ filas, ancho = 1262, alto = 400, conAnterior }) {
  const n = Math.max(filas.length, 1)
  const grupo = ancho / n
  const arriba = 40
  const max = Math.max(0, ...filas.flatMap((f) => [f.venta, conAnterior ? f.anterior : null]).filter(esNum))
  const h = (v) => (max > 0 && esNum(v) && v > 0 ? ((alto - arriba) * v) / max : 0)
  const wAct = conAnterior ? Math.min(54, grupo * 0.38) : Math.min(84, grupo * 0.56)
  const wAnt = Math.min(42, grupo * 0.3)
  const hueco = conAnterior ? Math.min(22, grupo * 0.12) : 0
  const fuente = n > 9 ? 16 : 19
  const mill = (v) => (esNum(v) ? fmtAR(v / 1e6, 1) : '—')
  return (
    <svg className="rv-svg" width={ancho} height={alto + 44} viewBox={`0 0 ${ancho} ${alto + 44}`}>
      {filas.map((f, i) => {
        const cur = i === filas.length - 1
        const x0 = i * grupo + (grupo - (conAnterior ? wAct + hueco + wAnt : wAct)) / 2
        const x1 = x0 + wAct + hueco
        return (
          <g key={f.mes}>
            {h(f.venta) > 0 && <rect x={x0} y={alto - h(f.venta)} width={wAct} height={h(f.venta)} rx={4} className={cur ? 'rv-col-cur' : 'rv-col-act'} />}
            <text x={x0 + wAct / 2} y={alto - h(f.venta) - 12} textAnchor="middle" fontSize={fuente}
              className={cur ? 'rv-col-val rv-col-val-cur' : 'rv-col-val'}>{mill(f.venta)}</text>
            {conAnterior && (
              <>
                {h(f.anterior) > 0 && <rect x={x1} y={alto - h(f.anterior)} width={wAnt} height={h(f.anterior)} rx={4} className="rv-col-ant" />}
                <text x={x1 + wAnt / 2} y={alto - h(f.anterior) - 12} textAnchor="middle" fontSize={fuente} className="rv-col-val-ant">{mill(f.anterior)}</text>
              </>
            )}
            <text x={i * grupo + grupo / 2} y={alto + 34} textAnchor="middle" className={cur ? 'rv-col-mes rv-col-mes-cur' : 'rv-col-mes'}>{mes3(f.mes)}</text>
          </g>
        )
      })}
      <line x1={0} x2={ancho} y1={alto + 0.5} y2={alto + 0.5} className="rv-col-base" />
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
      <line x1={pad} x2={ancho - pad} y1={alto - 20} y2={alto - 20} className="rv-col-base" />
      {tramos.map((t, i) => (t.length > 1
        ? <polyline key={i} points={t.join(' ')} fill="none" className="rv-mini-linea" strokeWidth={2.5} strokeLinejoin="round" />
        : null))}
      {serie.map((p, i) => (esNum(p.valor)
        ? <circle key={p.mes} cx={x(i)} cy={y(p.valor)} r={i === serie.length - 1 ? 5 : 3} className={i === serie.length - 1 ? 'rv-mini-cur' : 'rv-mini-pto'} />
        : null))}
      {ultimo != null && (
        <text x={x(ultimo)} y={y(serie[ultimo].valor) - 12} textAnchor={serie.length > 1 && ultimo === 0 ? 'start' : 'end'}
          className="rv-mini-val">{fmtAR(serie[ultimo].valor)}</text>
      )}
      <text x={pad} y={alto - 2} className="rv-mini-eje">{mes3(serie[0].mes)}</text>
      <text x={ancho - pad} y={alto - 2} textAnchor="end" className="rv-mini-eje">{mes3(serie[serie.length - 1].mes)}</text>
    </svg>
  )
}

// Participación: cifra grande a la izquierda y lista con barras a la derecha.
//   filas: [{ nombre, valor, inc }] en el orden en que se muestran (la primera en dorado).
function Participacion({ filas, total, frase }) {
  const max = Math.max(0, ...filas.map((f) => f.valor).filter(esNum))
  const prim = filas[0]
  const alto = filas.length > 3 ? 0 : Math.min(152, 300 / Math.max(filas.length, 1))
  const densidad = filas.length > 6 ? ' rv-part-muchas rv-part-muchisimas' : filas.length > 3 ? ' rv-part-muchas' : ''
  return (
    <div className="rv-part">
      <div className="rv-part-izq">
        <div className="rv-part-big">{esNum(prim?.inc) ? `${fmtAR(prim.inc, 1)}%` : '—'}</div>
        <div className="rv-part-txt">{frase}</div>
      </div>
      <div className={`rv-part-lista${densidad}`}>
        {filas.map((f, i) => (
          <div key={f.nombre} className="rv-part-fila" style={{ minHeight: alto }}>
            <div className="rv-part-nom"><span>{f.nombre}</span><span><Num v={f.valor} pesos /></span></div>
            <div className="rv-part-pista">
              {esNum(f.valor) && f.valor > 0 && max > 0 && (
                <div className={i === 0 ? 'rv-part-barra rv-part-barra-1' : 'rv-part-barra'} style={{ width: `${Math.max(0.6, (100 * f.valor) / max)}%` }} />
              )}
            </div>
            <div className="rv-part-pct">{esNum(f.inc) ? `${fmtAR(f.inc, 2)}% del total` : '—'}</div>
          </div>
        ))}
        <div className="rv-part-total"><span>Total</span><span><Num v={total} pesos /></span></div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hojas

// Logo sin los márgenes vacíos del archivo, para que se vea del tamaño del dibujo.
function LogoLocal({ src, alt }) {
  const [recortado, setRecortado] = useState(null)
  useEffect(() => {
    let vivo = true
    recortarLogo(src).then((r) => { if (vivo) setRecortado(r) })
    return () => { vivo = false }
  }, [src])
  return <img src={recortado || src} alt={alt} />
}

function Portada({ reporte, ...m }) {
  // Logo de cada local, en el orden de las hojas: el que se subió para el reporte o,
  // si no hay, el que el local tiene cargado en gestión. Los que no tienen ninguno no salen.
  const logos = reporte.locales
    .map((l) => ({ local: l.local, src: reporte.cliente?.logos?.[l.local] || reporte.cliente?.logosLocal?.[l.local] }))
    // Locales con el mismo logo (Gran Latino tiene uno solo para los cuatro): va una vez.
    .filter((x, i, todos) => x.src && todos.findIndex((y) => y.src === x.src) === i)
  const varios = reporte.locales.length > 1
  return (
    <Marco m={{ reporte, ...m }} clase="rv-portada" pie={false}>
      <div className="rv-portada-brillo" />
      <img className="rv-portada-logo" src={LOGO} alt="DCSMART Analytics" />
      <div className={`rv-portada-txt${logos.length ? ' rv-portada-txt-angosto' : ''}`}>
        <div className="rv-ceja rv-portada-ceja">Reporte de ventas</div>
        <h1 className={`rv-portada-tit${(reporte.cliente?.nombre || '').length > 16 ? ' rv-portada-tit-largo' : ''}`}>{reporte.cliente?.nombre}</h1>
        <div className="rv-portada-mes">{mesEnPalabras(reporte.mes)}</div>
        {varios && <div className="rv-portada-locales">{reporte.locales.map((l) => nom(reporte, l.local)).join(' · ')}</div>}
      </div>
      {logos.length > 0 && (
        <div className={`rv-portada-logos rv-logos-${Math.min(logos.length, 6)}`}>
          {logos.map((x) => <LogoLocal key={x.local} src={x.src} alt={`Logo de ${nom(reporte, x.local)}`} />)}
        </div>
      )}
      <div className="rv-portada-pie">
        <span>Tu rentabilidad, nuestra gestión</span>
        <span>{mesEnPalabras(mesSiguiente(reporte.mes))}</span>
      </div>
    </Marco>
  )
}

function Contraportada(m) {
  return (
    <Marco m={m} clase="rv-contra" pie={false}>
      <div className="rv-contra-brillo" />
      <div className="rv-contra-cuerpo">
        <img className="rv-contra-logo" src={LOGO} alt="DCSMART Analytics" />
        <div className="rv-contra-lema">Tu rentabilidad, nuestra gestión</div>
      </div>
    </Marco>
  )
}

// Canales con importe, de mayor a menor (el que más vende primero).
function canalesOrdenados(l) {
  return [...l.canales].sort((a, b) => (b.valor ?? -Infinity) - (a.valor ?? -Infinity))
}

// Lo que dice la síntesis: del grupo si hay más de un local, si no del local.
function datosSintesis(reporte) {
  if (reporte.consolidado) {
    const c = reporte.consolidado
    const h = c.historico[c.historico.length - 1]
    const filas = [...c.filas].sort((a, b) => (b.valor ?? -Infinity) - (a.valor ?? -Infinity))
      .map((f) => ({ nombre: nom(reporte, f.local), valor: f.valor, inc: f.inc }))
    return { venta: c.total, h, top: filas[0], topTxt: (t) => `de la venta la hizo ${t.nombre}` }
  }
  const l = reporte.locales[0]
  const h = l.historico[l.historico.length - 1]
  const hayCanales = l.canales.some((c) => c.nombre !== 'Local' && esNum(c.valor) && c.valor !== 0)
  const top = hayCanales ? canalesOrdenados(l)[0] : null
  return { venta: l.venta.valor, h, top, topTxt: (t) => `de la venta entró por el canal ${t.nombre}`, local: l }
}

function Sintesis({ reporte, ...m }) {
  if (!reporte.locales.length) return null
  const { venta, h, top, topTxt, local } = datosSintesis(reporte)
  const anio = Number(reporte.mes.slice(0, 4))
  const prev = nombreMes(mesPrevio(reporte.mes)).toLowerCase()
  const tarjetas = []
  if (esNum(h.varAnual)) {
    tarjetas.push(
      <div key="anual" className="rv-card rv-sint-card">
        <div className={`rv-sint-v ${tono(h.varAnual) || ''}`}>{texto(h.varAnual, { pct: true, signo: true })}</div>
        <div className="rv-sint-txt">contra {nombreMes(reporte.mes).toLowerCase()} {anio - 1}{esNum(h.anterior) ? ` (${texto(h.anterior, { pesos: true })})` : ''}</div>
      </div>,
    )
  }
  if (esNum(h.varPct)) {
    tarjetas.push(
      <div key="previo" className="rv-card rv-sint-card">
        <div className={`rv-sint-v ${tono(h.varPct) || ''}`}>{texto(h.varPct, { pct: true, signo: true })}</div>
        <div className="rv-sint-txt">
          contra {prev}{esNum(h.varPesos) && h.varPesos !== 0 ? `, una ${h.varPesos > 0 ? 'suba' : 'baja'} de ${texto(Math.abs(h.varPesos), { pesos: true })}` : ''}
        </div>
      </div>,
    )
  }
  if (top && esNum(top.inc)) {
    tarjetas.push(
      <div key="top" className="rv-card rv-sint-card">
        <div className="rv-sint-v rv-dorado">{fmtAR(top.inc, 2)}%</div>
        <div className="rv-sint-txt">{topTxt(top)}</div>
      </div>,
    )
  } else if (local && esNum(local.promCubierto)) {
    tarjetas.push(
      <div key="cub" className="rv-card rv-sint-card">
        <div className="rv-sint-v rv-dorado">{texto(local.promCubierto, { pesos: true })}</div>
        <div className="rv-sint-txt">de promedio por cubierto ({fmtAR(local.cubiertos.valor)} cubiertos)</div>
      </div>,
    )
  }
  return (
    <Marco m={{ reporte, ...m }} ceja={`${mesEnPalabras(reporte.mes)} · en síntesis`}
      titulo={titularSintesis({ mes: reporte.mes, venta, varAnual: h.varAnual, varPct: h.varPct })} clase="rv-sint">
      <div className={`rv-sint-tarjetas rv-cols-${Math.max(tarjetas.length, 1)}`}>{tarjetas}</div>
    </Marco>
  )
}

// Indicadores del mes de un local.
function Mes({ reporte, local: l, ...m }) {
  const h = l.historico[l.historico.length - 1]
  const anio = Number(reporte.mes.slice(0, 4))
  const prev = nombreMes(mesPrevio(reporte.mes)).toLowerCase()
  const sec = [
    esNum(l.cubiertos.valor) && <Tarjeta key="cub" k="Cubiertos" clase="rv-card-sec"><Num v={l.cubiertos.valor} /></Tarjeta>,
    esNum(l.ordenes.valor) && <Tarjeta key="ord" k="Órdenes" clase="rv-card-sec"><Num v={l.ordenes.valor} /></Tarjeta>,
    esNum(l.cubiertos.valor) && <Tarjeta key="pcub" k="Prom. por cubierto" clase="rv-card-sec"><Num v={l.promCubierto} pesos /></Tarjeta>,
    esNum(l.ordenes.valor) && <Tarjeta key="pord" k="Prom. por orden" clase="rv-card-sec"><Num v={l.promOrden} pesos /></Tarjeta>,
  ].filter(Boolean)
  return (
    <Marco m={{ reporte, ...m }} ceja={cejaLocal(reporte, l, mesEnPalabras(reporte.mes))} titulo="Indicadores del mes">
      <div className="rv-cuerpo">
        <div className="rv-fila rv-cols-3">
          <Tarjeta k="Venta del mes" clase="rv-card-oro" sub="Total de canales"><Num v={l.venta.valor} pesos /></Tarjeta>
          <Tarjeta k="Vs mes anterior" sub={esNum(h.varPesos) ? `${texto(h.varPesos, { pesos: true, signo: true })} contra ${prev}` : `Sin dato de ${prev}`}>
            <Num v={h.varPct} pct signo />
          </Tarjeta>
          <Tarjeta k={`Vs ${nombreMes(reporte.mes).toLowerCase()} ${anio - 1}`}
            sub={esNum(h.anterior) ? `${mes3(reporte.mes)} ${anio - 1}: ${texto(h.anterior, { pesos: true })}` : `Sin dato de ${anio - 1}`}>
            <Num v={h.varAnual} pct signo />
          </Tarjeta>
        </div>
        {sec.length > 0 && <div className={`rv-fila rv-fila-sec rv-cols-${sec.length}`}>{sec}</div>}
        {/* Sin cubiertos ni órdenes: el acumulado del año ocupa la segunda fila. */}
        {sec.length === 0 && Number(reporte.mes.slice(5, 7)) > 1 && (
          <div className="rv-fila rv-fila-sec rv-cols-2">
            <Tarjeta k={`Acumulado ${anio}`} clase="rv-card-sec" sub={`Enero – ${nombreMes(reporte.mes).toLowerCase()}`}>
              <Num v={l.acumulado.venta} pesos />
            </Tarjeta>
            <Tarjeta k={`Acumulado vs ${anio - 1}`} clase="rv-card-sec"
              sub={esNum(l.acumulado.anterior) ? `Mismo período ${anio - 1}: ${texto(l.acumulado.anterior, { pesos: true })}` : `Sin el acumulado completo de ${anio - 1}`}>
              <Num v={l.acumulado.varAnual} pct signo />
            </Tarjeta>
          </div>
        )}
      </div>
    </Marco>
  )
}

function Canales({ reporte, local: l, ...m }) {
  const filas = canalesOrdenados(l)
  const top = filas[0]
  return (
    <Marco m={{ reporte, ...m }} ceja={cejaLocal(reporte, l, 'Ventas por canal')} titulo={titularCanales(filas)}>
      <div className="rv-cuerpo">
        <Participacion filas={filas} total={l.venta.valor}
          frase={<>de los {esNum(l.venta.valor) ? texto(l.venta.valor, { pesos: true }) : '—'} del mes se vendió por el canal {top?.nombre}.</>} />
      </div>
    </Marco>
  )
}

function Consolidado({ reporte, ...m }) {
  const c = reporte.consolidado
  const filas = [...c.filas].sort((a, b) => (b.valor ?? -Infinity) - (a.valor ?? -Infinity))
    .map((f) => ({ nombre: nom(reporte, f.local), valor: f.valor, inc: f.inc }))
  return (
    <Marco m={{ reporte, ...m }} ceja={`Venta por local · ${mesEnPalabras(reporte.mes)}`} titulo={titularConsolidado(filas)}>
      <div className="rv-cuerpo">
        <Participacion filas={filas} total={c.total}
          frase={<>de los {esNum(c.total) ? texto(c.total, { pesos: true }) : '—'} del grupo los vendió {filas[0]?.nombre}.</>} />
      </div>
    </Marco>
  )
}

// Tabla mensual (histórico de un local o del grupo). `cols`: [{ k, th, td(fila), tot, clase }]
function TablaMensual({ filas, cols, mesActual, total }) {
  const n = filas.length
  return (
    <table className={`rv-tabla${n > 9 ? ' rv-tabla-12' : ''}${cols.length > 10 ? ' rv-tabla-ancha' : ''}`}>
      <thead><tr><th>Mes</th>{cols.map((c) => <th key={c.k}>{c.th}</th>)}</tr></thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.mes} className={f.mes === mesActual ? 'rv-cur' : undefined}>
            <td>{mes3(f.mes)}</td>
            {cols.map((c) => <td key={c.k} className={c.clase}>{c.td(f)}</td>)}
          </tr>
        ))}
        {total && (
          <tr className="rv-tot"><td>Total</td>{cols.map((c) => <td key={c.k} className={c.clase}>{c.tot ?? null}</td>)}</tr>
        )}
      </tbody>
    </table>
  )
}

function Historico({ reporte, local: l, ...m }) {
  const anio = Number(reporte.mes.slice(0, 4))
  const hist = l.historico
  const hayCub = hist.some((h) => esNum(h.cubiertos.valor))
  const hayOrd = hist.some((h) => esNum(h.ordenes.valor))
  const hayAnt = hist.some((h) => esNum(h.anterior))
  const a = l.acumulado
  const cols = [
    { k: 'v', th: 'Venta', td: (h) => <Num v={h.venta.valor} />, tot: <Num v={a.venta} />, clase: 'rv-fuerte' },
    hayAnt && { k: 'a', th: String(anio - 1), td: (h) => <Num v={h.anterior} />, tot: <Num v={a.anterior} />, clase: 'rv-tenue' },
    { k: 'vp', th: 'Var. $ vs MA', td: (h) => <Num v={h.varPesos} signo /> },
    { k: 'vpc', th: 'Var. % MA', td: (h) => <Num v={h.varPct} pct signo /> },
    hayAnt && { k: 'va', th: `Vs ${anio - 1}`, td: (h) => <Num v={h.varAnual} pct signo />, tot: <Num v={a.varAnual} pct signo /> },
    hayCub && { k: 'c', th: 'Cubiertos', td: (h) => <Num v={h.cubiertos.valor} />, tot: <Num v={suma(hist.map((h) => h.cubiertos.valor))} /> },
    hayCub && { k: 'pc', th: 'Prom. cub.', td: (h) => <Num v={h.promCubierto} />, tot: <Num v={a.promCubierto} /> },
    hayOrd && { k: 'o', th: 'Órdenes', td: (h) => <Num v={h.ordenes.valor} />, tot: <Num v={suma(hist.map((h) => h.ordenes.valor))} /> },
    hayOrd && { k: 'po', th: 'Prom. orden', td: (h) => <Num v={h.promOrden} />, tot: <Num v={a.promOrden} /> },
  ].filter(Boolean)
  return (
    <Marco m={{ reporte, ...m }} ceja={cejaLocal(reporte, l, `Histórico ${anio}`)} titulo="Detalle mensual de ventas y operación"
      notaPie="MA = mes anterior">
      <div className="rv-cuerpo">
        <TablaMensual filas={hist.map((h) => ({ ...h, mes: h.mes }))} cols={cols} mesActual={reporte.mes} total />
      </div>
    </Marco>
  )
}

function ConsolidadoHist({ reporte, ...m }) {
  const c = reporte.consolidado
  const anio = Number(reporte.mes.slice(0, 4))
  const locales = c.filas.map((f) => f.local)
  const hayAnt = c.historico.some((h) => esNum(h.anterior))
  const cols = [
    ...locales.map((l) => ({ k: `l:${l}`, th: nom(reporte, l), td: (h) => <Num v={h.porLocal[l]} />,
      tot: <Num v={suma(c.historico.map((h) => h.porLocal[l]))} /> })),
    { k: 't', th: 'Total', td: (h) => <Num v={h.total} />, tot: <Num v={c.acumulado.venta} />, clase: 'rv-fuerte' },
    { k: 'vpc', th: 'Var. % MA', td: (h) => <Num v={h.varPct} pct signo /> },
    hayAnt && { k: 'a', th: String(anio - 1), td: (h) => <Num v={h.anterior} />, tot: <Num v={c.acumulado.anterior} />, clase: 'rv-tenue' },
    hayAnt && { k: 'va', th: `Vs ${anio - 1}`, td: (h) => <Num v={h.varAnual} pct signo />, tot: <Num v={c.acumulado.varAnual} pct signo /> },
  ].filter(Boolean)
  return (
    <Marco m={{ reporte, ...m }} ceja={`Histórico ${anio} · todos los locales`} titulo="Venta mensual del grupo" notaPie="MA = mes anterior">
      <div className="rv-cuerpo">
        <TablaMensual filas={c.historico} cols={cols} mesActual={reporte.mes} total />
      </div>
    </Marco>
  )
}

// Venta del año mes a mes, contra el año anterior si hay datos.
function Comparativo({ reporte, local: l, ...m }) {
  const anio = Number(reporte.mes.slice(0, 4))
  const filas = l.historico.map((h) => ({ mes: h.mes, venta: h.venta.valor, anterior: h.anterior }))
  const conAnterior = filas.some((f) => esNum(f.anterior))
  const rango = filas.length > 1 ? `Enero – ${nombreMes(reporte.mes).toLowerCase()}` : nombreMes(reporte.mes)
  return (
    <Marco m={{ reporte, ...m }} ceja={cejaLocal(reporte, l, `${rango} · millones de $`)}
      titulo={titularComparativo(filas, anio)}
      derecha={conAnterior && (
        <div className="rv-leyenda">
          <span><i className="rv-ley-act" /> {anio}</span>
          <span><i className="rv-ley-ant" /> {anio - 1}</span>
        </div>
      )}>
      <div className="rv-cuerpo rv-comp">
        <Columnas filas={filas} conAnterior={conAnterior} />
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
  const muchas = filas.length > 9
  const minis = filas.length <= 6 || apps.length === 1
  return (
    <Marco m={{ reporte, ...m }} ceja={cejaLocal(reporte, l, `Delivery ${anio}`)} titulo="Venta por aplicación" notaPie="MA = mes anterior">
      <div className="rv-cuerpo">
        <table className={`rv-tabla${muchas ? ' rv-tabla-12' : ''}${apps.length > 2 ? ' rv-tabla-ancha' : ''}`} style={{ width: Math.min(1262, 460 + apps.length * 330) }}>
          <thead>
            <tr className="rv-grupo">
              <th colSpan={3} />
              {apps.map((a) => <th key={a} colSpan={3}>{a}</th>)}
            </tr>
            <tr>
              <th>Mes</th><th>Delivery</th><th>Var. % MA</th>
              {apps.map((a) => <Fragment key={a}><th>Venta</th><th>Tickets</th><th>Prom.</th></Fragment>)}
            </tr>
          </thead>
          <tbody>
            {filas.map((d) => (
              <tr key={d.mes} className={d.mes === reporte.mes ? 'rv-cur' : undefined}>
                <td>{mes3(d.mes)}</td>
                <td className="rv-fuerte"><Num v={d.total} /></td>
                <td><Num v={d.varPct} pct signo /></td>
                {apps.map((a) => {
                  const x = d.apps[a]
                  return (
                    <Fragment key={a}>
                      <td><Num v={x?.venta} /></td><td><Num v={x?.tickets} /></td><td><Num v={x?.prom} /></td>
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
                    <td><Num v={suma(conVenta.map((x) => x.venta))} /></td>
                    <td><Num v={suma(conVenta.map((x) => x.tickets))} /></td><td />
                  </Fragment>
                )
              })}
            </tr>
          </tbody>
        </table>
        {minis && (
          <div className="rv-minis" style={{ gridTemplateColumns: `repeat(${Math.min(apps.length, 4)}, 1fr)` }}>
            {apps.slice(0, 4).map((a) => (
              <div key={a} className="rv-card rv-mini">
                <div className="rv-card-k">{a} · venta por mes</div>
                <MiniTendencia serie={filas.map((d) => ({ mes: d.mes, valor: d.apps[a]?.venta ?? null }))}
                  ancho={Math.floor(1262 / Math.min(apps.length, 4)) - 66} alto={110} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Marco>
  )
}

// Acumulado del año: del grupo si hay más de un local, si no del local.
function Acumulado({ reporte, ...m }) {
  if (!reporte.locales.length) return null
  const a = reporte.consolidado?.acumulado ?? reporte.locales[0].acumulado
  const anio = Number(reporte.mes.slice(0, 4))
  const tarjetas = [
    esNum(a.cubiertos) && <Tarjeta key="c" k="Cubiertos" clase="rv-card-acum"><Num v={a.cubiertos} /></Tarjeta>,
    esNum(a.ordenes) && <Tarjeta key="o" k="Órdenes" clase="rv-card-acum"><Num v={a.ordenes} /></Tarjeta>,
    esNum(a.cubiertos) && <Tarjeta key="pc" k="Prom. por cubierto" clase="rv-card-acum"><Num v={a.promCubierto} pesos /></Tarjeta>,
    esNum(a.ordenes) && <Tarjeta key="po" k="Prom. por orden" clase="rv-card-acum"><Num v={a.promOrden} pesos /></Tarjeta>,
  ].filter(Boolean)
  // Con varios locales, cuánto lleva cada uno en el año.
  const porLocal = reporte.consolidado
    ? reporte.locales.map((l) => ({ nombre: nom(reporte, l.local), venta: l.acumulado.venta, varAnual: l.acumulado.varAnual }))
    : null
  return (
    <Marco m={{ reporte, ...m }} clase="rv-acum" brillo
      ceja={`Acumulado enero – ${nombreMes(reporte.mes).toLowerCase()} ${anio}`}>
      <div className="rv-acum-big"><Num v={a.venta} pesos /></div>
      <div className="rv-acum-sub">
        {esNum(a.varAnual)
          ? <><Num v={a.varAnual} pct signo /> contra el mismo período de {anio - 1} ({texto(a.anterior, { pesos: true })})</>
          : `Sin el acumulado completo de ${anio - 1} para comparar`}
      </div>
      {porLocal && (
        <div className="rv-acum-locales">
          {porLocal.map((p) => (
            <div key={p.nombre} className="rv-acum-local">
              <span className="rv-acum-local-nom">{p.nombre}</span>
              <span className="rv-acum-local-v"><Num v={p.venta} pesos /></span>
              {esNum(p.varAnual) && <span className="rv-acum-local-var"><Num v={p.varAnual} pct signo /></span>}
            </div>
          ))}
        </div>
      )}
      {tarjetas.length > 0 && <div className={`rv-acum-tarjetas rv-cols-${tarjetas.length}`}>{tarjetas}</div>}
    </Marco>
  )
}

const HOJAS = {
  portada: Portada, sintesis: Sintesis, consolidado: Consolidado, consolidadoHist: ConsolidadoHist,
  mes: Mes, canales: Canales, comparativo: Comparativo, historico: Historico, delivery: Delivery,
  acumulado: Acumulado, contraportada: Contraportada,
}

// Una hoja según pagina.tipo. `local` (LocalMes) es opcional: si no viene se busca
// por pagina.local. `numero` también: si no viene sale de la posición en reporte.paginas.
export function Hoja({ pagina, reporte, local, borrador = false, numero }) {
  const Comp = HOJAS[pagina.tipo]
  if (!Comp) return null
  const l = local ?? (pagina.local ? reporte.locales.find((x) => x.local === pagina.local) : undefined)
  if (pagina.local && !l) return null
  if ((pagina.tipo === 'consolidado' || pagina.tipo === 'consolidadoHist') && !reporte.consolidado) return null
  const n = numero ?? reporte.paginas.findIndex((p) => p.id === pagina.id) + 1
  return <Comp reporte={reporte} local={l} borrador={borrador} numero={n} total={reporte.paginas.length} />
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
