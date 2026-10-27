// Hojas del Informe mensual (lo que se imprime y se entrega al cliente).
// Entrada: el Informe de lib/informeMensual.js (armarInformeMensual) y las páginas de paginasDe.
// Regla de oro: solo datos reales; un null se muestra "—", nunca 0 (formatos en lib/formatosIm.js).
// Cada hoja es un div.im-hoja de 1456×819 px. Todas las claves de HOJAS_DEFECTO están en el mapa HOJAS_IM_COMPONENTES.
import { useEffect, useState } from 'react'
import { recortarLogo } from '../../lib/recorteLogo.js'
import { EGRESOS_RESUMEN } from '../../lib/informe.js'
import { aperturaDe, cashflowDe, cmvDe, deudaDe, detalleDe, FILAS_POR_HOJA, paginasDe, pct, resumenDe } from '../../lib/informeMensual.js'
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

function Marco({ ceja, titulo, derecha, children, m, informe, tam = 46, arriba = 96, lados = 97, compacto = false, clase = '', pie = true, notaPie }) {
  const obs = m.obs
  return (
    <div className={`im-hoja ${clase}${obs ? ' im-con-obs' : ''}`} style={{ padding: `${arriba}px ${lados}px 0` }}>
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
// Hojas del P&L: histórico de ventas, P&L acumulado, P&L histórico, consolidado del grupo,
// CMV, detalle de gastos y apertura por rubro.

const mes3 = (mes) => nombreMesIm(mes).slice(0, 3)
const sumaNulos = (xs) => {
  const c = xs.filter(esNum)
  return c.length ? c.reduce((a, b) => a + b, 0) : null
}
const signoClase = (v) => (esNum(v) && v > 0 ? 'pos' : esNum(v) && v < 0 ? 'neg' : '')
const conDatos = (cols, get) => cols.some((c) => c && esNum(get(c)) && get(c) !== 0)
// millones con un decimal; null → "—"
const millones = (v) => (esNum(v) ? fmtNumIm(v / 1e6, { dec: 1 }) : '—')

const CMV_FILAS = [['alimentos', 'Alimentos'], ['bebidas', 'Bebidas'], ['movstock', 'Mov. de stock']]

// Una columna del P&L (un mes de un local o del grupo) con lo que las tablas necesitan.
function colDe(x, mes) {
  if (!x) return null
  const t = (k) => x.totales?.[k]?.total ?? null
  const b = x.bases || {}
  const canales = new Map()
  for (const c of x.canales || []) {
    if (esNum(c.total) && c.total !== 0) canales.set(c.canal, (canales.get(c.canal) || 0) + c.total)
  }
  return {
    mes: mes || x.mes, venta: b.venta ?? null, canales, dias: b.dias ?? null, pax: b.pax ?? null,
    parDias: b.parDias || null, parPax: b.parPax || null,
    cmv: Object.fromEntries(CMV_FILAS.map(([k]) => [k, x.valores?.cmv?.[k] ?? null])),
    cmvTotal: t('cmv'), bruto: t('resultadoBruto'),
    egresos: Object.fromEntries(EGRESOS_RESUMEN.map(([k]) => [k, x.valores?.egresos?.[k] ?? null])),
    egresosTotal: t('egresos'), eco: t('resultadoEconomico'),
    pasivo: t('pasivo'), dividendos: t('dividendos'), final: t('resultadoFinal'),
  }
}

// Suma de columnas (el acumulado): lo que falta no suma; sin ninguna columna con datos, null.
function sumarCols(cols, mes = 'total') {
  const con = cols.filter(Boolean)
  if (!con.length) return null
  const S = (f) => sumaNulos(con.map(f))
  const canales = new Map()
  for (const c of con) for (const [k, v] of c.canales) canales.set(k, (canales.get(k) || 0) + v)
  const par = (k) => {
    const ps = con.map((c) => c[k]).filter(Boolean)
    return ps.length ? { num: ps.reduce((a, p) => a + p.num, 0), den: ps.reduce((a, p) => a + p.den, 0) } : null
  }
  return {
    mes, venta: S((c) => c.venta), canales, dias: S((c) => c.dias), pax: S((c) => c.pax), parDias: par('parDias'), parPax: par('parPax'),
    cmv: Object.fromEntries(CMV_FILAS.map(([k]) => [k, S((c) => c.cmv[k])])),
    cmvTotal: S((c) => c.cmvTotal), bruto: S((c) => c.bruto),
    egresos: Object.fromEntries(EGRESOS_RESUMEN.map(([k]) => [k, S((c) => c.egresos[k])])),
    egresosTotal: S((c) => c.egresosTotal), eco: S((c) => c.eco),
    pasivo: S((c) => c.pasivo), dividendos: S((c) => c.dividendos), final: S((c) => c.final),
  }
}

const promDe = (par) => (par && par.den > 0 ? par.num / par.den : null)

// ---------------------------------------------------------------------------
// Histórico de ventas (una hoja por local): columnas del año anterior y del actual

function Historico({ informe, m, pagina }) {
  const l = localDe(informe, pagina)
  if (!l) return null
  const h = l.rv?.historico || []
  const anio = Number(String(informe.mes).slice(0, 4))
  const ceja = cejaLocal(informe, l, `Histórico de ventas · ${nombreMesIm(`${anio}-01`).toLowerCase()} – ${nombreMesIm(informe.mes).toLowerCase()} · millones de $`)
  const leyenda = (
    <div className="im-leyenda">
      <span><i style={{ background: '#5b6b7d' }} />{anio - 1}</span>
      <span><i style={{ background: '#c9b086' }} />{anio}</span>
    </div>
  )
  const hayDatos = h.some((x) => esNum(x.venta?.valor) || esNum(x.anterior))
  if (!hayDatos) {
    return (
      <Marco m={m} informe={informe} tam={40} arriba={84} ceja={ceja} titulo="Venta por mes comparada con el año anterior" derecha={leyenda}>
        <div className="im-vacio-hoja">Todavía no hay ventas cargadas para {l.nombre}.</div>
      </Marco>
    )
  }
  const X0 = 150, ANCHO = 1262, BASE = 262, ALTO_MAX = 200
  const n = h.length
  const paso = (ANCHO - X0) / n
  const bw = Math.min(40, paso * 0.32)
  const maxV = Math.max(0, ...h.flatMap((x) => [x.venta?.valor, x.anterior]).filter(esNum))
  const alto = (v) => (esNum(v) && maxV > 0 ? Math.max(0, (v / maxV) * ALTO_MAX) : 0)
  const pctUno = (v) => (esNum(v) ? `${fmtNumIm(v, { dec: 1, signo: true })}%` : '—')
  const color = (v) => (v > 0 ? '#5fcb92' : v < 0 ? '#f07b7b' : '#a6a9ab')
  const pw = Math.min(74, paso - 10)
  const Barra = ({ x, v, previo }) => {
    const ok = esNum(v) && v > 0
    const a = alto(v)
    return (
      <>
        {ok && <rect x={x} y={BASE - a} width={bw} height={a} rx="4" fill={previo ? '#5b6b7d' : '#c9b086'} />}
        <text x={x + bw / 2} y={ok ? BASE - a - 9 : BASE - 9} textAnchor="middle" fontSize="15" fontWeight={previo ? 500 : 700}
          fill={ok ? (previo ? '#a6a9ab' : '#f0ede8') : '#5b6570'}>{ok ? millones(v) : '—'}</text>
      </>
    )
  }
  const cx = (i) => X0 + paso * (i + 0.5)
  return (
    <Marco m={m} informe={informe} tam={40} arriba={84} ceja={ceja} titulo="Venta por mes comparada con el año anterior" derecha={leyenda}>
      <svg width={ANCHO} height="480" viewBox={`0 0 ${ANCHO} 480`} role="img" className="im-hist-svg"
        aria-label={`Columnas de venta mensual de ${l.nombre} en ${anio - 1} y ${anio}, con cubiertos, promedio por cubierto y variaciones por mes`}>
        <line x1={X0} x2={ANCHO} y1={BASE} y2={BASE} stroke="#474f59" strokeWidth="2" />
        {h.map((x, i) => (
          <g key={x.mes}>
            <Barra x={cx(i) - bw - 4} v={x.anterior} previo />
            <Barra x={cx(i) + 4} v={x.venta?.valor} />
            <text x={cx(i)} y="292" textAnchor="middle" fontSize="19" fill="#a6a9ab">{mes3(x.mes)}</text>
          </g>
        ))}
        <line x1="0" x2={ANCHO} y1="314" y2="314" stroke="rgba(255,255,255,.08)" />
        <text x="0" y="345" fontSize="15" fontWeight="700" letterSpacing="1" fill="#7a8087">{`VS ${anio - 1}`}</text>
        {h.map((x, i) => {
          const v = x.varAnual
          return esNum(v) ? (
            <g key={x.mes} fontSize="16" fontWeight="700" textAnchor="middle" fill={color(v)}>
              <rect x={cx(i) - pw / 2} y="325" width={pw} height="28" rx="14" fill={v > 0 ? 'rgba(95,203,146,.15)' : v < 0 ? 'rgba(240,123,123,.15)' : 'rgba(166,169,171,.15)'} />
              <text x={cx(i)} y="345">{pctUno(v)}</text>
            </g>
          ) : <text key={x.mes} x={cx(i)} y="345" textAnchor="middle" fontSize="16" fill="#5b6570">—</text>
        })}
        <text x="0" y="388" fontSize="15" fontWeight="700" letterSpacing="1" fill="#7a8087">VS MES ANTERIOR</text>
        {h.map((x, i) => (
          <text key={x.mes} x={cx(i)} y="388" textAnchor="middle" fontSize="17" fontWeight="700" fill={esNum(x.varPct) ? color(x.varPct) : '#5b6570'}>{pctUno(x.varPct)}</text>
        ))}
        <line x1="0" x2={ANCHO} y1="404" y2="404" stroke="rgba(255,255,255,.08)" />
        <text x="0" y="432" fontSize="15" fontWeight="700" letterSpacing="1" fill="#7a8087">CUBIERTOS</text>
        {h.map((x, i) => (
          <text key={x.mes} x={cx(i)} y="432" textAnchor="middle" fontSize="18" fontWeight="600" fill={esNum(x.cubiertos?.valor) ? '#f0ede8' : '#5b6570'}>{fmtNumIm(x.cubiertos?.valor)}</text>
        ))}
        <text x="0" y="468" fontSize="15" fontWeight="700" letterSpacing="1" fill="#7a8087">PROM. CUBIERTO</text>
        {h.map((x, i) => (
          <text key={x.mes} x={cx(i)} y="468" textAnchor="middle" fontSize="18" fontWeight="500" fill={esNum(x.promCubierto) ? '#a6a9ab' : '#5b6570'}>{fmtNumIm(x.promCubierto)}</text>
        ))}
      </svg>
    </Marco>
  )
}

// ---------------------------------------------------------------------------
// P&L acumulado: meses del año + total. Parte 1: ventas, operación y CMV. Parte 2: egresos y resultado.

// Celda de un monto con su % sobre la venta de la columna. `cero`: mostrar 0 (totales y resultados);
// en los renglones sueltos un 0 es "—".
function CeldaPyl({ valor, venta, cur, tono, cero, pctOn }) {
  const ok = esNum(valor) && (cero || valor !== 0)
  const p = ok && pctOn ? pct(valor, venta) : null
  const cls = [cur ? 'cur' : '', ok ? (tono ? signoClase(valor) : '') : 'n'].filter(Boolean).join(' ')
  return <td className={cls}>{ok ? fmtNumIm(valor) : '—'}{p != null && <small>{fmtPctIm(p)}</small>}</td>
}

// Renglones de una tabla de P&L. t: 'sec' | 'fila' | 'var' | 'op'.
function specsVentasOperacion(cols, total) {
  const todas = [...cols, total]
  const nombres = [...(total?.canales.keys() || [])].sort((a, b) => total.canales.get(b) - total.canales.get(a))
  return [
    { t: 'sec', txt: 'Ventas por canal' },
    ...nombres.map((c) => ({ t: 'fila', label: c, get: (x) => x.canales.get(c) ?? null, pctOn: true })),
    { t: 'fila', label: 'Venta total', get: (x) => x.venta, tipo: 'tot', cero: true },
    { t: 'var', label: 'vs mes anterior' },
    { t: 'sec', txt: 'Operación' },
    { t: 'op', label: 'Días · prom. por día', cant: (x) => x.dias, prom: (x) => promDe(x.parDias) },
    { t: 'op', label: 'Pax · prom. salón', cant: (x) => x.pax, prom: (x) => promDe(x.parPax) },
    { t: 'sec', txt: 'Costo de mercadería vendida' },
    ...CMV_FILAS.map(([k, label]) => ({ t: 'fila', label, get: (x) => x.cmv[k], pctOn: true })),
    { t: 'fila', label: 'CMV total', get: (x) => x.cmvTotal, tipo: 'tot', cero: true, pctOn: true },
    { t: 'fila', label: 'Resultado bruto', get: (x) => x.bruto, tipo: 'tot', cero: true, pctOn: true, oro: true },
  ].filter((s) => s.t !== 'fila' || s.tipo || conDatos(todas, s.get))
}

// Egresos, resultado económico y lo que queda debajo de la línea.
function specsEgresos(todas) {
  return [
    { t: 'fila', label: 'Resultado bruto', get: (x) => x.bruto, tipo: 'tot', cero: true },
    { t: 'sec', txt: 'Egresos' },
    ...EGRESOS_RESUMEN.map(([k, label]) => ({ t: 'fila', label, get: (x) => x.egresos[k], pctOn: true })),
    { t: 'fila', label: 'Total egresos', get: (x) => x.egresosTotal, tipo: 'tot', cero: true, pctOn: true },
    { t: 'fila', label: 'Resultado económico', get: (x) => x.eco, tipo: 'res', cero: true, pctOn: true, oro: true },
    { t: 'sec', txt: 'Debajo de la línea' },
    { t: 'fila', label: 'Otros pasivos', get: (x) => x.pasivo, pctOn: true },
    { t: 'fila', label: 'Dividendos', get: (x) => x.dividendos, pctOn: true },
    { t: 'fila', label: 'Resultado final', get: (x) => x.final, tipo: 'res', cero: true, pctOn: true, oro: true },
  ].filter((s) => s.t !== 'fila' || s.tipo || conDatos(todas, s.get))
}

function TablaPyl({ specs, cols, total, informe, inline, apilada, etiquetaTotal, variaciones }) {
  const mesesIm = informe.meses
  // Con más meses la letra baja para que entren las columnas (con 10 a 12 meses, más todavía).
  const tam = mesesIm.length > 9 ? ` im-t-ancha` : mesesIm.length > 6 ? ` im-t-med` : ''
  const esActual = (j) => j < mesesIm.length && mesesIm[j] === informe.mes
  return (
    <table className={`im-t${inline ? ' im-t-in' : ''}${apilada ? ' im-t-apilada' : ''}${tam}`}>
      <thead>
        <tr>
          <th className="im-t-rot">$</th>
          {mesesIm.map((mes) => <th key={mes} className={mes === informe.mes ? 'cur' : undefined}>{mes3(mes)}</th>)}
          <th>{etiquetaTotal}</th>
        </tr>
      </thead>
      <tbody>
        {specs.map((s, i) => {
          if (s.t === 'sec') return <tr className="sec" key={i}><td colSpan={mesesIm.length + 2}>{s.txt}</td></tr>
          if (s.t === 'var') {
            return (
              <tr key={i}>
                <td>{s.label}</td>
                {mesesIm.map((mes, j) => {
                  const v = variaciones[j]
                  return <td key={mes} className={`${esActual(j) ? 'cur ' : ''}${esNum(v) ? signoClase(v) : 'n'}`}>{esNum(v) ? fmtPctIm(v, { signo: true }) : '—'}</td>
                })}
                <td className="n">—</td>
              </tr>
            )
          }
          if (s.t === 'op') {
            const texto = (x) => {
              const c = x ? s.cant(x) : null
              if (!esNum(c)) return null
              const p = s.prom(x)
              return `${fmtNumIm(c)} · ${esNum(p) ? fmtNumIm(p) : '—'}`
            }
            return (
              <tr key={i}>
                <td>{s.label}</td>
                {[...cols, total].map((x, j) => {
                  const t = texto(x)
                  return <td key={j} className={`${esActual(j) ? 'cur ' : ''}${t ? '' : 'n'}`}>{t || '—'}</td>
                })}
              </tr>
            )
          }
          return (
            <tr key={i} className={s.tipo || undefined}>
              <td style={s.oro ? { color: '#c9b086' } : undefined}>{s.label}</td>
              {[...cols, total].map((x, j) => (
                <CeldaPyl key={j} valor={x ? s.get(x) : null} venta={x?.venta} cur={esActual(j)}
                  tono={s.tipo === 'res'} cero={!!s.cero} pctOn={!!s.pctOn} />
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function PylAcumulado({ informe, m, pagina }) {
  const esGrupo = !!pagina.grupo
  const l = esGrupo ? null : localDe(informe, pagina)
  if (!esGrupo && !l) return null
  const parte = pagina.parte || 1
  const anio = String(informe.mes).slice(0, 4)
  const fuente = esGrupo ? informe.grupo : l
  const cols = informe.meses.map((mes) => colDe(fuente?.meses?.[mes], mes))
  const total = sumarCols(cols)
  const previo = colDe(fuente?.mesAnterior)
  // Variación de la venta contra el mes de antes; para el primer mes, el mes anterior del informe si es el que le toca.
  const variaciones = cols.map((c, i) => {
    const ant = i > 0 ? cols[i - 1] : previo && previo.mes < informe.meses[0] ? previo : null
    return c && ant && esNum(c.venta) && esNum(ant.venta) ? pct(c.venta - ant.venta, ant.venta) : null
  })
  const txtCeja = `P&L acumulado ${anio} · ${parte} de 2`
  const ceja = esGrupo ? `Grupo · ${txtCeja}` : cejaLocal(informe, l, txtCeja)
  const faltan = fuente?.acumulado?.faltan || []
  const notaPie = faltan.length ? `Total sin ${faltan.map(mes3).join(', ')}: sin datos` : undefined
  const ancha = informe.meses.length > 6
  // El % al lado del monto solo entra con pocos meses; con más, va debajo como en la parte 1.
  const alLado = parte === 2 && informe.meses.length <= 6
  const titulo = parte === 1 ? 'Ventas, operación y costo de mercadería' : 'Egresos y resultado'
  const nota = parte === 1 ? 'Debajo de cada monto: % sobre la venta del mes' : 'Al lado de cada monto: % sobre la venta del mes'
  return (
    <Marco m={m} informe={informe} tam={34} arriba={parte === 1 ? 64 : 58} lados={ancha ? 60 : 97} compacto clase={ancha ? 'im-ancha' : ''} notaPie={notaPie}
      ceja={ceja} titulo={titulo} derecha={<div className="im-nota-cab">{nota}</div>}>
      {total ? (
        <TablaPyl cols={cols} total={total} informe={informe} inline={alLado} apilada={parte === 2 && !alLado} variaciones={variaciones} etiquetaTotal={`Total ${anio}`}
          specs={parte === 1 ? specsVentasOperacion(cols, total) : specsEgresos([...cols, total])} />
      ) : (
        <div className="im-vacio-hoja">Todavía no hay datos de {esGrupo ? 'ningún local' : l.nombre} en {anio}.</div>
      )}
    </Marco>
  )
}

// ---------------------------------------------------------------------------
// P&L histórico: cuánto pesa cada rubro sobre la venta, año anterior contra el actual

function PylHistorico({ informe, m, pagina }) {
  const l = localDe(informe, pagina)
  if (!l) return null
  const anio = Number(String(informe.mes).slice(0, 4))
  const act = sumarCols(informe.meses.map((mes) => colDe(l.meses?.[mes], mes)))
  const ant = sumarCols(Object.entries(l.anioAnterior?.meses || {}).map(([mes, x]) => colDe(x, mes)))
  const ceja = cejaLocal(informe, l, `P&L histórico · ${anio - 1} vs ${anio}`)
  if (!act || !ant) {
    return (
      <Marco m={m} informe={informe} tam={34} arriba={64} compacto ceja={ceja} titulo="Cuánto pesa cada gasto sobre la venta">
        <div className="im-vacio-hoja">{!ant ? `Todavía no hay datos de ${anio - 1} de ${l.nombre} para comparar.` : `Todavía no hay datos de ${anio} de ${l.nombre}.`}</div>
      </Marco>
    )
  }
  const rubros = [
    ...CMV_FILAS.map(([k, label]) => ({ k, label: k === 'alimentos' ? 'CMV alimentos' : k === 'bebidas' ? 'CMV bebidas' : label, get: (x) => x.cmv[k] })),
    ...EGRESOS_RESUMEN.map(([k, label]) => ({ k, label, get: (x) => x.egresos[k] })),
  ].filter((r) => conDatos([act, ant], r.get))
  const n = rubros.length
  const filaAlto = n > 14 ? 24 : 27
  const datos = rubros.map((r) => {
    const a = r.get(act) ?? 0
    const b = r.get(ant) ?? 0
    return { ...r, a, b, pa: pct(a, act.venta), pb: pct(b, ant.venta) }
  })
  const maxPct = Math.max(0, ...datos.flatMap((d) => [d.pa, d.pb]).filter(esNum))
  const eje = Math.max(10, Math.ceil((maxPct * 1.2) / 10) * 10)
  const X0 = 600, ANCHO_P = 520
  const px = (p) => X0 + (p / eje) * ANCHO_P
  const alto = 45 + Math.max(0, n - 1) * filaAlto + 40
  const ticks = Array.from({ length: Math.floor(eje / 10) + 1 }, (_, i) => i * 10)
  const faltan = l.anioAnterior?.faltan || []
  const notaPie = faltan.length ? `${anio - 1}: sin datos en ${faltan.map(mes3).join(', ')}` : undefined
  const tarjeta = (k, a, b, { oro = false, pesos = false } = {}) => (
    <div className={`im-card im-ph-card${oro ? ' im-card-oro' : ''}`}>
      <div className="im-k">{k}</div>
      <div className="im-ph-par">
        <span className={`im-ph-ant ${pesos ? '' : signoClase(b)}`}>{pesos ? `${millones(b)} M` : fmtPctIm(b)}</span>
        <span className="im-ph-flecha">→</span>
        <span className={`im-ph-act ${pesos ? '' : signoClase(a)}`}>{pesos ? `${millones(a)} M` : fmtPctIm(a)}</span>
      </div>
    </div>
  )
  const pctBruto = (x) => pct(x.bruto, x.venta)
  const pctEco = (x) => pct(x.eco, x.venta)
  const pctFin = (x) => pct(x.final, x.venta)
  return (
    <Marco m={m} informe={informe} tam={34} arriba={64} compacto notaPie={notaPie} ceja={ceja} titulo="Cuánto pesa cada gasto sobre la venta"
      derecha={(
        <div className="im-leyenda im-leyenda-ch">
          <span><i className="im-pt-ant" />{anio - 1}</span>
          <span><i className="im-pt-act" />{anio}</span>
          <span className="im-leyenda-tx">verde = pesa menos que en {anio - 1}</span>
        </div>
      )}>
      <svg width="1262" height={alto} viewBox={`0 0 1262 ${alto}`} role="img" className="im-ph-svg"
        aria-label={`Para cada rubro del P&L de ${l.nombre}, el monto de ${anio - 1} y de ${anio} y su porcentaje sobre la venta, con la diferencia en puntos`}>
        <g fontSize="13" fontWeight="700" letterSpacing="1" fill="#7a8087">
          <text x="0" y="12">RUBRO</text>
          <text x="330" y="12" textAnchor="end">{`${anio - 1} $`}</text>
          <text x="520" y="12" textAnchor="end">{`${anio} $`}</text>
          <text x="600" y="12">% SOBRE LA VENTA</text>
          <text x="1262" y="12" textAnchor="end">DIFERENCIA</text>
        </g>
        <g fontSize="12" fill="#5b6570">
          {ticks.map((t) => <text key={t} x={px(t)} y={alto - 2} textAnchor="middle">{t}%</text>)}
        </g>
        {datos.map((d, i) => {
          const y = 45 + i * filaAlto
          const dif = esNum(d.pa) && esNum(d.pb) ? d.pa - d.pb : null
          const tono = dif == null || Math.abs(dif) < 0.005 ? '#7a8087' : dif < 0 ? '#5fcb92' : '#f07b7b'
          const xa = esNum(d.pa) ? px(d.pa) : null
          const xb = esNum(d.pb) ? px(d.pb) : null
          const xMax = Math.max(xa ?? 0, xb ?? 0)
          const derecha = xMax > 1050
          return (
            <g key={d.k}>
              <text x="0" y={y} fontSize="16" fontWeight="600" fill="#dcd7ce">{d.label}</text>
              <text x="330" y={y} textAnchor="end" fontSize="15" fill={d.b ? '#a6a9ab' : '#5b6570'}>{d.b ? fmtNumIm(d.b) : '—'}</text>
              <text x="520" y={y} textAnchor="end" fontSize="15" fontWeight="600" fill={d.a ? '#f0ede8' : '#5b6570'}>{d.a ? fmtNumIm(d.a) : '—'}</text>
              <line x1={X0} x2={X0 + ANCHO_P} y1={y - 5} y2={y - 5} stroke="#2a3644" strokeWidth="2" />
              {xa != null && xb != null && Math.abs(xa - xb) > 0.5 && (
                <line x1={xa} x2={xb} y1={y - 5} y2={y - 5} stroke={tono} strokeWidth="4" opacity=".55" />
              )}
              {xb != null && <circle cx={xb} cy={y - 5} r="7" fill="#5b6b7d" stroke="#19232f" strokeWidth="2" />}
              {xa != null && <circle cx={xa} cy={y - 5} r="8" fill="#c9b086" stroke="#19232f" strokeWidth="2" />}
              {xa != null && (
                <text x={derecha ? Math.min(xa, xb ?? xa) - 14 : xMax + 14} y={y} textAnchor={derecha ? 'end' : 'start'} fontSize="14" fontWeight="700" fill="#c9b086">{fmtPctIm(d.pa)}</text>
              )}
              <text x="1262" y={y} textAnchor="end" fontSize="15" fontWeight="700" fill={tono}>{dif == null ? '—' : fmtPtsIm(dif, { signo: true })}</text>
            </g>
          )
        })}
      </svg>
      <div className="im-ph-cards">
        {tarjeta('Venta', act.venta, ant.venta, { pesos: true })}
        {tarjeta('Resultado bruto', pctBruto(act), pctBruto(ant))}
        {tarjeta('Resultado económico', pctEco(act), pctEco(ant), { oro: true })}
        {tarjeta('Resultado final', pctFin(act), pctFin(ant))}
      </div>
    </Marco>
  )
}

// ---------------------------------------------------------------------------
// Consolidado del grupo: un local por columna y el total del grupo

function Consolidado({ informe, m }) {
  const g = informe.grupo
  if (!g) return null
  const cols = informe.locales.map((l) => ({ nombre: l.nombre, col: colDe(g.porLocalMes?.[l.local], informe.mes), previa: colDe(l.mesAnterior) }))
  const grupo = { nombre: 'Grupo', col: colDe(g.meses?.[informe.mes], informe.mes), previa: colDe(g.mesAnterior), esGrupo: true }
  const todas = [...cols, grupo]
  const solo = todas.map((x) => x.col)
  const specs = [
    { t: 'fila', label: 'Venta', get: (x) => x.venta, tipo: 'tot', cero: true, pctOn: true },
    { t: 'var', label: 'vs mes anterior' },
    { t: 'sec', txt: 'CMV' },
    ...CMV_FILAS.map(([k, label]) => ({ t: 'fila', label, get: (x) => x.cmv[k], pctOn: true })),
    { t: 'fila', label: 'CMV total', get: (x) => x.cmvTotal, tipo: 'tot', cero: true, pctOn: true },
    { t: 'sec', txt: 'Egresos' },
    ...EGRESOS_RESUMEN.map(([k, label]) => ({ t: 'fila', label, get: (x) => x.egresos[k], pctOn: true })),
    { t: 'fila', label: 'Total egresos', get: (x) => x.egresosTotal, tipo: 'tot', cero: true, pctOn: true },
    { t: 'fila', label: 'Resultado económico', get: (x) => x.eco, tipo: 'res', cero: true, pctOn: true, oro: true },
    { t: 'fila', label: 'Plan de pagos', get: (x) => x.pasivo, pctOn: true },
    { t: 'fila', label: 'Dividendos pagados', get: (x) => x.dividendos, pctOn: true },
    { t: 'fila', label: 'Resultado final', get: (x) => x.final, tipo: 'res', cero: true, pctOn: true, oro: true },
  ].filter((s) => s.t !== 'fila' || s.tipo || conDatos(solo, s.get))
  const variacion = (x) => (x.col && x.previa && esNum(x.col.venta) && esNum(x.previa.venta) ? pct(x.col.venta - x.previa.venta, x.previa.venta) : null)
  const n = todas.length
  return (
    <Marco m={m} informe={informe} tam={34} arriba={46} compacto
      ceja={`${nombreCliente(informe)} · P&L de ${mesEnPalabrasIm(informe.mes).toLowerCase()}`} titulo="Por local y consolidado"
      derecha={<div className="im-nota-cab">% sobre la venta de cada local</div>}>
      <table className={`im-t im-t-cons${n > 6 ? ' im-t-ancha' : ''}`}>
        <thead>
          <tr>
            <th className="im-t-rot im-t-rot-ch">$</th>
            {todas.map((x) => <th key={x.nombre + (x.esGrupo ? '*' : '')} colSpan={2} className={x.esGrupo ? 'cur' : undefined}>{x.nombre}</th>)}
          </tr>
        </thead>
        <tbody>
          {specs.map((s, i) => {
            if (s.t === 'sec') return <tr className="sec" key={i}><td colSpan={n * 2 + 1}>{s.txt}</td></tr>
            if (s.t === 'var') {
              return (
                <tr key={i}>
                  <td>{s.label}</td>
                  {todas.map((x, j) => {
                    const v = variacion(x)
                    return <td key={j} colSpan={2} className={`${x.esGrupo ? 'cur ' : ''}${esNum(v) ? signoClase(v) : 'n'}`}>{esNum(v) ? fmtPctIm(v, { signo: true }) : '—'}</td>
                  })}
                </tr>
              )
            }
            return (
              <tr key={i} className={s.tipo || undefined}>
                <td style={s.oro ? { color: '#c9b086' } : undefined}>{s.label}</td>
                {todas.flatMap((x, j) => {
                  const v = x.col ? s.get(x.col) : null
                  const ok = esNum(v) && (s.cero || v !== 0)
                  const p = ok && s.pctOn ? pct(v, x.col.venta) : null
                  const cur = x.esGrupo ? 'cur ' : ''
                  const tono = ok && s.tipo === 'res' ? signoClase(v) : ''
                  return [
                    <td key={`${j}a`} className={`${cur}${tono}${ok ? '' : ' n'}`.trim()}>{ok ? fmtNumIm(v) : '—'}</td>,
                    <td key={`${j}b`} className={`pc ${cur}`.trim()}>{p != null ? fmtPctIm(p) : ''}</td>,
                  ]
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </Marco>
  )
}

// ---------------------------------------------------------------------------
// CMV del mes (una hoja por local)

// Las categorías de más se juntan en "Otras" para que la hoja no se desborde (con observación entran menos).
function BloqueCmv({ titulo, color, total, cats, max }) {
  const corta = cats.length > max + 1
  const visibles = corta ? cats.slice(0, max) : cats
  const resto = corta ? cats.slice(max) : []
  const restoTotal = resto.reduce((t, c) => t + c.total, 0)
  return (
    <div className={`im-card im-cmv-bloque${cats.length > 7 ? ' im-cmv-chico' : ''}`}>
      <div className="im-cmv-cab"><span>{titulo}</span><span>$</span></div>
      {cats.length === 0 && <div className="im-cmv-vacio">Sin compras en el mes.</div>}
      {visibles.map((c) => (
        <div className="im-cmv-f" key={c.clave}>
          <span>{c.concepto}</span>
          <div className="im-cmv-p"><i style={{ width: `${esNum(c.barra) ? c.barra : 0}%`, background: color }} /></div>
          <span>{fmtNumIm(c.total)}</span>
        </div>
      ))}
      {resto.length > 0 && (
        <div className="im-cmv-f">
          <span>Otras ({resto.length})</span>
          <div className="im-cmv-p" />
          <span>{fmtNumIm(restoTotal)}</span>
        </div>
      )}
      <div className="im-cmv-tot"><span>Total</span><span>{fmtNumIm(total)}</span></div>
    </div>
  )
}

function Cmv({ informe, m, pagina }) {
  const l = localDe(informe, pagina)
  if (!l) return null
  const c = cmvDe(informe, l.local)
  const ant = l.mesAnterior?.mes ? nombreMesIm(l.mesAnterior.mes).toLowerCase() : null
  const sub = (k, nombre) => {
    const s = c.porSub[k]
    return (
      <div className="im-card im-cmv-sub" key={k}>
        <div className="im-k">{nombre}</div>
        <div className="im-cmv-sub-v">{fmtPctIm(s.pct)}</div>
        <div className="im-cmv-sub-d">
          {esNum(s.pts) && ant && s.pts !== 0
            ? <Delta dif={s.pts} sentido="costo" texto={`${fmtPtsIm(Math.abs(s.pts))} vs ${ant}`} />
            : esNum(s.pts) && ant ? <span>= igual que {ant}</span> : <span className="im-nulo">—</span>}
        </div>
      </div>
    )
  }
  return (
    <Marco m={m} informe={informe} tam={34} arriba={60} compacto
      ceja={cejaLocal(informe, l, `Costo de mercadería vendida · ${mesEnPalabrasIm(informe.mes)}`)} titulo="CMV del mes y en qué se fue">
      <div className="im-cmv-top">
        <div className="im-card im-card-oro im-cmv-total">
          <div className="im-k">CMV total</div>
          <div className="im-cmv-total-fila">
            <span className="im-cmv-total-v">{fmtPctIm(c.pct)}</span>
            <span className="im-cmv-total-tx">
              {esNum(c.total) && esNum(c.venta)
                ? <>{fmtPesosIm(c.total)} sobre<br />{fmtPesosIm(c.venta)} de venta</>
                : esNum(c.total) ? <>{fmtPesosIm(c.total)}<br />Falta la venta del mes</> : 'Sin datos en el mes'}
            </span>
          </div>
        </div>
        {sub('alimentos', 'Alimentos')}
        {sub('bebidas', 'Bebidas')}
        {sub('movstock', 'Mov. de stock')}
      </div>
      <div className="im-cmv-cols">
        <BloqueCmv titulo="Alimentos" color="#4fb3bb" total={c.porSub.alimentos.total} cats={c.categorias.alimentos} max={m.obs ? 9 : 12} />
        <BloqueCmv titulo="Bebidas" color="#c9b086" total={c.porSub.bebidas.total} cats={c.categorias.bebidas} max={m.obs ? 9 : 12} />
        <BloqueCmv titulo="Mov. de stock" color="#4fb3bb" total={c.porSub.movstock.total} cats={c.categorias.movstock} max={m.obs ? 9 : 12} />
      </div>
    </Marco>
  )
}

// ---------------------------------------------------------------------------
// Detalle de gastos: mes contra mes anterior, concepto por concepto

// Renglones y títulos de bloque en una lista; con 10 o más, dos columnas.
// Si el corte deja un título solo al final, pasa a la otra columna; si deja un renglón sin su título al principio, se lo repite.
function columnasDetalle(filas, bloques) {
  const titulos = Object.fromEntries(bloques.map((b) => [b.key, b.titulo]))
  const conTitulos = bloques.length > 1
  const unidades = []
  let previo = null
  for (const f of filas) {
    if (conTitulos && f.bloque !== previo && titulos[f.bloque]) unidades.push({ titulo: titulos[f.bloque] })
    unidades.push({ fila: f })
    previo = f.bloque
  }
  if (unidades.length < 10) return [unidades, []]
  const mitad = Math.ceil(unidades.length / 2)
  let izq = unidades.slice(0, mitad)
  let der = unidades.slice(mitad)
  if (izq[izq.length - 1].titulo != null) { der = [izq[izq.length - 1], ...der]; izq = izq.slice(0, -1) }
  if (conTitulos && der[0]?.fila && titulos[der[0].fila.bloque]) der = [{ titulo: titulos[der[0].fila.bloque] }, ...der]
  return [izq, der]
}

function DifDetalle({ dif, sentido = 'costo' }) {
  if (!esNum(dif)) return <td className="n">—</td>
  if (dif === 0) return <td className="n">=</td>
  return <td className={tonoIm(dif, sentido) === 'pos' ? 'dn' : 'up'}>{flechaIm(dif)} {fmtNumIm(Math.abs(dif))}</td>
}

function TablaDetalle({ unidades, nombreAnt, nombreAct, pie }) {
  const pc = (monto, p) => (esNum(monto) ? fmtPctIm(p) : '')
  return (
    <table className="im-t im-t-det">
      <thead><tr><th>Categoría</th><th>{nombreAnt}</th><th>%</th><th>{nombreAct}</th><th>%</th><th>Diferencia</th></tr></thead>
      <tbody>
        {unidades.map((u, i) => (u.titulo != null
          ? <tr className="g" key={`t${i}`}><td colSpan={6}>{u.titulo}</td></tr>
          : (
            <tr key={u.fila.clave}>
              <td>{u.fila.concepto}</td>
              <td className={esNum(u.fila.anterior) ? '' : 'n'}>{fmtNumIm(u.fila.anterior)}</td>
              <td className="pc">{pc(u.fila.anterior, u.fila.pctAnterior)}</td>
              <td className={`cur${esNum(u.fila.actual) ? '' : ' n'}`}>{fmtNumIm(u.fila.actual)}</td>
              <td className="pc cur">{pc(u.fila.actual, u.fila.pctActual)}</td>
              <DifDetalle dif={u.fila.diferencia} />
            </tr>
          )))}
        {pie.map((r) => (
          <tr className="tot" key={r.label}>
            <td style={r.oro ? { color: '#c9b086' } : undefined}>{r.label}</td>
            <td className={esNum(r.v.anterior) ? '' : 'n'}>{fmtNumIm(r.v.anterior)}</td>
            <td className="pc">{pc(r.v.anterior, r.v.pctAnterior)}</td>
            <td className={`cur${esNum(r.v.actual) ? '' : ' n'}`}>{fmtNumIm(r.v.actual)}</td>
            <td className="pc cur">{pc(r.v.actual, r.v.pctActual)}</td>
            <DifDetalle dif={r.v.diferencia} sentido={r.sentido} />
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Detalle({ informe, m, pagina }) {
  const l = localDe(informe, pagina)
  if (!l) return null
  const d = detalleDe(informe, l.local, pagina.seccion)
  const parte = pagina.parte || 1
  const partes = pagina.partes || 1
  const porHoja = FILAS_POR_HOJA.detalle
  const filas = d.filas.slice((parte - 1) * porHoja, parte * porHoja)
  const ultima = parte === partes
  const cmv = d.grupo.key === 'cmv'
  const [izq, der] = columnasDetalle(filas, d.bloques)
  const pie = ultima
    ? [
      { label: `Total ${d.grupo.titulo}`, v: d.totales, sentido: 'costo' },
      ...(d.resultadoBruto ? [{ label: 'Resultado bruto', v: d.resultadoBruto, sentido: 'resultado', oro: true }] : []),
    ]
    : []
  const nombreAnt = nombreMesIm(d.mesAnterior)
  const nombreAct = nombreMesIm(d.mes)
  const ceja = cejaLocal(informe, l, `Detalle de gastos · ${d.grupo.titulo}${partes > 1 ? ` · ${parte} de ${partes}` : ''}`)
  const hayDos = der.length > 0
  return (
    <Marco m={m} informe={informe} tam={34} arriba={52} compacto ceja={ceja}
      titulo={`${nombreAct} contra ${nombreAnt.toLowerCase()}, ${cmv ? 'categoría por categoría' : 'concepto por concepto'}`}
      derecha={<div className="im-nota-cab">Rojo = gastó más que en {nombreAnt.toLowerCase()}{partes > 1 && !ultima ? ' · sigue en la hoja siguiente' : ''}</div>}
      notaPie="% sobre la venta de cada mes">
      <div className={`im-det${hayDos ? ' im-det-dos' : ''}`}>
        <TablaDetalle unidades={izq} pie={hayDos ? [] : pie} nombreAnt={nombreAnt} nombreAct={nombreAct} />
        {hayDos && <TablaDetalle unidades={der} pie={pie} nombreAnt={nombreAnt} nombreAct={nombreAct} />}
      </div>
    </Marco>
  )
}

// ---------------------------------------------------------------------------
// Apertura por rubro: con factura y sin factura, % sobre la venta de cada columna

function Apertura({ informe, m, pagina }) {
  const l = localDe(informe, pagina)
  if (!l) return null
  const a = aperturaDe(informe, l.local, pagina.seccion)
  const parte = pagina.parte || 1
  const partes = pagina.partes || 1
  const porHoja = FILAS_POR_HOJA.apertura
  const filas = a.filas.slice((parte - 1) * porHoja, parte * porHoja)
  const ultima = parte === partes
  const titulos = Object.fromEntries(a.bloques.map((b) => [b.key, b.titulo]))
  // En CMV las categorías van seguidas, sin títulos; en los demás grupos con varias secciones, cada una con su título.
  const conTitulos = a.bloques.length > 1 && a.grupo.key !== 'cmv'
  const BarraReparto = ({ r }) => {
    if (!esNum(r)) return <td className="b" />
    return <td className="b"><div className="im-bar">{r > 0 && <i style={{ width: `${r}%` }} />}{r < 100 && <s />}</div></td>
  }
  const celdas = (x) => [
    <td key="t" className={esNum(x.total) ? '' : 'n'}>{fmtNumIm(x.total)}</td>,
    <td key="tp" className="pc">{esNum(x.total) ? fmtPctIm(x.pct) : ''}</td>,
    <td key="a" className={esNum(x.col1) ? '' : 'n'}>{fmtNumIm(x.col1)}</td>,
    <td key="ap" className="pc">{esNum(x.col1) ? fmtPctIm(x.pct1) : ''}</td>,
    <td key="s" className={esNum(x.col2) ? '' : 'n'}>{fmtNumIm(x.col2)}</td>,
    <td key="sp" className="pc">{esNum(x.col2) ? fmtPctIm(x.pct2) : ''}</td>,
  ]
  let previo = null
  const ceja = cejaLocal(informe, l, `Apertura por rubro · ${a.grupo.titulo}${partes > 1 ? ` · ${parte} de ${partes}` : ''}`)
  return (
    <Marco m={m} informe={informe} tam={34} arriba={48} compacto ceja={ceja} titulo="Con factura y sin factura"
      derecha={(
        <div className="im-leyenda im-leyenda-ap">
          <span><i className="im-ley-ap" style={{ background: '#4fb3bb' }} />Con factura (venta {fmtPesosIm(a.venta.col1)})</span>
          <span><i className="im-ley-ap" style={{ background: '#c9b086' }} />Sin factura (venta {fmtPesosIm(a.venta.col2)})</span>
        </div>
      )}
      notaPie="% sobre la venta de cada columna">
      <table className="im-t im-t-ap">
        <thead>
          <tr><th>Categoría</th><th>Total</th><th>%</th><th>Con factura</th><th>%</th><th>Sin factura</th><th>%</th><th>Reparto</th></tr>
        </thead>
        <tbody>
          {filas.flatMap((f) => {
            const out = []
            if (conTitulos && f.bloque !== previo && titulos[f.bloque]) out.push(<tr className="g" key={`g${f.clave}`}><td colSpan={8}>{titulos[f.bloque]}</td></tr>)
            previo = f.bloque
            out.push(<tr key={f.clave}><td>{f.concepto}</td>{celdas(f)}<BarraReparto r={f.reparto} /></tr>)
            return out
          })}
          {ultima && (
            <>
              <tr className="tot"><td>Total {a.grupo.titulo}</td>{celdas(a.totales)}<BarraReparto r={a.totales.reparto} /></tr>
              {a.resultadoBruto && (
                <tr className="tot"><td style={{ color: '#c9b086' }}>Resultado bruto</td>{celdas(a.resultadoBruto)}<td className="b" /></tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </Marco>
  )
}

// ---------------------------------------------------------------------------
// Mapa de hojas y contenedores

// clave de hoja (HOJAS_DEFECTO) → componente.
export const HOJAS_IM_COMPONENTES = {
  portada: Portada,
  indice: Indice,
  indicadores: Indicadores,
  ind_locales: IndLocales,
  historico: Historico,
  pyl_acumulado: PylAcumulado,
  pyl_historico: PylHistorico,
  consolidado: Consolidado,
  cmv: Cmv,
  detalle: Detalle,
  apertura: Apertura,
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
