import { fmtMoney, fmtNum } from './format.js'

// KPIs derivados de agg.por_mes / agg.por_dim (agregados reales de BigQuery, no acotados
// por el "limit" de filas de detalle) para que los totales sean correctos aunque la tabla
// de detalle esté truncada.
export function computeKpis(meta, agg) {
  const porMes = agg?.por_mes || []
  const porDim = agg?.por_dim || []
  const totalCount = porMes.reduce((s, m) => s + Number(m.n || 0), 0)
  const totalAmount = porMes.reduce((s, m) => s + Number(m.total || 0), 0)
  const top = porDim[0]

  return [
    {
      label: `Total ${meta.label.toLowerCase()}`,
      value: fmtMoney(totalAmount),
      sub: `${fmtNum(totalCount)} registros`,
      accent: 'accent'
    },
    {
      label: 'Promedio',
      value: totalCount ? fmtMoney(totalAmount / totalCount) : '—',
      sub: 'por registro'
    },
    {
      label: 'Registros',
      value: fmtNum(totalCount),
      sub: 'en el rango filtrado',
      accent: 'teal'
    },
    {
      label: top ? `Principal ${meta.dims[0]}` : 'Principal',
      value: top?.dim ?? '—',
      sub: top ? fmtMoney(Number(top.total)) : '',
      accent: top && Number(top.total) < 0 ? 'bad' : ''
    }
  ]
}
