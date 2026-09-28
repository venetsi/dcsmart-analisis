import { fmtMonto, fmtPct, pct, nombreMes, mesCorto } from '../../lib/informe.js'
import TablaResumen from './TablaResumen.jsx'
import LogoDcManagement from './LogoDcManagement.jsx'

// Las láminas del informe, en el mismo orden y con la misma estética que las
// presentaciones que se arman a mano (portada oscura, láminas claras con el
// punteado, tablas azul/turquesa/tostado). Cada lámina mide 1456x816: la
// pantalla las escala y el PDF las imprime a tamaño real, una por página.

export const ANCHO = 1456
export const ALTO = 816
const FILAS_POR_LAMINA = 17

// Bloques de la apertura por rubros: una o más láminas cada uno.
const BLOQUES = [
  { titulo: '2- CMV (Costo Mercadería Vendida)', secciones: ['cmv'], despues: 'bruto' },
  { titulo: '4- Costos Fijos - Variables', secciones: ['alquiler'] },
  { titulo: '5- Gastos Generales', secciones: ['publicidad', 'descartables', 'instalaciones', 'representacion'] },
  { titulo: '6- Costos Financieros', secciones: ['financieros'] },
  { titulo: '7- Sueldos y Honorarios', secciones: ['sueldos', 'sueldos_socios', 'desvinculaciones', 'honorarios'] },
  { titulo: 'Otros egresos', secciones: ['eventos', 'otros'] },
  { titulo: '10- Impositivos', secciones: ['impositivos'], despues: 'economico', cierre: true },
]

function Punteado({ className }) {
  return <div className={'sl-puntos ' + (className || '')} aria-hidden="true" />
}

function Diapositiva({ tipo = 'clara', children }) {
  return <section className={`sl sl-${tipo}`}>{children}</section>
}

function Portada({ mes, razon, logo, local }) {
  return (
    <Diapositiva tipo="oscura">
      <Punteado className="sl-puntos-portada" />
      <div className="sl-portada-marca">
        <LogoDcManagement className="sl-logo-estudio" />
        <span className="sl-portada-linea" />
      </div>
      <div className="sl-portada-titulo">
        <h1>INFORME<br />{nombreMes(mes).toUpperCase()}</h1>
        <p className="sl-portada-razon">{razon || local}</p>
        <p className="sl-portada-lema">Tu Rentabilidad, Nuestra Gestión</p>
      </div>
      <div className="sl-portada-local">
        {logo ? <img src={logo} alt={local} /> : <span className="sl-portada-local-nombre">{local}</span>}
      </div>
    </Diapositiva>
  )
}

function Indice() {
  return (
    <Diapositiva>
      <div className="sl-indice-banda"><h2>ÍNDICE</h2></div>
      <Punteado className="sl-puntos-esquina" />
      <ol className="sl-indice-lista">
        <li>Principales Indicadores</li>
        <li>P&amp;L Acumulado</li>
        <li>Apertura de Rubros</li>
      </ol>
    </Diapositiva>
  )
}

function Indicadores({ mes, ind, foto, local }) {
  const filas = [
    [`Venta ${mesCorto(mes).replace('-', '/')}`, fmtMonto(ind.venta)],
    ['PAX', fmtMonto(ind.pax)],
    ['Promedio PAX', fmtMonto(ind.promPax)],
    ['Días', fmtMonto(ind.dias)],
    ['Promedio Días', fmtMonto(ind.promDias)],
    ['CMV', fmtPct(ind.cmvPct)],
    ['Labor', fmtPct(ind.laborPct)],
    ['EERR', fmtPct(ind.eerrPct)],
  ]
  return (
    <Diapositiva>
      <Punteado className="sl-puntos-esquina-izq" />
      <div className="sl-ind-izq">
        <h2 className="sl-titulo-turquesa">PRINCIPALES INDICADORES</h2>
        <table className="sl-ind-tabla">
          <tbody>
            {filas.map(([k, v], i) => (
              <tr key={k} className={i === filas.length - 1 ? 'fuerte' : ''}><td>{k}</td><td>{v}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sl-ind-foto">
        {foto ? <img src={foto} alt={local} /> : <div className="sl-ind-foto-vacia"><span>{local}</span></div>}
        <Punteado className="sl-puntos-foto" />
      </div>
    </Diapositiva>
  )
}

function Separador({ titulo, sub }) {
  return (
    <Diapositiva>
      <span className="sl-sep-linea" />
      <span className="sl-sep-barra" />
      <div className="sl-sep-texto">
        <h2 className="sl-titulo-turquesa">{titulo}</h2>
        <p>{sub}</p>
      </div>
      <Punteado className="sl-puntos-c" />
    </Diapositiva>
  )
}

function PylAcumulado({ mes, rMes, rAnio, logo, local, vma, ipc }) {
  return (
    <Diapositiva>
      <div className="sl-pyl-cabeza">
        <h2>P&amp;L ACUMULADO</h2>
        {logo ? <img src={logo} alt={local} /> : <span className="sl-pyl-local">{local}</span>}
      </div>
      <span className="sl-sep-linea sl-sep-linea-baja" />
      <Punteado className="sl-puntos-c sl-puntos-c-arriba" />
      <div className="sl-pyl-tabla">
        <TablaResumen mes={mes} rMes={rMes} rAnio={rAnio} vma={vma} ipc={ipc} compacta />
      </div>
    </Diapositiva>
  )
}

// Filas de la apertura: encabezado de sección, líneas y total.
function filasBloque(bloque, informe, mes) {
  const S = Object.fromEntries(informe.secciones.map((s) => [s.key, s]))
  const vt = informe.totales.ventas
  const filas = []
  const conDatos = bloque.secciones.filter((k) => S[k].lineas.some((l) => !l.oculto))
  if (!conDatos.length && !bloque.cierre) return []
  filas.push({ tipo: 'bloque', texto: bloque.titulo })
  for (const k of conDatos) {
    const s = S[k]
    if (bloque.secciones.length > 1) filas.push({ tipo: 'seccion', texto: `${s.num} ${s.titulo}` })
    for (const l of s.lineas.filter((x) => !x.oculto)) filas.push({ tipo: 'linea', texto: l.concepto, v: l, vt })
    filas.push({ tipo: 'total', texto: bloque.secciones.length > 1 ? `TOTAL ${s.num}` : (k === 'cmv' ? '2- TOTAL CMV Alimentos + Bebidas' : `TOTAL ${s.num}`), v: s, vt })
  }
  const T = informe.totales
  if (bloque.despues === 'bruto') filas.push({ tipo: 'resultado', texto: '3- RESULTADO BRUTO (1-2)', v: T.resultadoBruto, vt })
  if (bloque.despues === 'economico') {
    filas.push({ tipo: 'resultado', texto: '11.- RESULTADO ECONÓMICO', v: T.resultadoEconomico, vt })
    for (const k of ['pasivo', 'dividendos']) {
      const s = S[k]
      if (!s.lineas.some((l) => !l.oculto)) continue
      filas.push({ tipo: 'seccion', texto: `${s.num}- ${s.titulo}` })
      for (const l of s.lineas.filter((x) => !x.oculto)) filas.push({ tipo: 'linea', texto: l.concepto, v: l, vt })
      filas.push({ tipo: 'total', texto: `TOTAL ${s.titulo.toUpperCase()}`, v: s, vt })
    }
    filas.push({ tipo: 'final', texto: `RESULTADO ${nombreMes(mes).toUpperCase()}`, v: T.resultadoFinal, vt })
  }
  return filas
}

function Celdas({ v, vt }) {
  return (
    <>
      <td className="ap-num">{fmtMonto(v.total)}</td>
      <td className="ap-pct">{fmtPct(pct(v.total, vt.total))}</td>
      <td className="ap-num ap-col">{v.col1 ? fmtMonto(v.col1) : ''}</td>
      <td className="ap-pct ap-col">{fmtPct(pct(v.col1, vt.col1))}</td>
      <td className="ap-num ap-col">{v.col2 ? fmtMonto(v.col2) : ''}</td>
      <td className="ap-pct ap-col">{fmtPct(pct(v.col2, vt.col2))}</td>
    </>
  )
}

function Apertura({ filas }) {
  return (
    <Diapositiva>
      <span className="sl-sep-linea" />
      <Punteado className="sl-puntos-c sl-puntos-c-arriba" />
      <table className="sl-apertura">
        <tbody>
          {filas.map((f, i) => (
            f.tipo === 'bloque' || f.tipo === 'seccion'
              ? <tr key={i} className={'ap-' + f.tipo}><td colSpan={7}>{f.texto}</td></tr>
              : <tr key={i} className={'ap-' + f.tipo}><td className="ap-label">{f.texto}</td><Celdas v={f.v} vt={f.vt} /></tr>
          ))}
        </tbody>
      </table>
    </Diapositiva>
  )
}

// Todas las láminas, en orden.
export function armarDiapositivas({ mes, informe, rMes, rAnio, localInfo, local, vma, ipc }) {
  const razon = localInfo?.razon_social || local
  const out = [
    <Portada key="portada" mes={mes} razon={razon} logo={localInfo?.logo} local={local} />,
    <Indice key="indice" />,
    <Indicadores key="ind" mes={mes} ind={rMes.indicadores} foto={localInfo?.foto} local={local} />,
    <Separador key="sep-pyl" titulo={<>P&amp;L<br />ACUMULADO {mes.slice(0, 4)}</>} sub={razon} />,
    <PylAcumulado key="pyl" mes={mes} rMes={rMes} rAnio={rAnio} logo={localInfo?.logo} local={local} vma={vma} ipc={ipc} />,
    <Separador key="sep-rub" titulo="APERTURA POR RUBROS" sub={razon} />,
  ]
  for (const b of BLOQUES) {
    const filas = filasBloque(b, informe, mes)
    for (let i = 0; i < filas.length; i += FILAS_POR_LAMINA) {
      out.push(<Apertura key={`ap-${b.titulo}-${i}`} filas={filas.slice(i, i + FILAS_POR_LAMINA)} />)
    }
  }
  out.push(<Portada key="cierre" mes={mes} razon={razon} logo={localInfo?.logo} local={local} />)
  return out
}
