import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { fmtNum, fmtMesLargo, fmtPesos, fmtDate } from '../lib/format.js'
import { mesAnterior } from '../lib/pyl.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useGroup } from '../context/GroupContext.jsx'
import PageHeader from '../components/PageHeader.jsx'
import SelectorMes, { mesActual } from '../components/SelectorMes.jsx'
import HojaPdf from '../components/costoImpositivo/HojaPdf.jsx'
import '../styles/pyl.css'
import '../styles/costo-impositivo.css'
import '../styles/costo-impositivo-pdf.css'

// Costo impositivo del mes: IVA a pagar, IIBB a pagar e impuestos internos,
// por local. Las cuentas las hace la API (backend/src/lib/costoImpositivo.js);
// acá se muestran con su desglose para que se pueda seguir de dónde sale cada
// número. Usa las piezas visuales del P&L (pyl.css).

const Ico = ({ children }) => (
  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const IcoIva = () => <Ico><path d="M4 7h16" /><path d="M4 17h16" /><circle cx="8" cy="12" r="1.2" /><circle cx="16" cy="12" r="1.2" /></Ico>
const IcoIibb = () => <Ico><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 9h8" /><path d="M8 13h5" /></Ico>
const IcoInternos = () => <Ico><path d="M8 2h8l-1 7a4 4 0 0 1-6 0z" /><path d="M12 13v7" /><path d="M8 22h8" /></Ico>
const IcoTotal = () => <Ico><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></Ico>
const IcoDescargar = () => <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
const IcoChevron = () => <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
const IcoAviso = () => <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>

// Un saldo: positivo = a pagar, negativo = a favor.
function Saldo({ v, chico = false }) {
  if (v === null || v === undefined) return <span className="ci-saldo vacio">Sin alícuota</span>
  const favor = v < 0
  return (
    <span className={`ci-saldo ${favor ? 'favor' : 'pagar'}${chico ? ' chico' : ''}`}>
      {fmtPesos(Math.abs(v))}
      <small>{favor ? 'a favor' : 'a pagar'}</small>
    </span>
  )
}

function Tarjeta({ label, Icon, valor, saldo = true, children, tono }) {
  const cls = saldo && valor != null ? (valor < 0 ? 'positivo' : 'hero') : (tono || '')
  return (
    <div className={`pyl-kpi ${cls}`}>
      <div className="pyl-kpi-head">
        <span className="pyl-kpi-label">{label}</span>
        <span className="pyl-kpi-icon"><Icon /></span>
      </div>
      <div className="pyl-kpi-value big">{valor == null ? '—' : fmtPesos(Math.abs(valor))}</div>
      {saldo && valor != null && <div className="pyl-kpi-sub"><span className={`ci-pill ${valor < 0 ? 'favor' : 'pagar'}`}>{valor < 0 ? 'Saldo a favor' : 'A pagar'}</span></div>}
      {children}
    </div>
  )
}

// Una línea del desglose: "+ IVA del Z ......... $ 24.216.611".
function Linea({ signo, label, valor, ayuda, total }) {
  return (
    <div className={'ci-linea' + (total ? ' total' : '')}>
      <span className="ci-linea-signo">{signo}</span>
      <span className="ci-linea-label">{label}{ayuda && <em>{ayuda}</em>}</span>
      <span className="ci-linea-valor">{valor == null ? '—' : fmtPesos(valor)}</span>
    </div>
  )
}

// Alícuota de IIBB editable en la fila del local (solo el equipo DC).
function Alicuota({ local, puede, onGuardar }) {
  const inicial = local.calculo.iibb.alicuota
  const [valor, setValor] = useState(inicial == null ? '' : String(inicial).replace('.', ','))
  const [estado, setEstado] = useState('')
  useEffect(() => { setValor(inicial == null ? '' : String(inicial).replace('.', ',')) }, [inicial])

  async function guardar() {
    const limpio = valor.trim().replace(',', '.')
    const nuevo = limpio === '' ? null : Number(limpio)
    if (nuevo === inicial || (nuevo === null && inicial === null)) return
    if (nuevo !== null && (!Number.isFinite(nuevo) || nuevo < 0 || nuevo > 20)) { setEstado('error'); return }
    setEstado('guardando')
    try { await onGuardar({ alicuota: nuevo, incluir: local.incluir }); setEstado('ok') } catch { setEstado('error') }
  }

  if (!puede) return <span className="ci-alic-solo">{inicial == null ? '—' : `${String(inicial).replace('.', ',')}%`}</span>
  return (
    <span className={`ci-alic ${estado}`} onClick={(e) => e.stopPropagation()}>
      <input
        inputMode="decimal"
        value={valor}
        placeholder="—"
        aria-label={`Alícuota de IIBB de ${local.nombre}`}
        onChange={(e) => { setValor(e.target.value); setEstado('') }}
        onBlur={guardar}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
      <span className="ci-alic-pct">%</span>
      {estado === 'guardando' && <span className="ci-alic-msg">Guardando…</span>}
      {estado === 'ok' && <span className="ci-alic-msg ok">Guardado</span>}
      {estado === 'error' && <span className="ci-alic-msg error">Entre 0 y 20</span>}
    </span>
  )
}

function Facturas({ local, periodo }) {
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.ciFacturas(local.id, periodo).then(setFilas).catch(() => setError('No se pudieron traer las facturas.'))
  }, [local.id, periodo])
  if (error) return <div className="pyl-error">{error}</div>
  if (!filas) return <div className="ci-cargando"><span className="pyl-spinner" /> Trayendo facturas…</div>
  if (!filas.length) return <div className="pyl-card-vacio">No hay facturas A, C, M ni notas de crédito o débito en el período.</div>
  const suma = (k) => filas.reduce((a, f) => a + f[k], 0)
  return (
    <div className="pyl-tabla-scroll">
      <table className="pyl-tabla ci-facturas">
        <thead>
          <tr>
            <th>Fecha</th><th>Comprobante</th><th>Proveedor / cliente</th><th>Neto</th><th>IVA</th>
            <th>Perc. IVA</th><th>Perc. IIBB</th><th>Internos</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id} className={f.sentido === 'INGRESO' ? 'ci-ingreso' : ''}>
              <td>
                {fmtDate(f.fecha)}
                {periodo.mes && f.fecha && f.fecha.slice(0, 7) !== f.periodo && <span className="ci-periodo" title="La factura es de otro mes pero se cargó con el período de este">período {f.periodo.slice(5, 7)}/{f.periodo.slice(2, 4)}</span>}
              </td>
              <td>
                <span className={`ci-tipo ${f.sentido === 'INGRESO' ? 'ing' : 'egr'}`}>{f.tipo}</span>
                {f.pv != null && f.nro != null ? ` ${String(f.pv).padStart(5, '0')}-${String(f.nro).padStart(8, '0')}` : ''}
                {f.sentido === 'INGRESO' && <span className="ci-sentido">ingreso</span>}
                {(f.percVieja || f.retencion) ? <span className="ci-revisar" title="Tiene una percepción o retención sin impuesto asignado: no entra en la cuenta">a revisar</span> : null}
              </td>
              <td className="ci-prov">{f.proveedor || '—'}</td>
              <td className="num">{fmtPesos(f.neto)}</td>
              <td className="num">{f.iva ? fmtPesos(f.iva) : '—'}</td>
              <td className="num">{f.percIva ? fmtPesos(f.percIva) : '—'}</td>
              <td className="num">{f.percIibb ? fmtPesos(f.percIibb) : '—'}</td>
              <td className="num">{f.internos ? fmtPesos(f.internos) : '—'}</td>
            </tr>
          ))}
          <tr className="fila-res">
            <td colSpan={3}>{fmtNum(filas.length)} comprobantes</td>
            <td className="num">{fmtPesos(suma('neto'))}</td>
            <td className="num">{fmtPesos(suma('iva'))}</td>
            <td className="num">{fmtPesos(suma('percIva'))}</td>
            <td className="num">{fmtPesos(suma('percIibb'))}</td>
            <td className="num">{fmtPesos(suma('internos'))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Desglose({ local, periodo }) {
  const c = local.calculo
  const [verFacturas, setVerFacturas] = useState(false)
  const alic = c.iibb.alicuota
  return (
    <div className="ci-desglose">
      <div className="ci-desglose-grid">
        <div className="ci-bloque">
          <div className="ci-bloque-tit">IVA</div>
          <Linea signo="" label="IVA de las ventas (Z − Z / 1,21)" ayuda={`Z ${fmtPesos(c.z)}`} valor={c.iva.debito.cajas} />
          <Linea signo="+" label="IVA de las facturas de ingreso" valor={c.iva.debito.facturas} />
          <Linea signo="+" label="Percepciones de IVA de los ingresos" valor={c.iva.debito.percepciones} />
          <Linea signo="=" label="Débito fiscal" valor={c.iva.debito.total} total />
          <Linea signo="" label="IVA de las facturas de compra" valor={c.iva.credito.facturas} />
          <Linea signo="+" label="Percepciones de IVA de las compras" valor={c.iva.credito.percepciones} />
          <Linea signo="=" label="Crédito fiscal" valor={c.iva.credito.total} total />
          <div className="ci-resultado"><span>IVA (débito − crédito)</span><Saldo v={c.iva.ap} /></div>
        </div>

        <div className="ci-bloque">
          <div className="ci-bloque-tit">Ingresos brutos {alic != null && <span className="ci-bloque-alic">alícuota {String(alic).replace('.', ',')}%</span>}</div>
          <Linea signo="" label="Venta sin IVA (Z / 1,21)" valor={c.iibb.base.cajas} />
          <Linea signo="+" label="Neto de las facturas de ingreso" valor={c.iibb.base.facturas} />
          <Linea signo="=" label="Base imponible" valor={c.iibb.base.total} total />
          {alic == null ? (
            <div className="ci-falta">Falta cargar la alícuota de IIBB de este local.</div>
          ) : (
            <>
              <Linea signo="×" label={`Alícuota ${String(alic).replace('.', ',')}%`} valor={c.iibb.debito.base} />
              <Linea signo="+" label="Percepciones de IIBB de los ingresos" valor={c.iibb.debito.percepciones} />
              <Linea signo="=" label="Débito fiscal" valor={c.iibb.debito.total} total />
            </>
          )}
          <Linea signo="" label="Percepciones de IIBB de las compras" valor={c.iibb.credito.total} />
          <Linea signo="=" label="Crédito fiscal" valor={c.iibb.credito.total} total />
          <div className="ci-resultado"><span>IIBB (débito − crédito)</span><Saldo v={c.iibb.ap} /></div>
        </div>
      </div>

      {(c.aRevisar.percVieja > 0 || c.aRevisar.retencion !== 0) && (
        <div className="ci-aviso chico">
          <IcoAviso />
          <span>
            {c.aRevisar.percVieja > 0 && <>{fmtPesos(c.aRevisar.percVieja)} cargados como "Percepción" sin decir si es de IVA o de IIBB. </>}
            {c.aRevisar.retencion !== 0 && <>{fmtPesos(c.aRevisar.retencion)} cargados como "Retención" sin decir de qué impuesto. </>}
            No entran en la cuenta hasta que se corrijan en gestión.
          </span>
        </div>
      )}

      <button type="button" className="pyl-btn-sec ci-ver-facturas pyl-noprint" onClick={() => setVerFacturas((v) => !v)}>
        {verFacturas ? 'Ocultar facturas' : `Ver las ${fmtNum(c.facturas)} facturas`}
      </button>
      {verFacturas && <Facturas local={local} periodo={periodo} />}
    </div>
  )
}

const ultimoDia = (mes) => {
  const [y, m] = mes.split('-').map(Number)
  return `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
const fmtDia = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
const DIA = /^\d{4}-\d{2}-\d{2}$/
const rangoValido = (d, h) => DIA.test(d || '') && DIA.test(h || '') && d <= h

// Atajos del rango: siempre días completos.
function atajos() {
  const m = hoy().slice(0, 7)
  const ant = mesAnterior(m)
  const hace3 = mesAnterior(mesAnterior(ant))
  return [
    { label: 'Este mes', desde: `${m}-01`, hasta: hoy() },
    { label: 'Mes anterior', desde: `${ant}-01`, hasta: ultimoDia(ant) },
    { label: 'Últimos 3 meses', desde: `${hace3}-01`, hasta: ultimoDia(ant) },
    { label: 'Este año', desde: `${m.slice(0, 4)}-01-01`, hasta: hoy() }
  ]
}

// Desde / Hasta con atajos. Se aplica cuando las dos fechas son válidas.
function RangoFechas({ desde, hasta, onChange }) {
  const [d, setD] = useState(desde)
  const [h, setH] = useState(hasta)
  useEffect(() => { setD(desde); setH(hasta) }, [desde, hasta])
  const aplicar = (nd, nh) => { if (rangoValido(nd, nh)) onChange(nd, nh) }
  const invertido = d && h && d > h
  return (
    <div className="pyl-filtro">
      <div className="pyl-filtro-label">Rango de fechas</div>
      <div className="ci-rango">
        <label className={'ci-fecha' + (invertido ? ' error' : '')}>
          <span>Desde</span>
          <input type="date" value={d} max={hoy()} onChange={(e) => { setD(e.target.value); aplicar(e.target.value, h) }} />
        </label>
        <span className="ci-rango-guion">→</span>
        <label className={'ci-fecha' + (invertido ? ' error' : '')}>
          <span>Hasta</span>
          <input type="date" value={h} max={hoy()} onChange={(e) => { setH(e.target.value); aplicar(d, e.target.value) }} />
        </label>
        <div className="ci-atajos">
          {atajos().map((a) => (
            <button key={a.label} type="button" className={'pyl-mes' + (a.desde === desde && a.hasta === hasta ? ' active' : '')} onClick={() => onChange(a.desde, a.hasta)}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
      {invertido && <div className="ci-rango-error">La fecha "desde" tiene que ser anterior a "hasta".</div>}
    </div>
  )
}

export default function CostoImpositivoPage() {
  const { grupo } = useGroup()
  const { user } = useAuth()
  const interno = (user?.roles || []).some((r) => r === 'super_admin' || r === 'dcsmart')
  const [searchParams, setSearchParams] = useSearchParams()
  // Período: un mes (?mes=) o un rango (?desde=&hasta=). Sin nada, el mes anterior.
  const qDesde = searchParams.get('desde')
  const qHasta = searchParams.get('hasta')
  const modo = rangoValido(qDesde, qHasta) ? 'rango' : 'mes'
  const mes = searchParams.get('mes') || mesAnterior(mesActual())
  const periodoKey = modo === 'rango' ? `${qDesde}|${qHasta}` : mes
  // Objeto estable mientras no cambie el período (lo usan los efectos de abajo).
  const periodo = useMemo(() => (modo === 'rango' ? { desde: qDesde, hasta: qHasta } : { mes }), [periodoKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const etiqueta = modo === 'rango' ? `${fmtDia(qDesde)} al ${fmtDia(qHasta)}` : fmtMesLargo(mes)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [abiertos, setAbiertos] = useState(() => new Set())

  const load = useCallback((silencioso = false) => {
    if (!silencioso) setLoading(true)
    setError('')
    return api.ciGet(grupo, periodo)
      .then(setData)
      .catch(() => { setData(null); setError('No se pudo calcular el costo impositivo. Probá de nuevo en un momento.') })
      .finally(() => setLoading(false))
  }, [grupo, periodo])

  useEffect(() => { load() }, [load])

  const cambiarMes = (m) => {
    const next = new URLSearchParams(searchParams)
    next.delete('desde'); next.delete('hasta')
    next.set('mes', m)
    setSearchParams(next)
  }
  const cambiarRango = (d, h) => {
    const next = new URLSearchParams(searchParams)
    next.delete('mes')
    next.set('desde', d); next.set('hasta', h)
    setSearchParams(next)
  }
  // Al pasar de un modo al otro se arranca del período que se estaba mirando.
  const cambiarModo = (m) => {
    if (m === modo) return
    if (m === 'rango') cambiarRango(`${mes}-01`, ultimoDia(mes) > hoy() ? hoy() : ultimoDia(mes))
    else cambiarMes(qDesde.slice(0, 7))
  }
  const alternar = (id) => setAbiertos((prev) => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const guardarLocal = async (local, cambios) => {
    await api.ciPutLocal({ id_local: local.id, ...cambios })
    await load(true)
  }

  const t = data?.total
  const totalImpuestos = t ? t.iva.ap + (t.iibb.ap || 0) + t.internos : null
  const revisar = t && (t.aRevisar.percVieja > 0 || t.aRevisar.retencion !== 0)

  return (
    <div className="page pyl ci">
      <div className="ci-pantalla">
      <PageHeader
        title="Costo impositivo"
        chips={[grupo, etiqueta]}
        sub="IVA e ingresos brutos a pagar, y los impuestos internos de las facturas, local por local."
        actions={
          <button className="pyl-btn-pdf pyl-noprint" type="button" onClick={() => window.print()}>
            <IcoDescargar /> Descargar PDF
          </button>
        }
      />

      <section className="pyl-filtros pyl-noprint">
        <div className="pyl-filtro">
          <div className="pyl-filtro-label">Ver por</div>
          <div className="ci-modo" role="tablist">
            <button type="button" role="tab" aria-selected={modo === 'mes'} className={modo === 'mes' ? 'active' : ''} onClick={() => cambiarModo('mes')}>Mes</button>
            <button type="button" role="tab" aria-selected={modo === 'rango'} className={modo === 'rango' ? 'active' : ''} onClick={() => cambiarModo('rango')}>Rango de fechas</button>
          </div>
        </div>
        {modo === 'mes'
          ? <SelectorMes mes={mes} onChange={cambiarMes} />
          : <RangoFechas desde={qDesde} hasta={qHasta} onChange={cambiarRango} />}
        <div className="pyl-estado-carga">
          {loading ? <><span className="pyl-spinner" /> Calculando…</> : t ? `${t.locales} ${t.locales === 1 ? 'local' : 'locales'} en la cuenta` : ''}
        </div>
      </section>

      {modo === 'rango' && (
        <div className="ci-nota-rango pyl-noprint">
          En un rango, las facturas se toman por su <strong>fecha de factura</strong> y las cajas por su fecha de inicio.
          Por mes se usa el <strong>período</strong> cargado en cada factura, así que un mes completo puede dar distinto que por mes.
        </div>
      )}
      {error && <div className="pyl-error">{error}</div>}
      {!data && loading && <div className="pyl-kpis">{[0, 1, 2, 3].map(i => <div key={i} className="pyl-kpi pyl-skel" />)}</div>}
      {data && !data.locales.length && (
        <div className="pyl-vacio"><strong>Este grupo no tiene locales con movimiento en {modo === 'rango' ? `el rango ${etiqueta}` : etiqueta}.</strong></div>
      )}

      {data && data.locales.length > 0 && (
        <div className={loading ? 'pyl-recargando' : ''}>
          <section className="pyl-kpis">
            <Tarjeta label="IVA" Icon={IcoIva} valor={t.iva.ap}>
              <div className="pyl-kpi-sub">Débito {fmtPesos(t.iva.debito)} − crédito {fmtPesos(t.iva.credito)}</div>
            </Tarjeta>
            <Tarjeta label="Ingresos brutos" Icon={IcoIibb} valor={t.iibb.sinAlicuota.length === t.locales ? null : t.iibb.ap}>
              {t.iibb.sinAlicuota.length === t.locales
                ? <div className="pyl-kpi-sub">Falta cargar la alícuota de los locales</div>
                : <div className="pyl-kpi-sub">Débito {fmtPesos(t.iibb.debito)} − crédito {fmtPesos(t.iibb.credito)}</div>}
            </Tarjeta>
            <Tarjeta label="Impuestos internos" Icon={IcoInternos} valor={t.internos} saldo={false}>
              <div className="pyl-kpi-sub">Lo que traen las facturas del período</div>
            </Tarjeta>
            <Tarjeta label="Total impositivo" Icon={IcoTotal} valor={totalImpuestos} saldo={false} tono="ci-total">
              <div className="pyl-kpi-sub">IVA + IIBB + internos{t.iibb.sinAlicuota.length > 0 ? ' (IIBB incompleto)' : ''}</div>
            </Tarjeta>
          </section>

          {t.iibb.sinAlicuota.length > 0 && (
            <div className="ci-aviso">
              <IcoAviso />
              <span>
                <strong>Falta la alícuota de IIBB</strong> de {t.iibb.sinAlicuota.join(', ')}. {interno
                  ? 'Cargala en la columna "Alícuota IIBB" de la tabla; hasta entonces su IIBB no se suma.'
                  : 'Pedile al equipo DC que la cargue; hasta entonces su IIBB no se suma.'}
              </span>
            </div>
          )}
          {revisar && (
            <div className="ci-aviso info">
              <IcoAviso />
              <span>
                Hay {fmtPesos(t.aRevisar.percVieja + t.aRevisar.retencion)} en facturas cargados como "Percepción" o "Retención" sin decir
                de qué impuesto son. No entran en ninguna cuenta: abrí el local para ver cuáles son y corregilos en gestión.
              </span>
            </div>
          )}

          <section className="pyl-card pyl-tabla-card">
            <div className="pyl-tabla-head">
              <div>
                <div className="pyl-card-titulo">Por local</div>
                <div className="pyl-card-sub">Tocá un local para ver cómo se calculó y sus facturas.</div>
              </div>
            </div>
            <div className="pyl-tabla-scroll">
              <table className="pyl-tabla ci-tabla">
                <thead>
                  <tr>
                    <th>Local</th><th>Alícuota IIBB</th><th>IVA</th><th>Ingresos brutos</th><th>Internos</th>
                    <th className="pyl-noprint">Entra</th>
                  </tr>
                </thead>
                <tbody>
                  {data.locales.map((l) => {
                    const abierto = abiertos.has(l.id)
                    return [
                      <tr key={l.id} className={`fila-sec${abierto ? ' abierta' : ''}${l.incluir ? '' : ' ci-fuera'}`} onClick={() => alternar(l.id)}>
                        <td>
                          <button type="button" className="pyl-toggle" aria-expanded={abierto}>
                            <span className="chev"><IcoChevron /></span>{l.nombre}
                            {!l.incluir && <span className="ci-tag">no entra</span>}
                            {!l.activo && <span className="ci-tag">de baja</span>}
                          </button>
                        </td>
                        <td className="num"><Alicuota local={l} puede={interno} onGuardar={(c) => guardarLocal(l, c)} /></td>
                        <td className="num"><Saldo v={l.calculo.iva.ap} chico /></td>
                        <td className="num"><Saldo v={l.calculo.iibb.ap} chico /></td>
                        <td className="num">{fmtPesos(l.calculo.internos)}</td>
                        <td className="num pyl-noprint" onClick={(e) => e.stopPropagation()}>
                          <label className={`ci-switch${interno ? '' : ' bloqueado'}`} title={l.incluir ? 'Entra en los totales' : 'No entra en los totales'}>
                            <input
                              type="checkbox"
                              checked={l.incluir}
                              disabled={!interno}
                              onChange={(e) => guardarLocal(l, { alicuota: l.calculo.iibb.alicuota, incluir: e.target.checked })}
                            />
                            <span />
                          </label>
                        </td>
                      </tr>,
                      abierto && (
                        <tr key={l.id + '-d'} className="ci-fila-desglose">
                          <td colSpan={6}><Desglose local={l} periodo={periodo} /></td>
                        </tr>
                      )
                    ]
                  })}
                  <tr className="fila-res">
                    <td>Total {t.locales < data.locales.length ? `(${t.locales} de ${data.locales.length} locales)` : ''}</td>
                    <td />
                    <td className="num"><Saldo v={t.iva.ap} chico /></td>
                    <td className="num"><Saldo v={t.iibb.ap} chico /></td>
                    <td className="num">{fmtPesos(t.internos)}</td>
                    <td className="pyl-noprint" />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <details className="pyl-card ci-como">
            <summary>Cómo se calcula</summary>
            <div className="ci-como-grid">
              <div>
                <strong>IVA</strong>
                <p>Débito = IVA de las facturas de ingreso + IVA de la venta fiscal de las cajas (Z − Z / 1,21) + percepciones de IVA de los ingresos.</p>
                <p>Crédito = IVA de las facturas de compra + percepciones de IVA de las compras.</p>
              </div>
              <div>
                <strong>Ingresos brutos</strong>
                <p>Débito = (Z / 1,21 + neto de las facturas de ingreso) × alícuota del local + percepciones de IIBB de los ingresos.</p>
                <p>Crédito = percepciones de IIBB de las compras.</p>
              </div>
              <div>
                <strong>Impuestos internos</strong>
                <p>La suma de los impuestos internos que traen las facturas del período.</p>
                <p>Comprobantes que cuentan: A, C, M y las notas de crédito y débito (NCA, NDA, NCC, NDC). Por mes, las facturas van por período; por rango de fechas, por fecha de factura. Las cajas, siempre por fecha de inicio. Si da negativo, es saldo a favor.</p>
              </div>
            </div>
          </details>
        </div>
      )}
      </div>
      <HojaPdf data={data} grupo={grupo} etiqueta={etiqueta} modo={modo} />
    </div>
  )
}
