// Hojas del Reporte de Ventas mensual (lo que se imprime y se entrega al cliente).
// Entrada: el resultado de armarReporte (lib/reporteVentas.js). Regla de oro: solo
// datos reales; un null se muestra "—", nunca 0. Los titulares salen de
// lib/titularesReporte.js y solo repiten los números de la hoja.
// Diseño oscuro de oct-26 (referencia: "Reporte de ventas · 3 Monos · Septiembre 2026").
// Cada hoja es un div.rv-hoja de 1456×819 px; los gráficos son SVG o divs para que impriman nítidos.
import { useEffect, useState } from 'react'
import { fmtAR } from '../../lib/reporteVentas.js'
import { recortarLogo } from '../../lib/recorteLogo.js'
import { enMillones, titularCanales, titularConsolidado, titularSintesis } from '../../lib/titularesReporte.js'
import { anteriorActualizado, inflacionDelAcumulado } from '../../lib/inflacion.js'
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

function Marco({ ceja, titulo, derecha, children, clase = '', brillo = false, pie = true, notaPie, m, tituloChico = false }) {
  const obs = m.obs
  return (
    <div className={`rv-hoja ${clase}${obs ? ' rv-con-obs' : ''}`}>
      {brillo && <div className="rv-brillo" />}
      {(ceja || titulo) && (
        <div className="rv-cab">
          <div>
            {ceja && <div className="rv-ceja">{ceja}</div>}
            {titulo && <h2 className={`rv-tit${tituloChico ? ' rv-tit-chico' : ''}`}>{titulo}</h2>}
          </div>
          {derecha}
        </div>
      )}
      {children}
      {obs && (
        <div className="rv-obs">
          <span className="rv-obs-k">Observaciones</span>
          <p>{obs}</p>
        </div>
      )}
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

// Líneas mes a mes: el año (claro), el anterior (gris, punteado) y el anterior
// actualizado por inflación (turquesa). Debajo, por mes, la variación nominal y la
// real (descontada la inflación). Los importes van en millones con un decimal.
//   filas: [{ mes, venta, anterior, anteriorAct }]
function Lineas({ filas, ancho = 1262, alto = 300 }) {
  const conAnterior = filas.some((f) => esNum(f.anterior))
  const conReal = filas.some((f) => esNum(f.anteriorAct))
  const izq = conAnterior ? 150 : 60
  const der = ancho - 34
  const n = filas.length
  const x = (i) => (n > 1 ? izq + (i * (der - izq)) / (n - 1) : (izq + der) / 2)
  const tope = Math.max(0, ...filas.flatMap((f) => [f.venta, f.anterior, f.anteriorAct]).filter(esNum))
  // Guías en números redondos (10, 20, 50... millones) hasta pasar el máximo.
  const paso = tope > 0 ? pasoRedondo(tope / 4) : 0
  const guias = paso ? Array.from({ length: Math.ceil(tope / paso) }, (_, i) => (i + 1) * paso) : []
  const max = Math.max(tope * 1.06, guias[guias.length - 1] || 0) || 1
  const arriba = 44
  const y = (v) => arriba + (alto - arriba) * (1 - v / max)
  const mill = (v) => fmtAR(v / 1e6, 1)
  // Tramos de puntos consecutivos con dato: un mes sin dato corta la línea.
  const tramos = (campo) => {
    const out = []
    let t = []
    filas.forEach((f, i) => {
      if (esNum(f[campo])) t.push([x(i), y(f[campo])])
      else if (t.length) { out.push(t); t = [] }
    })
    if (t.length) out.push(t)
    return out
  }
  const puntos = (t) => t.map((p) => p.join(',')).join(' ')
  const linea = (campo, clase) => tramos(campo).map((t, i) => (t.length > 1
    ? <polyline key={`${campo}${i}`} points={puntos(t)} className={clase} fill="none" /> : null))
  const area = tramos('venta').map((t, i) => (t.length > 1
    ? <polygon key={`a${i}`} className="rv-lin-area" points={puntos([...t, [t[t.length - 1][0], alto], [t[0][0], alto]])} /> : null))
  const fuente = n > 9 ? 16 : 18
  const variacionDe = (a, b) => (esNum(a) && esNum(b) && b !== 0 ? (a / b - 1) * 100 : null)
  // Fila de porcentajes por mes, debajo de los meses. Con 1 decimal para que entre.
  const filaPct = (yy, etiqueta, valor, conColor) => (
    <g>
      <text x={0} y={yy} className="rv-lin-fila">{etiqueta}</text>
      {filas.map((f, i) => {
        const v = valor(f)
        const clase = !esNum(v) ? 'rv-lin-nulo' : conColor ? (v >= 0 ? 'rv-lin-pos' : 'rv-lin-neg') : 'rv-lin-nom'
        return (
          <text key={f.mes} x={x(i)} y={yy} textAnchor="middle" fontSize={fuente - 1} className={clase}>
            {esNum(v) ? `${v > 0 ? '+' : v < 0 ? MENOS : ''}${fmtAR(Math.abs(v), 1)}%` : '—'}
          </text>
        )
      })}
    </g>
  )
  const altoTotal = alto + (conAnterior ? (conReal ? 118 : 86) : 46)
  return (
    <svg className="rv-svg" width={ancho} height={altoTotal} viewBox={`0 0 ${ancho} ${altoTotal}`}>
      {guias.map((g) => (
        <g key={g}>
          <line x1={izq - 24} x2={ancho} y1={y(g)} y2={y(g)} className="rv-lin-guia" />
          <text x={izq - 34} y={y(g) + 5} textAnchor="end" className="rv-lin-eje">{fmtAR(g / 1e6, 0)}</text>
        </g>
      ))}
      {area}
      {linea('anterior', 'rv-lin-ant')}
      {linea('anteriorAct', 'rv-lin-act')}
      {linea('venta', 'rv-lin-venta')}
      {filas.map((f, i) => (
        <g key={f.mes}>
          {esNum(f.anterior) && <circle cx={x(i)} cy={y(f.anterior)} r={5} className="rv-lin-pto-ant" />}
          {esNum(f.anteriorAct) && <circle cx={x(i)} cy={y(f.anteriorAct)} r={5} className="rv-lin-pto-act" />}
          {esNum(f.anterior) && (
            <text x={x(i)} y={y(f.anterior) + 28} textAnchor="middle" fontSize={fuente - 2} className="rv-lin-val-ant">{mill(f.anterior)}</text>
          )}
          {esNum(f.venta) && (
            <>
              <circle cx={x(i)} cy={y(f.venta)} r={i === n - 1 ? 9 : 7} className={i === n - 1 ? 'rv-lin-pto-cur' : 'rv-lin-pto'} />
              <text x={x(i)} y={y(f.venta) - 18} textAnchor="middle" fontSize={fuente}
                className={i === n - 1 ? 'rv-lin-val rv-lin-val-cur' : 'rv-lin-val'}>{mill(f.venta)}</text>
            </>
          )}
          <text x={x(i)} y={alto + 34} textAnchor="middle" className={i === n - 1 ? 'rv-col-mes rv-col-mes-cur' : 'rv-col-mes'}>{mes3(f.mes)}</text>
        </g>
      ))}
      <line x1={izq - 24} x2={ancho} y1={alto + 0.5} y2={alto + 0.5} className="rv-col-base" />
      {conAnterior && filaPct(alto + 78, 'Vs año ant.', (f) => variacionDe(f.venta, f.anterior), false)}
      {conReal && filaPct(alto + 110, 'Real', (f) => variacionDe(f.venta, f.anteriorAct), true)}
    </svg>
  )
}

// 1, 2, 2,5 o 5 por una potencia de 10, el primero que no sea menor que x.
function pasoRedondo(x) {
  const p = 10 ** Math.floor(Math.log10(x))
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((v) => v >= x)
}

// Columnas chicas de una serie mensual (millones), el último mes en dorado.
function MiniColumnas({ serie, ancho = 420, alto = 120 }) {
  const max = Math.max(0, ...serie.map((p) => p.valor).filter(esNum)) || 1
  const paso = ancho / Math.max(serie.length, 1)
  const w = Math.min(34, paso * 0.6)
  const h = (v) => (esNum(v) && v > 0 ? ((alto - 50) * v) / max : 0)
  return (
    <svg className="rv-svg" width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`}>
      {serie.map((p, i) => {
        const cx = i * paso + paso / 2
        const cur = i === serie.length - 1
        return (
          <g key={p.mes}>
            {h(p.valor) > 0 && <rect x={cx - w / 2} y={alto - 24 - h(p.valor)} width={w} height={h(p.valor)} rx={3} className={cur ? 'rv-col-cur' : 'rv-col-ant'} />}
            <text x={cx} y={alto - 30 - h(p.valor)} textAnchor="middle" className="rv-mini-val">{esNum(p.valor) ? fmtAR(p.valor / 1e6, 1) : '—'}</text>
            <text x={cx} y={alto - 4} textAnchor="middle" className={cur ? 'rv-mini-eje rv-mini-eje-cur' : 'rv-mini-eje'}>{mes3(p.mes)}</text>
          </g>
        )
      })}
    </svg>
  )
}

// Participación: cifra grande a la izquierda y lista con barras a la derecha.
//   filas: [{ nombre, valor, inc, pie?, extra? }] en el orden en que se muestran (la primera en dorado).
//   grande: la cifra de la izquierda (si no, el % de la primera fila); abajo: algo debajo de la frase.
function Participacion({ filas, total, frase, grande, abajo, totalNombre = 'Total', compacto = false }) {
  const max = Math.max(0, ...filas.map((f) => f.valor).filter(esNum))
  const prim = filas[0]
  const alto = filas.length > 3 ? 0 : Math.min(compacto ? 110 : 152, (compacto ? 230 : 300) / Math.max(filas.length, 1))
  const densidad = filas.length > 6 ? ' rv-part-muchas rv-part-muchisimas' : filas.length > 3 || compacto ? ' rv-part-muchas' : ''
  return (
    <div className={`rv-part${compacto ? ' rv-part-compacto' : ''}`}>
      <div className="rv-part-izq">
        <div className="rv-part-big">{grande ?? (esNum(prim?.inc) ? `${fmtAR(prim.inc, 1)}%` : '—')}</div>
        <div className="rv-part-txt">{frase}</div>
        {abajo}
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
            <div className="rv-part-pct">
              <span>{f.pie ?? (esNum(f.inc) ? `${fmtAR(f.inc, 2)}% del total` : '—')}</span>
              {f.extra && <span>{f.extra}</span>}
            </div>
          </div>
        ))}
        <div className="rv-part-total"><span>{totalNombre}</span><span><Num v={total} pesos /></span></div>
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
        <Participacion filas={filas} total={l.venta.valor} compacto={!!m.obs}
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
        <Participacion filas={filas} total={c.total} compacto={!!m.obs}
          frase={<>de los {esNum(c.total) ? texto(c.total, { pesos: true }) : '—'} del grupo los vendió {filas[0]?.nombre}.</>} />
      </div>
    </Marco>
  )
}

// Tabla mensual (histórico de un local o del grupo). `cols`: [{ k, th, td(fila), tot, clase }]
// apretada: hay observación abajo y la tabla tiene que dejarle lugar.
function TablaMensual({ filas, cols, mesActual, total, apretada = false }) {
  const n = filas.length
  const clases = [n > 9 || apretada ? ' rv-tabla-12' : '', apretada && n > 9 ? ' rv-tabla-apretada' : '', cols.length > 10 ? ' rv-tabla-ancha' : '']
  return (
    <table className={`rv-tabla${clases.join('')}`}>
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
        <TablaMensual filas={hist.map((h) => ({ ...h, mes: h.mes }))} cols={cols} mesActual={reporte.mes} total apretada={!!m.obs} />
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
        <TablaMensual filas={c.historico} cols={cols} mesActual={reporte.mes} total apretada={!!m.obs} />
      </div>
    </Marco>
  )
}

// Venta del año mes a mes, contra el año anterior y su versión actualizada por inflación.
function Comparativo({ reporte, local: l, ...m }) {
  const filas = l.historico.map((h) => ({
    mes: h.mes, venta: h.venta.valor, anterior: h.anterior, anteriorAct: anteriorActualizado(reporte.ipc, h.mes, h.anterior),
  }))
  const conAnterior = filas.some((f) => esNum(f.anterior))
  const conReal = filas.some((f) => esNum(f.anteriorAct))
  const anio = Number(reporte.mes.slice(0, 4))
  const rango = filas.length > 1 ? `Enero – ${nombreMes(reporte.mes).toLowerCase()}` : nombreMes(reporte.mes)
  return (
    <Marco m={{ reporte, ...m }} ceja={cejaLocal(reporte, l, `${rango} · millones de $`)} tituloChico
      titulo={conAnterior ? 'Total de ventas por mes comparado con el año anterior' : 'Total de ventas por mes'}
      notaPie={conReal ? 'Real = descontada la inflación (IPC de INDEC)' : undefined}>
      <div className="rv-cuerpo rv-comp">
        {conAnterior && (
          <div className="rv-leyenda">
            <span><i className="rv-ley-venta" /> {anio}</span>
            <span><i className="rv-ley-ant" /> {anio - 1}</span>
            {conReal && <span><i className="rv-ley-act" /> {anio - 1} actualizado por inflación</span>}
          </div>
        )}
        <Lineas filas={filas} alto={m.obs ? 240 : 320} />
      </div>
    </Marco>
  )
}

// Delivery del mes: cuánto pesan las apps sobre la venta y cómo se reparten.
function Delivery({ reporte, local: l, ...m }) {
  const d = l.delivery.find((x) => x.mes === reporte.mes)
  const total = d?.total ?? null
  const venta = l.venta.valor
  const apps = Object.entries(d?.apps || {}).filter(([, a]) => esNum(a.venta)).sort((a, b) => b[1].venta - a[1].venta)
  const pct = (a, b) => (esNum(a) && esNum(b) && b !== 0 ? (100 * a) / b : null)
  const filas = apps.map(([nombre, a]) => {
    const delDelivery = pct(a.venta, total)
    const deLaVenta = pct(a.venta, venta)
    return {
      nombre, valor: a.venta, inc: delDelivery,
      pie: [esNum(delDelivery) && `${fmtAR(delDelivery, 2)}% del delivery`, esNum(deLaVenta) && `${fmtAR(deLaVenta, 2)}% de la venta`].filter(Boolean).join(' · '),
      // Tickets y promedio solo si están cargados: en el PDF del cliente no va "falta".
      extra: esNum(a.tickets) ? `${fmtAR(a.tickets)} tickets · prom. ${texto(a.prom, { pesos: true })}` : null,
    }
  })
  const meses = l.delivery.filter((x) => esNum(x.total))
  return (
    <Marco m={{ reporte, ...m }} ceja={cejaLocal(reporte, l, `Delivery · ${mesEnPalabras(reporte.mes)}`)}
      titulo={esNum(total) ? `Las apps de delivery sumaron ${enMillones(total)}` : 'Venta por aplicación'}>
      <div className="rv-cuerpo">
        <Participacion filas={filas} total={total} totalNombre="Total delivery" compacto={!!m.obs}
          grande={esNum(pct(total, venta)) ? `${fmtAR(pct(total, venta), 2)}%` : '—'}
          frase={esNum(total)
            ? <>de los {esNum(venta) ? texto(venta, { pesos: true }) : '—'} del mes entró por aplicaciones de delivery.</>
            : <>Sin ventas por aplicaciones en {nombreMes(reporte.mes).toLowerCase()}.</>}
          abajo={meses.length > 1 && !m.obs && (
            <div className="rv-part-mini">
              <div className="rv-card-k">Delivery por mes · millones de $</div>
              <MiniColumnas serie={meses.slice(-6).map((x) => ({ mes: x.mes, valor: x.total }))} />
            </div>
          )} />
      </div>
    </Marco>
  )
}

// Acumulado del año: del grupo si hay más de un local, si no del local. Con la
// inflación de INDEC para comparar: la del mes, la del año y el crecimiento real.
function Acumulado({ reporte, ...m }) {
  if (!reporte.locales.length) return null
  const a = reporte.consolidado?.acumulado ?? reporte.locales[0].acumulado
  const anio = Number(reporte.mes.slice(0, 4))
  const mesNom = nombreMes(reporte.mes).toLowerCase()
  const filasInf = reporte.consolidado
    ? reporte.consolidado.historico.map((h) => ({ mes: h.mes, venta: h.total, anterior: h.anterior }))
    : reporte.locales[0].historico.map((h) => ({ mes: h.mes, venta: h.venta.valor, anterior: h.anterior }))
  const inf = inflacionDelAcumulado(reporte.ipc, filasInf, reporte.mes)
  const ops = [
    esNum(a.cubiertos) && <Tarjeta key="c" k="Cubiertos" clase="rv-card-acum"><Num v={a.cubiertos} /></Tarjeta>,
    esNum(a.ordenes) && <Tarjeta key="o" k="Órdenes" clase="rv-card-acum"><Num v={a.ordenes} /></Tarjeta>,
    esNum(a.cubiertos) && <Tarjeta key="pc" k="Prom. por cubierto" clase="rv-card-acum"><Num v={a.promCubierto} pesos /></Tarjeta>,
    esNum(a.ordenes) && <Tarjeta key="po" k="Prom. por orden" clase="rv-card-acum"><Num v={a.promOrden} pesos /></Tarjeta>,
  ].filter(Boolean)
  const sinDato = 'Sin dato de INDEC'
  // Con varios locales, cuánto lleva cada uno en el año.
  const porLocal = reporte.consolidado
    ? reporte.locales.map((l) => ({ nombre: nom(reporte, l.local), venta: l.acumulado.venta, varAnual: l.acumulado.varAnual }))
    : null
  return (
    <Marco m={{ reporte, ...m }} clase="rv-acum" brillo ceja={`Acumulado enero – ${mesNom} ${anio}`}
      notaPie="Inflación: IPC nivel general nacional de INDEC">
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
      <div className="rv-acum-filas">
        <div className="rv-fila rv-cols-3">
          <Tarjeta k={`Inflación de ${mesNom}`} clase="rv-card-acum rv-card-inf" sub={esNum(inf.mes) ? 'IPC mensual' : sinDato}>
            {esNum(inf.mes) ? `${fmtAR(inf.mes, 1)}%` : '—'}
          </Tarjeta>
          <Tarjeta k={`Inflación enero – ${mesNom}`} clase="rv-card-acum rv-card-inf" sub={esNum(inf.anio) ? 'Acumulada en el año' : sinDato}>
            {esNum(inf.anio) ? `${fmtAR(inf.anio, 1)}%` : '—'}
          </Tarjeta>
          <Tarjeta k="Crecimiento real" clase="rv-card-acum rv-card-inf"
            sub={esNum(inf.real) ? `Contra ${anio - 1} actualizado por inflación (${texto(inf.anteriorAct, { pesos: true })})` : `Falta la inflación de algún mes o el acumulado de ${anio - 1}`}>
            <Num v={inf.real} pct signo />
          </Tarjeta>
        </div>
        {ops.length > 0 && <div className={`rv-fila rv-cols-${ops.length}`}>{ops}</div>}
      </div>
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
  const obs = reporte.observaciones?.[pagina.id]?.texto || null
  return <Comp reporte={reporte} local={l} borrador={borrador} numero={n} total={reporte.paginas.length} obs={obs} />
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
