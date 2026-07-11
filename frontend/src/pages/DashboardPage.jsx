import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { computeKpis } from '../lib/kpis.js'
import { useGroup } from '../context/GroupContext.jsx'
import FilterBar from '../components/FilterBar.jsx'
import KpiCard from '../components/KpiCard.jsx'
import ChartPanel from '../components/ChartPanel.jsx'
import DataTable from '../components/DataTable.jsx'
import AiPanel from '../components/AiPanel.jsx'

// Las 3 pantallas fijas y su dataset del backend.
const SCREENS = {
  pagos: {
    dataset: 'pagos',
    title: 'Pagos',
    desc: 'Egresos e ingresos registrados en pagos. Elegí con qué fecha se filtra el período.'
  },
  ventas: {
    dataset: 'cajas',
    title: 'Ventas',
    desc: 'Turnos de caja: ventas, tickets, efectivo vs fiscal.'
  },
  cashflow: {
    dataset: 'flujo',
    title: 'Cashflow',
    desc: 'Ingresos (ventas) vs egresos efectivamente pagados, ubicados por fecha de cashflow.'
  }
}

// Mismo contrato que backend/src/routes/datasets.js (dims/filters/fecha_col por dataset)
// más lo necesario para render (columnas de las vistas de BigQuery y sugerencias de IA).
const DATASET_META = {
  pagos: {
    label: 'Pagos',
    amountCol: 'importe',
    dims: ['local', 'rubro', 'proveedor', 'metodo', 'estado'],
    dateColOptions: [
      { value: 'factura', label: 'Fecha factura' },
      { value: 'cashflow', label: 'Fecha cashflow' },
      { value: 'pago', label: 'Fecha pago' },
      { value: 'periodo', label: 'Fecha período' }
    ],
    filterFields: [
      { key: 'local', label: 'Local' },
      { key: 'rubro', label: 'Rubro' },
      { key: 'proveedor', label: 'Proveedor' },
      { key: 'estado', label: 'Estado', options: ['PAGADO', 'PENDIENTE'] },
      { key: 'metodo', label: 'Método' },
      { key: 'ingresa_egreso', label: 'Dirección', options: ['INGRESO', 'EGRESO'] }
    ],
    columns: [
      { key: 'nro_ord', label: 'Orden' },
      { key: 'fecha_dia', label: 'Fecha' },
      { key: 'local', label: 'Local' },
      { key: 'proveedor', label: 'Proveedor' },
      { key: 'rubro', label: 'Rubro' },
      { key: 'metodo', label: 'Método' },
      { key: 'ingresa_egreso', label: 'Dirección', pill: (v) => (v === 'EGRESO' ? 'egreso' : 'ingreso') },
      { key: 'estado', label: 'Estado', pill: (v) => (v === 'PAGADO' ? 'ok' : 'warn') },
      { key: 'importe', label: 'Importe', numeric: true, money: true }
    ],
    aiSuggestions: [
      'Detectá anomalías o pagos inusuales',
      'Resumí los egresos por rubro',
      'Compará los locales: ¿cuál gasta más y en qué?',
      '¿Qué proveedores concentran más gasto?',
      'Analizá los pagos pendientes por antigüedad'
    ]
  },
  cajas: {
    label: 'Ventas',
    amountCol: 'total',
    dims: ['local', 'cajero', 'origin'],
    filterFields: [
      { key: 'local', label: 'Local' },
      { key: 'cajero', label: 'Cajero' },
      { key: 'origin', label: 'Origen' }
    ],
    columns: [
      { key: 'nro_turno', label: 'Turno' },
      { key: 'fecha_dia', label: 'Fecha' },
      { key: 'local', label: 'Local' },
      { key: 'cajero', label: 'Cajero' },
      { key: 'origin', label: 'Origen' },
      { key: 'tickets', label: 'Tickets', numeric: true },
      { key: 'efectivo', label: 'Efectivo', numeric: true, money: true },
      { key: 'total', label: 'Total', numeric: true, money: true }
    ],
    aiSuggestions: [
      'Compará el rendimiento entre locales',
      'Detectá turnos atípicos',
      '¿Cómo evolucionaron las ventas mes a mes?',
      'Analizá efectivo vs fiscal por local',
      '¿Qué cajero registra mejores turnos?'
    ]
  },
  flujo: {
    label: 'Cashflow',
    amountCol: 'neto',
    negativeCapable: true,
    dims: ['local'],
    filterFields: [
      { key: 'local', label: 'Local' },
      { key: 'cuadratura', label: 'Cuadratura', options: ['OK', 'PARCIAL'] }
    ],
    columns: [
      { key: 'fecha_dia', label: 'Fecha' },
      { key: 'local', label: 'Local' },
      { key: 'ingresos', label: 'Ingresos', numeric: true, money: true },
      { key: 'egresos', label: 'Egresos', numeric: true, money: true },
      { key: 'neto', label: 'Neto', numeric: true, money: true },
      { key: 'turnos', label: 'Turnos', numeric: true },
      { key: 'pagos', label: 'Pagos', numeric: true },
      { key: 'cuadratura', label: 'Cuadratura', pill: (v) => (v === 'OK' ? 'ok' : 'parcial') }
    ],
    aiSuggestions: [
      '¿Qué locales tienen flujo neto negativo?',
      '¿En qué fechas se concentran los egresos?',
      'Analizá la cuadratura: ¿dónde hay días parciales?',
      'Proyectá el flujo del próximo mes según la tendencia'
    ]
  },
  caja_detalles: {
    label: 'Detalle de pagos',
    amountCol: 'monto',
    dims: ['metodo', 'local', 'cajero'],
    filterFields: [
      { key: 'local', label: 'Local' },
      { key: 'metodo', label: 'Método' },
      { key: 'cajero', label: 'Cajero' },
      { key: 'tipo', label: 'Tipo', options: ['ingreso', 'egreso'] }
    ],
    columns: [
      { key: 'fecha_dia', label: 'Fecha' },
      { key: 'nro_turno', label: 'Turno' },
      { key: 'local', label: 'Local' },
      { key: 'cajero', label: 'Cajero' },
      { key: 'metodo', label: 'Método' },
      { key: 'tipo', label: 'Tipo', pill: (v) => (v === 'egreso' ? 'egreso' : 'ingreso') },
      { key: 'monto', label: 'Monto', numeric: true, money: true }
    ],
    aiSuggestions: [
      '¿Qué medio de cobro concentra más ventas?',
      'Compará efectivo/QR vs tarjetas y apps de delivery',
      '¿Cómo evolucionó el mix de medios de pago?',
      '¿Qué comisiones estimás según el mix de cobros?'
    ]
  }
}

// La pantalla Ventas alterna entre dos reportes: turnos (cajas) y detalle de pagos.
const VENTAS_REPORTES = [
  { key: 'turnos', label: 'Turnos', dataset: 'cajas' },
  { key: 'pagos', label: 'Detalle de pagos', dataset: 'caja_detalles' }
]

// Mismo default que aplica el backend cuando no se manda "desde" (ver datasets.js).
function defaultDesde() {
  return new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
}

export default function DashboardPage({ screen }) {
  const { grupo } = useGroup()
  const [searchParams, setSearchParams] = useSearchParams()

  const sc = SCREENS[screen]
  // En Ventas, el reporte (turnos/pagos) define el dataset; en el resto es fijo.
  const reporte = screen === 'ventas' ? (searchParams.get('reporte') || 'turnos') : null
  const dataset = screen === 'ventas'
    ? (VENTAS_REPORTES.find((r) => r.key === reporte)?.dataset || 'cajas')
    : sc.dataset
  const meta = DATASET_META[dataset]

  const [options, setOptions] = useState({})
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')

  // filtros de la URL; el grupo global se agrega aparte en cada llamada
  const filters = useMemo(() => Object.fromEntries(searchParams.entries()), [searchParams])
  const fechaCol = filters.fecha_col || 'factura'
  const query = useMemo(() => ({ ...filters, grupo }), [filters, grupo])

  useEffect(() => {
    let cancelled = false
    api.getDatasetOptions(dataset, { grupo })
      .then((o) => !cancelled && setOptions(o))
      .catch(() => !cancelled && setOptions({}))
    return () => { cancelled = true }
  }, [dataset, grupo])

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api.getDataset(dataset, query)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [dataset, query])

  useEffect(() => { load() }, [load])

  function updateFilter(key, value) {
    const next = new URLSearchParams(searchParams)
    next.set(key, value)
    setSearchParams(next)
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams())
  }

  const rows = data?.rows || []
  const agg = data?.agg || { por_mes: [], por_dim: [] }

  return (
    <div>
      <div className="page-hdr">
        <h2>{sc.title} <small style={{ color: 'var(--beige)', fontWeight: 400, fontSize: 13 }}>· {grupo}</small></h2>
        <p>{sc.desc}</p>
      </div>

      {screen === 'ventas' && (
        <div className="rep-toggle">
          {VENTAS_REPORTES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={reporte === r.key ? 'on' : ''}
              onClick={() => setSearchParams(new URLSearchParams({ reporte: r.key }))}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      <div className="step-label"><div className="step-num">1</div><h3>Filtrá la data</h3></div>
      <FilterBar
        meta={meta}
        filters={filters}
        defaultDesde={defaultDesde()}
        options={options}
        onChange={updateFilter}
        onClear={clearFilters}
        matchCount={loading ? '…' : rows.length}
        dateColValue={fechaCol}
        onDateColChange={(v) => updateFilter('fecha_col', v)}
      />

      {error && <p className="login-err">{error}</p>}

      <section className="kpis">
        {computeKpis(meta, agg).map((k) => <KpiCard key={k.label} {...k} />)}
      </section>

      <ChartPanel meta={meta} agg={agg} />
      <DataTable meta={meta} rows={rows} totalRows={data?.total_rows ?? 0} />

      <div className="step-label">
        <div className="step-num">2</div>
        <h3>Analizá con IA <small>— recibe exactamente la data filtrada (agregados + muestra)</small></h3>
      </div>
      <AiPanel
        meta={meta}
        dataset={dataset}
        filters={query}
        agg={agg}
        rows={rows}
        prompt={aiPrompt}
        onPromptChange={setAiPrompt}
      />
    </div>
  )
}
