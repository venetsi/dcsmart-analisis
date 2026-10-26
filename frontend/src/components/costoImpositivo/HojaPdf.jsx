import { useEffect } from 'react'
import { fmtPesos } from '../../lib/format.js'

// La hoja A4 del PDF de Costo impositivo. Misma maqueta que los PDF de
// gestión (dcsmart/backend/src/lib/plantillaCmv.js y plantillaCierreCaja.js):
// fondo azul noche, logo de la casa, tarjeta principal, tarjetas chicas y
// tablas compactas. En pantalla no se ve; al imprimir se ve SOLO esto (ver
// styles/costo-impositivo-pdf.css). Recibe lo mismo que ya mostró la página.

const alic = (v) => (v == null ? '—' : `${String(v).replace('.', ',')} %`)

function Saldo({ v }) {
  if (v === null || v === undefined) return <span className="h-sin">sin alícuota</span>
  return (
    <span className={v < 0 ? 'h-favor' : 'h-pagar'}>
      {fmtPesos(Math.abs(v))}<em>{v < 0 ? 'a favor' : 'a pagar'}</em>
    </span>
  )
}

function Linea({ s = '', label, v, total }) {
  return (
    <div className={'h-linea' + (total ? ' total' : '')}>
      <span className="h-signo">{s}</span>
      <span className="h-l">{label}</span>
      <span className="h-v">{v == null ? '—' : fmtPesos(v)}</span>
    </div>
  )
}

function Detalle({ l }) {
  const c = l.calculo
  return (
    <div className="h-card h-detalle">
      <div className="h-det-tit">{l.nombre}<span>Z {fmtPesos(c.z)} · IIBB {alic(c.iibb.alicuota)}</span></div>
      <div className="h-det-cols">
        <div>
          <div className="h-det-sub">IVA</div>
          <Linea label="IVA de las ventas (Z − Z / 1,21)" v={c.iva.debito.cajas} />
          <Linea s="+" label="IVA facturas de ingreso" v={c.iva.debito.facturas} />
          <Linea s="+" label="Percepciones IVA ingresos" v={c.iva.debito.percepciones} />
          <Linea s="=" label="Débito fiscal" v={c.iva.debito.total} total />
          <Linea label="IVA facturas de compra" v={c.iva.credito.facturas} />
          <Linea s="+" label="Percepciones IVA compras" v={c.iva.credito.percepciones} />
          <Linea s="=" label="Crédito fiscal" v={c.iva.credito.total} total />
          <div className="h-res">IVA <Saldo v={c.iva.ap} /></div>
        </div>
        <div>
          <div className="h-det-sub">Ingresos brutos</div>
          <Linea label="Venta sin IVA (Z / 1,21)" v={c.iibb.base.cajas} />
          <Linea s="+" label="Neto facturas de ingreso" v={c.iibb.base.facturas} />
          <Linea s="=" label="Base imponible" v={c.iibb.base.total} total />
          {c.iibb.alicuota == null
            ? <div className="h-falta">Falta la alícuota de IIBB.</div>
            : <>
              <Linea s="×" label={`Alícuota ${alic(c.iibb.alicuota)}`} v={c.iibb.debito.base} />
              <Linea s="+" label="Percepciones IIBB ingresos" v={c.iibb.debito.percepciones} />
              <Linea s="=" label="Débito fiscal" v={c.iibb.debito.total} total />
            </>}
          <Linea s="=" label="Crédito (percepciones IIBB compras)" v={c.iibb.credito.total} total />
          <div className="h-res">IIBB <Saldo v={c.iibb.ap} /></div>
        </div>
      </div>
      {(c.aRevisar.percVieja > 0 || c.aRevisar.retencion !== 0) && (
        <div className="h-nota">
          No entran en la cuenta: {c.aRevisar.percVieja > 0 && `${fmtPesos(c.aRevisar.percVieja)} cargados como "Percepción" sin impuesto`}
          {c.aRevisar.percVieja > 0 && c.aRevisar.retencion !== 0 && ' y '}
          {c.aRevisar.retencion !== 0 && `${fmtPesos(c.aRevisar.retencion)} como "Retención" sin impuesto`}.
        </div>
      )}
    </div>
  )
}

// Mientras la pantalla está abierta, la página impresa es A4 vertical sin
// márgenes (la hoja trae los suyos y el fondo llega al borde). Va como <style>
// propio porque en el CSS valdría para todas las pantallas de la app.
function usePaginaA4() {
  useEffect(() => {
    const st = document.createElement('style')
    st.dataset.hoja = 'costo-impositivo'
    // El fondo de la página también va acá: así la última hoja no queda en
    // blanco abajo, y el P&L (que imprime en blanco) no se entera.
    st.textContent = `@media print {
      @page { size: A4 portrait; margin: 0; }
      html, body, .app-layout, .app-body, .app-main { background: #19232f !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }`
    document.head.appendChild(st)
    return () => st.remove()
  }, [])
}

export default function HojaPdf({ data, grupo, etiqueta, modo }) {
  usePaginaA4()
  if (!data?.locales?.length) return null
  const t = data.total
  const dentro = data.locales.filter((l) => l.incluir)
  const fuera = data.locales.filter((l) => !l.incluir)
  const iibbOk = t.iibb.sinAlicuota.length < t.locales
  const total = t.iva.ap + (t.iibb.ap || 0) + t.internos
  const emitido = new Date().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="ci-hoja" aria-hidden="true">
      <div className="h-top">
        <img src="/logos/DCSMART-ANALYTICS-horizontal.png" alt="" className="h-logo" />
        <div className="h-id">
          <h1>{grupo}</h1>
          <div className="h-cuando">{etiqueta} <span className="h-chip">Costo impositivo</span></div>
        </div>
      </div>

      <div className="h-sec">
        <div className="h-card h-hero">
          <div>
            <div className="h-lbl">Costo impositivo del período</div>
            <div className="h-hero-v">{fmtPesos(total)}</div>
          </div>
          <div className="h-hero-sub">
            IVA <b>{fmtPesos(t.iva.ap)}</b><br />
            Ingresos brutos <b>{iibbOk ? fmtPesos(t.iibb.ap) : '—'}</b><br />
            Impuestos internos <b>{fmtPesos(t.internos)}</b>
          </div>
        </div>
        <div className="h-kpis">
          <div className="h-kpi">
            <div className="h-k"><i style={{ background: '#3FB6BD' }} />IVA</div>
            <div className="h-kv"><Saldo v={t.iva.ap} /></div>
            <div className="h-ks">Débito {fmtPesos(t.iva.debito)}</div>
            <div className="h-ks">Crédito {fmtPesos(t.iva.credito)}</div>
          </div>
          <div className="h-kpi">
            <div className="h-k"><i style={{ background: '#C9B086' }} />Ingresos brutos</div>
            <div className="h-kv">{iibbOk ? <Saldo v={t.iibb.ap} /> : <span className="h-sin">sin alícuota</span>}</div>
            <div className="h-ks">Débito {fmtPesos(t.iibb.debito)}</div>
            <div className="h-ks">Crédito {fmtPesos(t.iibb.credito)}</div>
          </div>
          <div className="h-kpi">
            <div className="h-k"><i style={{ background: '#B5A7EA' }} />Impuestos internos</div>
            <div className="h-kv"><span className="h-pagar">{fmtPesos(t.internos)}</span></div>
            <div className="h-ks">De las facturas del período</div>
            <div className="h-ks">{t.locales} {t.locales === 1 ? 'local' : 'locales'} en la cuenta</div>
          </div>
        </div>
      </div>

      {(t.iibb.sinAlicuota.length > 0) && (
        <div className="h-aviso">Falta la alícuota de IIBB de {t.iibb.sinAlicuota.join(', ')}: su IIBB no está sumado.</div>
      )}

      <div className="h-sec">
        <div className="h-sec-tit">Por local</div>
        <div className="h-card h-tabla">
          <table>
            <thead>
              <tr>
                <th>Local</th><th className="n">Alíc.</th>
                <th className="n">IVA débito</th><th className="n">IVA crédito</th><th className="n">IVA</th>
                <th className="n">IIBB débito</th><th className="n">IIBB crédito</th><th className="n">IIBB</th>
                <th className="n">Internos</th>
              </tr>
            </thead>
            <tbody>
              {[...dentro, ...fuera].map((l) => {
                const c = l.calculo
                return (
                  <tr key={l.id} className={l.incluir ? '' : 'fuera'}>
                    <td className="met">{l.nombre}{!l.incluir && <span className="h-tag">no entra</span>}</td>
                    <td className="n">{alic(c.iibb.alicuota)}</td>
                    <td className="n">{fmtPesos(c.iva.debito.total)}</td>
                    <td className="n">{fmtPesos(c.iva.credito.total)}</td>
                    <td className="n fuerte"><Saldo v={c.iva.ap} /></td>
                    <td className="n">{c.iibb.debito ? fmtPesos(c.iibb.debito.total) : '—'}</td>
                    <td className="n">{fmtPesos(c.iibb.credito.total)}</td>
                    <td className="n fuerte"><Saldo v={c.iibb.ap} /></td>
                    <td className="n fuerte">{fmtPesos(c.internos)}</td>
                  </tr>
                )
              })}
              <tr className="tot">
                <td>Total{fuera.length ? ` (${dentro.length} de ${data.locales.length})` : ''}</td>
                <td />
                <td className="n">{fmtPesos(t.iva.debito)}</td>
                <td className="n">{fmtPesos(t.iva.credito)}</td>
                <td className="n"><Saldo v={t.iva.ap} /></td>
                <td className="n">{fmtPesos(t.iibb.debito)}</td>
                <td className="n">{fmtPesos(t.iibb.credito)}</td>
                <td className="n">{iibbOk ? <Saldo v={t.iibb.ap} /> : '—'}</td>
                <td className="n">{fmtPesos(t.internos)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="h-sec">
        <div className="h-sec-tit">Cómo se llegó a cada número</div>
        <div className="h-detalles">{dentro.map((l) => <Detalle key={l.id} l={l} />)}</div>
      </div>

      <div className="h-pie">
        <span className="h-criterio">
          IVA = débito (IVA de las facturas de ingreso + Z − Z/1,21 + percepciones de IVA) − crédito (IVA de las facturas de compra + percepciones de IVA).
          IIBB = (Z/1,21 + neto de las facturas de ingreso) × alícuota + percepciones de ingresos − percepciones de IIBB de las compras.
          Comprobantes A, C, M, NCA, NDA, NCC y NDC. {modo === 'rango' ? 'Facturas por fecha de factura' : 'Facturas por período'}; cajas por fecha de inicio.
        </span>
        <span className="h-firma">DCSMART® · {emitido}</span>
      </div>
    </div>
  )
}
