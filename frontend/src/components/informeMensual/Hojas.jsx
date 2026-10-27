// Hojas del Informe mensual (lo que se imprime y se entrega al cliente).
// Entrada: el Informe de lib/informeMensual.js (armarInformeMensual) y las páginas de paginasDe.
// Regla de oro: solo datos reales; un null se muestra "—", nunca 0 (formatos en lib/formatosIm.js).
// Cada hoja es un div.im-hoja de 1456×819 px. La Task 7 agrega el resto al mapa HOJAS_IM_COMPONENTES.
import { useEffect, useState } from 'react'
import { recortarLogo } from '../../lib/recorteLogo.js'
import { cashflowDe, deudaDe, paginasDe, pct, resumenDe } from '../../lib/informeMensual.js'
import {
  fmtNumIm, fmtPctIm, fmtPesosIm, fmtPtsIm, flechaIm, mesEnPalabrasIm, nombreMesIm, periodoIm, tonoIm,
} from '../../lib/formatosIm.js'
import '../../styles/informe-mensual.css'

const LOGO = '/logos/DC-MANAGEMENT.png'

const esNum = (v) => v != null && Number.isFinite(v)
const claseTono = (t) => (t === 'pos' ? 'im-pos' : t === 'neg' ? 'im-neg' : undefined)
const resta = (a, b) => (esNum(a) && esNum(b) ? a - b : null)

// ---------------------------------------------------------------------------
// Datos del informe

// Local de la hoja: el de la página o, en las hojas del cliente con un solo local, ese.
const localDe = (informe, pagina) =>
  informe.locales.find((x) => x.local === pagina?.local) || (informe.locales.length === 1 ? informe.locales[0] : null)
const nombreCliente = (informe) => informe.cliente?.nombre || ''

function Rombo({ tam = 22 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 22 22" aria-hidden="true">
      <path d="M11 1 L21 11 L11 21 L1 11 Z" fill="none" stroke="#4fb3bb" strokeWidth="1.5" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Armazón común

function Marco({ ceja, titulo, derecha, children, m, informe, tam = 46, arriba = 96, compacto = false, clase = '', pie = true, notaPie }) {
  const obs = m.obs
  return (
    <div className={`im-hoja ${clase}${obs ? ' im-con-obs' : ''}`} style={{ padding: `${arriba}px 97px 0` }}>
      {(ceja || titulo) && (
        <div className="im-cab">
          <div>
            {ceja && <div className="im-ceja">{ceja}</div>}
            {titulo && <h2 className={`im-tit${tam === 40 ? ' im-tit-40' : tam === 34 ? ' im-tit-34' : ''}`}>{titulo}</h2>}
          </div>
          {derecha}
        </div>
      )}
      {children}
      {obs && (
        <div className={`im-obs${compacto ? ' im-obs-compacto' : ''}`}>
          <span className="im-obs-k">Observaciones</span>
          <p>{obs}</p>
        </div>
      )}
      {pie && (
        <div className={`im-pie${compacto ? ' im-pie-compacto' : ''}`}>
          <span className="im-pie-izq">
            <Rombo tam={compacto ? 20 : 22} />
            DC Management · Informe mensual · {nombreCliente(informe)}{notaPie ? ` · ${notaPie}` : ''}
          </span>
          <span>{m.numero} / {m.total}</span>
        </div>
      )}
      {m.borrador && <div className="im-marca" aria-hidden="true">BORRADOR</div>}
    </div>
  )
}

// Ceja de las hojas de un local: con más de un local va el nombre adelante.
function cejaLocal(informe, local, txt) {
  return informe.locales.length > 1 && local ? `${local.nombre} · ${txt}` : txt
}

// Diferencia con flecha y color. `texto` es lo que va después de la flecha.
function Delta({ dif, sentido = 'resultado', texto }) {
  if (!esNum(dif)) return <span className="im-nulo">—</span>
  const t = claseTono(tonoIm(dif, sentido))
  return <span className={t}>{flechaIm(dif)} {texto}</span>
}

// ---------------------------------------------------------------------------
// Portada y contraportada

function RombosPortada() {
  return (
    <svg className="im-rombos" width="560" height="819" viewBox="0 0 560 819" aria-hidden="true">
      <path d="M300 120 L520 340 L300 560 L80 340 Z" fill="none" stroke="#4fb3bb" strokeWidth="1.5" />
      <path d="M300 170 L520 390 L300 610 L80 390 Z" fill="none" stroke="#4fb3bb" strokeWidth="1.5" />
      <path d="M300 220 L520 440 L300 660 L80 440 Z" fill="none" stroke="#4fb3bb" strokeWidth="1.5" />
    </svg>
  )
}

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

function Portada({ informe, m }) {
  const nombre = nombreCliente(informe)
  // Logo de cada local: el que se subió para el reporte o, si no hay, el que tiene en gestión.
  // Locales con el mismo logo van una sola vez.
  const logos = informe.locales
    .map((l) => ({ local: l.local, nombre: l.nombre, src: informe.cliente?.logos?.[l.local] || informe.cliente?.logosLocal?.[l.local] }))
    .filter((x) => x.src)
    .filter((x, i, todos) => todos.findIndex((y) => y.src === x.src) === i)
  return (
    <div className="im-hoja im-portada">
      <div className="im-portada-cuna" />
      <RombosPortada />
      <div className="im-portada-logo">
        <img src={LOGO} alt="DC Management" />
        <i />
      </div>
      <div className="im-portada-txt">
        <div className="im-ceja">Informe mensual · {mesEnPalabrasIm(informe.mes)}</div>
        <h1 className={`im-portada-tit${nombre.length > 18 ? ' im-portada-tit-largo' : ''}`}>{nombre}</h1>
        {informe.razonSocial && <div className="im-portada-razon">{informe.razonSocial}</div>}
      </div>
      {logos.length > 0 ? (
        <div className={`im-portada-logos im-logos-${Math.min(logos.length, 6)}`}>
          {logos.map((x) => <LogoLocal key={x.local} src={x.src} alt={`Logo de ${x.nombre}`} />)}
        </div>
      ) : (
        <div className="im-portada-nombres">
          {informe.locales.map((l) => <div key={l.local}>{l.nombre}</div>)}
        </div>
      )}
      <div className="im-portada-pie">
        <div className="im-portada-lema">Tu rentabilidad, nuestra gestión</div>
        <div className="im-portada-periodo">Período {periodoIm(informe.mes)}</div>
      </div>
      {m.borrador && <div className="im-marca" aria-hidden="true">BORRADOR</div>}
    </div>
  )
}

function Contraportada({ informe, m }) {
  return (
    <div className="im-hoja im-contra">
      <svg className="im-rombos" width="900" height="819" viewBox="0 0 900 819" aria-hidden="true">
        <path d="M450 110 L750 410 L450 710 L150 410 Z" fill="none" stroke="#4fb3bb" strokeWidth="2" />
        <path d="M450 60 L800 410 L450 760 L100 410 Z" fill="none" stroke="#4fb3bb" strokeWidth="2" />
      </svg>
      <img src={LOGO} alt="DC Management" />
      <div className="im-contra-raya" />
      <div className="im-contra-lema">Tu rentabilidad, nuestra gestión</div>
      <div className="im-contra-pie">Informe mensual · {nombreCliente(informe)} · {mesEnPalabrasIm(informe.mes)}</div>
      {m.borrador && <div className="im-marca" aria-hidden="true">BORRADOR</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Índice: una fila por tipo de hoja, con el número de su primera página.

function Indice({ informe, m }) {
  const filas = []
  m.paginas.forEach((p, i) => {
    if (['portada', 'indice', 'contraportada'].includes(p.clave)) return
    const previa = filas.find((f) => f.clave === p.clave)
    if (previa) previa.hojas += 1
    else filas.push({ clave: p.clave, titulo: p.titulo, numero: i + 1, hojas: 1 })
  })
  const mitad = Math.ceil(filas.length / 2)
  const cols = [filas.slice(0, mitad), filas.slice(mitad)]
  return (
    <Marco m={m} informe={informe} ceja={`${nombreCliente(informe)} · ${mesEnPalabrasIm(informe.mes)}`} titulo="Índice">
      <div className={`im-indice${filas.length > 12 ? ' im-indice-muchas' : ''}`}>
        {cols.map((col, c) => (
          <div className="im-indice-col" key={c}>
            {col.map((f) => (
              <div className="im-indice-fila" key={f.clave}>
                <span className="im-indice-n">{String(f.numero).padStart(2, '0')}</span>
                <span className="im-indice-t">{f.titulo}</span>
                {f.hojas > 1 && <span className="im-indice-h">{f.hojas} hojas</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Marco>
  )
}

// ---------------------------------------------------------------------------
// Principales indicadores (cliente con un solo local)

function Indicadores({ informe, m, pagina }) {
  const l = localDe(informe, pagina)
  const act = l?.meses?.[informe.mes] || null
  const ant = l?.mesAnterior || null
  const a = act?.indicadores || {}
  const b = ant?.indicadores || {}
  const mesAnt = ant?.mes ? nombreMesIm(ant.mes) : null
  const mesAntCorto = mesAnt ? mesAnt.slice(0, 3).toLowerCase() : null

  const dVenta = resta(a.venta, b.venta)
  const pctVenta = pct(dVenta, b.venta)
  const dDias = resta(a.dias, b.dias)
  const dPax = resta(a.pax, b.pax)
  const dProm = resta(a.promPax, b.promPax)
  const labor = act?.valores?.egresos?.labor
  const laborMonto = act && esNum(labor) ? labor : null

  const textoDias = !esNum(dDias) ? null
    : dDias === 0 ? 'mismos días'
      : `${Math.abs(dDias)} ${Math.abs(dDias) === 1 ? 'día' : 'días'} ${dDias > 0 ? 'más' : 'menos'}`

  // Tarjeta de porcentaje: el % grande, el monto y los puntos contra el mes anterior.
  const Pct = ({ k, valor, monto, previo, sentido, oro = false }) => {
    const pts = resta(valor, previo)
    return (
      <div className={`im-card im-ind${oro ? ' im-card-oro' : ''}`}>
        <div className="im-k">{k}</div>
        <div className={`im-ind-pct${oro ? ' im-oro' : ''}`}>{fmtPctIm(valor)}</div>
        <div className="im-ind-monto">{fmtPesosIm(monto)}</div>
        <div className="im-ind-delta">
          {esNum(pts) && mesAntCorto
            ? <Delta dif={pts} sentido={sentido} texto={`${fmtPtsIm(Math.abs(pts))} (${mesAntCorto} ${fmtPctIm(previo)})`} />
            : <span className="im-nulo">—</span>}
        </div>
      </div>
    )
  }

  return (
    <Marco m={m} informe={informe} ceja={`Principales indicadores · ${mesEnPalabrasIm(informe.mes)}`} titulo="El mes en números"
      derecha={mesAnt ? <div className="im-nota-cab">Flechas: contra {mesAnt} {ant.mes.slice(0, 4)}</div> : null}>
      <div className="im-ind-grid im-ind-fila1">
        <div className="im-card im-card-oro im-ind im-ind-grande">
          <div className="im-k">Venta del mes</div>
          <div className="im-ind-v">{fmtPesosIm(a.venta)}</div>
          <div className="im-ind-delta">
            <Delta dif={dVenta} texto={`${fmtPctIm(pctVenta == null ? null : Math.abs(pctVenta))} · ${fmtPesosIm(esNum(dVenta) ? Math.abs(dVenta) : null)} ${dVenta > 0 ? 'más' : 'menos'}`} />
          </div>
        </div>
        <div className="im-card im-ind">
          <div className="im-k">Días de venta</div>
          <div className="im-ind-v">{fmtNumIm(a.dias)}</div>
          <div className="im-ind-delta">{textoDias || '—'}{esNum(a.promDias) ? ` · prom. ${fmtPesosIm(a.promDias)}` : ''}</div>
        </div>
        <div className="im-card im-ind">
          <div className="im-k">Cubiertos (pax)</div>
          <div className="im-ind-v">{fmtNumIm(a.pax)}</div>
          <div className="im-ind-delta"><Delta dif={dPax} texto={`${fmtNumIm(esNum(dPax) ? Math.abs(dPax) : null)} cubiertos`} /></div>
        </div>
        <div className="im-card im-ind">
          <div className="im-k">Promedio por pax</div>
          <div className="im-ind-v">{fmtPesosIm(a.promPax)}</div>
          <div className="im-ind-delta"><Delta dif={dProm} texto={fmtPesosIm(esNum(dProm) ? Math.abs(dProm) : null)} /></div>
        </div>
      </div>
      <div className="im-ind-grid im-ind-fila2">
        <Pct k="CMV" valor={a.cmvPct} monto={a.cmv} previo={b.cmvPct} sentido="costo" />
        <Pct k="Labor" valor={a.laborPct} monto={laborMonto} previo={b.laborPct} sentido="costo" />
        <Pct k="Resultado económico" valor={a.eerrPct} monto={a.eerr} previo={b.eerrPct} sentido="resultado" oro />
        <Pct k="Resultado final" valor={a.rfPct} monto={a.rf} previo={b.rfPct} sentido="resultado" />
      </div>
    </Marco>
  )
}

// ---------------------------------------------------------------------------
// Indicadores por local (grupo)

function IndLocales({ informe, m }) {
  const g = informe.grupo?.meses?.[informe.mes]?.indicadores || {}
  const locales = informe.locales
  const config = informe.indicadoresConfig || {}
  const valorMano = (local, clave) =>
    (informe.valores || []).find((v) => v.local === local && v.mes === informe.mes && v.dato === `ind:${clave}`)?.valor
  const chicos = locales.length > 4
  const cols = chicos ? Math.min(locales.length, 6) : 4

  const filasExtra = (l, act) => {
    const propios = config[l.local] || []
    if (propios.length) {
      return propios.map((ind) => {
        const v = valorMano(l.local, ind.clave)
        const ok = esNum(v)
        return {
          k: ind.clave, nombre: ind.nombre,
          valor: ok ? (ind.formato === 'pesos' ? fmtPesosIm(v) : fmtNumIm(v)) : null,
        }
      })
    }
    // Sin indicadores propios: los cubiertos y el promedio, si hay.
    const a = act?.indicadores || {}
    const out = []
    if (esNum(a.pax)) out.push({ k: 'pax', nombre: 'Cubiertos', valor: fmtNumIm(a.pax) })
    if (esNum(a.promPax)) out.push({ k: 'prom', nombre: 'Promedio por pax', valor: fmtPesosIm(a.promPax) })
    return out
  }

  return (
    <Marco m={m} informe={informe} arriba={56} tam={34} compacto
      ceja={`${nombreCliente(informe)} · Principales indicadores · ${mesEnPalabrasIm(informe.mes)}`}
      titulo="Cada local con sus propios indicadores">
      <div className="im-il-franja">
        <div className="im-card im-card-oro"><div className="im-k">Venta del grupo</div><b>{fmtPesosIm(g.venta)}</b></div>
        <div className="im-card"><div className="im-k">CMV</div><b>{fmtPctIm(g.cmvPct)}</b></div>
        <div className="im-card"><div className="im-k">Labor</div><b>{fmtPctIm(g.laborPct)}</b></div>
        <div className="im-card"><div className="im-k">Res. económico</div><b className={claseTono(tonoIm(g.eerrPct))}>{fmtPctIm(g.eerrPct)}</b></div>
        <div className="im-card"><div className="im-k">Res. final</div><b className={claseTono(tonoIm(g.rfPct))}>{fmtPctIm(g.rfPct)}</b></div>
      </div>
      <div className={`im-il-cards${chicos ? ' im-il-chicos' : ''}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {locales.map((l) => {
          const act = l.meses?.[informe.mes]
          const a = act?.indicadores || {}
          const extra = filasExtra(l, act)
          return (
            <div className="im-card im-il-card" key={l.local}>
              <div className="im-il-nm">{l.nombre}</div>
              {act ? (
                <>
                  <div className="im-k">Venta</div>
                  <div className="im-il-vt">{esNum(a.venta) ? fmtNumIm(a.venta) : '—'}</div>
                  <div className="im-il-extra">
                    {extra.map((x) => (
                      <div className="im-il-x" key={x.k}>
                        <span>{x.nombre}</span>
                        {x.valor != null ? <span>{x.valor}</span> : <span className="im-il-falta">Falta cargar</span>}
                      </div>
                    ))}
                  </div>
                  <div className="im-il-tri">
                    <div><small>CMV</small><b className={esNum(a.cmvPct) ? undefined : 'im-nulo'}>{fmtPctIm(a.cmvPct)}</b></div>
                    <div><small>Labor</small><b className={esNum(a.laborPct) ? undefined : 'im-nulo'}>{fmtPctIm(a.laborPct)}</b></div>
                    <div>
                      <small>EERR</small>
                      {esNum(a.eerrPct)
                        ? <b className={claseTono(tonoIm(a.eerrPct))}>{fmtPctIm(a.eerrPct)}</b>
                        : esNum(a.eerr)
                          // sin venta no hay %, pero el resultado en pesos sí es un dato
                          ? <b className={`im-chico ${claseTono(tonoIm(a.eerr)) || ''}`}>{fmtPesosIm(a.eerr)}</b>
                          : <b className="im-nulo">—</b>}
                    </div>
                  </div>
                </>
              ) : (
                <div className="im-il-vacio">Sin datos en el mes.</div>
              )}
            </div>
          )
        })}
      </div>
    </Marco>
  )
}

// ---------------------------------------------------------------------------
// Cash flow

function CashFlow({ informe, m }) {
  const c = cashflowDe(informe)
  const ceja = ['Cash flow',
    c.elaborado ? `elaborado el ${c.elaborado}` : null,
    c.proyectado ? `proyectado al ${c.proyectado}` : null].filter(Boolean).join(' · ')
  const claseLista = (n) => (n > 14 ? 'im-cf-mini' : n > 8 ? 'im-cf-chico' : '')
  const ok = esNum(c.resultado) && c.resultado >= 0
  const maximo = Math.max(c.disponible.total ?? 0, c.pagar.total ?? 0)
  const ancho = (v) => (esNum(v) && maximo > 0 ? `${Math.max(0, Math.min(100, (v / maximo) * 100))}%` : '0%')
  const hayMp = esNum(c.mpLiquidar)
  return (
    <Marco m={m} informe={informe} arriba={72} tam={40} ceja={ceja} titulo="Lo que hay contra lo que hay que pagar">
      <div className="im-cf">
        <div className={`im-card im-cf-card ${claseLista(c.disponible.lineas.length)}`}>
          <div className="im-k" style={{ color: 'var(--im-teal)' }}>Disponibilidades</div>
          <div className="im-cf-total">{fmtPesosIm(c.disponible.total)}</div>
          {c.disponible.lineas.length
            ? c.disponible.lineas.map((x) => <div className="im-cf-r" key={x.id}><span>{x.concepto}</span><span>{fmtNumIm(x.monto)}</span></div>)
            : <div className="im-cf-vacio">Sin disponibilidades cargadas.</div>}
        </div>
        <div className={`im-card im-cf-card ${claseLista(c.pagar.lineas.length) || 'im-cf-chico'}`}>
          <div className="im-k" style={{ color: 'var(--im-rojo)' }}>Pagos a realizar</div>
          <div className="im-cf-total">{fmtPesosIm(c.pagar.total)}</div>
          {c.pagar.lineas.length
            ? c.pagar.lineas.map((x) => <div className="im-cf-r" key={x.id}><span>{x.concepto}</span><span>{fmtNumIm(x.monto)}</span></div>)
            : <div className="im-cf-vacio">Sin pagos cargados.</div>}
        </div>
        <div className="im-cf-col">
          <div className={`im-card im-cf-card im-cf-res${ok ? ' im-cf-res-ok' : ''}`}>
            <div className="im-k" style={{ color: ok ? 'var(--im-verde)' : 'var(--im-rojo)' }}>Resultado proyectado</div>
            <div className={`im-cf-res-v ${esNum(c.resultado) ? (ok ? 'im-pos' : 'im-neg') : 'im-nulo'}`}>{fmtPesosIm(c.resultado)}</div>
            {esNum(c.resultado) && (
              <>
                <div className="im-cf-barras">
                  <i style={{ background: 'var(--im-teal)', width: ancho(c.disponible.total) }} />
                  <i style={{ background: 'var(--im-rojo)', width: ancho(c.pagar.total) }} />
                </div>
                <div className="im-cf-cob">
                  {esNum(c.cobertura) ? `Lo disponible cubre el ${fmtNumIm(c.cobertura, { dec: 1 })}% de los pagos` : ''}
                </div>
              </>
            )}
          </div>
          {hayMp && (
            <div className="im-card im-card-oro im-cf-card">
              <div className="im-k">Mercado Pago a liquidar</div>
              <div className="im-cf-total" style={{ marginBottom: 0 }}>{fmtPesosIm(c.mpLiquidar)}</div>
            </div>
          )}
        </div>
      </div>
    </Marco>
  )
}

// ---------------------------------------------------------------------------
// Deuda corriente

function Deuda({ informe, m }) {
  const d = deudaDe(informe)
  const periodo = d.ventaPeriodoCargada ? 'la venta del período' : `la venta de ${nombreMesIm(informe.mes).toLowerCase()}`
  const ceja = d.fecha ? `Deuda corriente · al ${d.fecha}` : 'Deuda corriente'
  const ancho = esNum(d.pct) ? `${Math.max(0, Math.min(100, d.pct))}%` : '0%'
  return (
    <Marco m={m} informe={informe} ceja={ceja} titulo="Cuánto se debe hoy">
      <div className="im-deuda">
        <div>
          <div className="im-deuda-k">Total deuda</div>
          <div className="im-deuda-v">{fmtPesosIm(d.total)}</div>
          <div className="im-deuda-txt">
            {esNum(d.pct) && esNum(d.ventaPeriodo)
              ? <>Equivale al <b>{fmtPctIm(d.pct)}</b> de {periodo}<br />({fmtPesosIm(d.ventaPeriodo)})</>
              : 'Falta la venta del período para comparar la deuda.'}
          </div>
        </div>
        <div className="im-card im-deuda-card">
          <div className="im-deuda-pct">{fmtPctIm(d.pct)}</div>
          <div className="im-deuda-pista"><i style={{ width: ancho }} /></div>
          <div className="im-deuda-leyenda"><span>Deuda</span><span>Venta del período = 100%</span></div>
        </div>
      </div>
    </Marco>
  )
}

// ---------------------------------------------------------------------------
// Resumen ejecutivo de resultados (una hoja por local)

const GRUPOS_RESUMEN = [
  { titulo: 'Ventas', claves: ['venta', 'dias', 'pax', 'prom_pax'], col: 0 },
  { titulo: 'Costo de mercadería vendida', claves: ['cmv', 'cmv_alimentos', 'cmv_bebidas', 'cmv_movstock'], col: 0 },
  { titulo: 'Gastos y egresos', claves: null, col: 1 }, // el resto
  { titulo: 'Resultados', claves: ['eerr', 'rf'], col: 1 },
]

// La frase de cada renglón: sale de los números; el comentario escrito a mano va al final.
function FraseResumen({ r, ant }) {
  const dif = r.diferencia
  const tono = claseTono(tonoIm(dif, r.sentido))
  const V = ({ children }) => <span className={`im-res-v ${tono || ''}`}>{children}</span>
  const abs = esNum(dif) ? Math.abs(dif) : null
  const conAnt = ant ? ` respecto a ${ant}` : ''
  let cuerpo
  const pts = esNum(r.diferenciaPts) && r.diferenciaPts !== 0 ? ` (${fmtPtsIm(Math.abs(r.diferenciaPts))})` : ''
  if (r.actual == null) {
    cuerpo = <span className="im-nulo">Sin datos en el mes.</span>
  } else if (r.clave === 'eerr' || r.clave === 'rf') {
    cuerpo = (
      <>
        Queda en <span className="im-res-v">{fmtPesosIm(r.actual)}{esNum(r.pctActual) ? ` (${fmtPctIm(r.pctActual)})` : ''}</span>.
        {esNum(dif) && dif !== 0 && <> {dif > 0 ? 'Mejoró' : 'Empeoró'} <V>{fmtPesosIm(abs)}</V>{conAnt}.</>}
      </>
    )
  } else if (!esNum(dif)) {
    cuerpo = <>En el mes: <span className="im-res-v">{r.formato === 'numero' ? fmtNumIm(r.actual) : fmtPesosIm(r.actual)}</span>{esNum(r.pctActual) ? ` (${fmtPctIm(r.pctActual)} de la venta)` : ''}.</>
  } else if (dif === 0) {
    cuerpo = <>Sin cambios{conAnt}.</>
  } else if (r.clave === 'dias') {
    cuerpo = <><V>{fmtNumIm(abs)}</V> {abs === 1 ? 'día' : 'días'} {dif > 0 ? 'más' : 'menos'} de operación{conAnt}.</>
  } else if (r.clave === 'pax') {
    cuerpo = <>{dif > 0 ? 'Aumentó' : 'Disminuyó'} <V>{fmtNumIm(abs)}</V> cubiertos: {fmtNumIm(r.actual)} en el mes.</>
  } else if (r.clave === 'prom_pax') {
    cuerpo = <>El promedio por cubierto {dif > 0 ? 'subió' : 'bajó'} a <V>{fmtPesosIm(r.actual)}</V> ({fmtPesosIm(abs)} {dif > 0 ? 'más' : 'menos'}).</>
  } else {
    cuerpo = <>{dif > 0 ? 'Aumento' : 'Disminución'} nominal de <V>{fmtNumIm(abs)}{pts}</V>{conAnt}.</>
  }
  return (
    <span>
      {cuerpo}
      {r.comentario && <> <span className="im-res-com">{r.comentario}</span></>}
    </span>
  )
}

function Resumen({ informe, m, pagina }) {
  const l = localDe(informe, pagina)
  if (!l) return null
  const filas = resumenDe(informe, l.local)
  const ant = l.mesAnterior?.mes ? nombreMesIm(l.mesAnterior.mes).toLowerCase() : null
  const porClave = Object.fromEntries(filas.map((r) => [r.clave, r]))
  const usadas = new Set(GRUPOS_RESUMEN.flatMap((g) => g.claves || []))
  const grupos = GRUPOS_RESUMEN.map((g) => ({
    ...g,
    filas: g.claves ? g.claves.map((c) => porClave[c]).filter(Boolean) : filas.filter((r) => !usadas.has(r.clave)),
  })).filter((g) => g.filas.length)
  const col = (n) => grupos.filter((g) => g.col === n)
  const filasDerecha = col(1).reduce((t, g) => t + g.filas.length, 0)
  const eerr = porClave.eerr
  const rf = porClave.rf
  const Tarjeta = ({ r, k, oro }) => r && (
    <div className={`im-card im-res-tarjeta${oro ? ' im-card-oro' : ''}`}>
      <div className="im-k">{k}</div>
      <b>{fmtNumIm(r.actual)}{esNum(r.pctActual) && <> <small className={claseTono(tonoIm(r.pctActual))}>{fmtPctIm(r.pctActual)}</small></>}</b>
    </div>
  )
  return (
    <Marco m={m} informe={informe} arriba={54} tam={34} compacto
      ceja={cejaLocal(informe, l, `Resumen ejecutivo de resultados · ${nombreMesIm(informe.mes).toLowerCase()}${ant ? ` vs ${ant}` : ''}`)}
      titulo="Qué cambió en el mes"
      derecha={<div className="im-res-tarjetas"><Tarjeta r={eerr} k="Resultado económico" oro /><Tarjeta r={rf} k="Resultado final" /></div>}>
      <div className={`im-res-cols${filasDerecha > 11 ? ' im-res-chico' : ''}`}>
        {[0, 1].map((n) => (
          <div className="im-res-col" key={n}>
            {col(n).map((g) => (
              <div key={g.titulo}>
                <div className="im-res-k">{g.titulo}</div>
                {g.filas.map((r) => (
                  <div className="im-res-l" key={r.clave}><b>{r.titulo}</b><FraseResumen r={r} ant={ant} /></div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Marco>
  )
}

// ---------------------------------------------------------------------------
// Mapa de hojas y contenedores

// clave de hoja (HOJAS_DEFECTO) → componente. La Task 7 suma el resto de las claves acá.
export const HOJAS_IM_COMPONENTES = {
  portada: Portada,
  indice: Indice,
  indicadores: Indicadores,
  ind_locales: IndLocales,
  cashflow: CashFlow,
  deuda: Deuda,
  resumen: Resumen,
  contraportada: Contraportada,
}

// Una hoja según pagina.clave. `paginas` (opcional) es la lista completa, para el índice;
// si no viene se calcula con paginasDe(informe).
export function HojaIm({ pagina, informe, numero, total, borrador = false, paginas }) {
  const Comp = HOJAS_IM_COMPONENTES[pagina.clave]
  if (!Comp) return null
  const lista = paginas || paginasDe(informe)
  const n = numero ?? lista.findIndex((p) => p.id === pagina.id) + 1
  const obs = informe.observaciones?.[pagina.id]?.texto || null
  return <Comp pagina={pagina} informe={informe} m={{ numero: n, total: total ?? lista.length, borrador, obs, paginas: lista }} />
}

// Todas las hojas en orden. Para imprimir, pasar `imprimir`: el contenedor queda oculto
// en pantalla y se muestra solo con body.imprimiendo-im (ver styles/informe-mensual.css).
export function MazoIm({ informe, paginas, borrador = false, imprimir = false }) {
  const lista = paginas || paginasDe(informe)
  return (
    <div className={`im-mazo${imprimir ? ' im-print' : ''}`}>
      {lista.map((p, i) => (
        <HojaIm key={p.id} pagina={p} informe={informe} numero={i + 1} total={lista.length} borrador={borrador} paginas={lista} />
      ))}
    </div>
  )
}

export default MazoIm
