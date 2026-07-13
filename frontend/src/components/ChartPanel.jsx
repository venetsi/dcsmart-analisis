import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const DIM_COLORS = ['#C9B086', '#6BA6E0', '#4CAF7D', '#D4952A', '#B5A7EA', '#E05C5C', '#E1CBA0', '#A98F63']

const axisScales = {
  x: { ticks: { color: 'rgba(240,237,232,0.55)', font: { size: 10.5 } }, grid: { color: 'rgba(255,255,255,0.08)' } },
  y: {
    ticks: { color: 'rgba(240,237,232,0.55)', font: { size: 10.5 }, callback: (v) => '$' + (v / 1e6).toFixed(1) + 'M' },
    grid: { color: 'rgba(255,255,255,0.08)' }
  }
}

export default function ChartPanel({ meta, agg }) {
  const porMes = [...(agg?.por_mes || [])].sort((a, b) => (a.mes < b.mes ? -1 : 1))
  const porDim = [...(agg?.por_dim || [])].slice(0, 8)

  const evolucionData = {
    labels: porMes.map((m) => m.mes),
    datasets: [
      {
        label: meta.label,
        data: porMes.map((m) => Number(m.total)),
        backgroundColor: '#C9B086CC',
        borderColor: '#E1CBA0',
        borderWidth: 1,
        borderRadius: 6
      }
    ]
  }

  const dimLabels = porDim.map((d) => d.dim ?? '—')
  const dimValues = porDim.map((d) => Number(d.total))

  return (
    <section className="charts">
      <div className="chart-card">
        <h4>Evolución mensual</h4>
        <div className="chart-wrap">
          <Bar
            data={evolucionData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              animation: false,
              plugins: { legend: { display: false } },
              scales: axisScales
            }}
          />
        </div>
      </div>
      <div className="chart-card">
        <h4>Desglose por {meta.dims[0]}</h4>
        <div className="chart-wrap">
          {meta.negativeCapable ? (
            <Bar
              data={{
                labels: dimLabels,
                datasets: [{
                  data: dimValues,
                  backgroundColor: dimValues.map((v) => (v >= 0 ? '#4CAF7DCC' : '#E05C5CCC')),
                  borderRadius: 6
                }]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { display: false } },
                scales: axisScales
              }}
            />
          ) : (
            <Doughnut
              data={{
                labels: dimLabels,
                datasets: [{ data: dimValues, backgroundColor: DIM_COLORS, borderColor: '#19232f', borderWidth: 2 }]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                  legend: {
                    display: true,
                    position: 'right',
                    labels: { color: 'rgba(240,237,232,0.55)', font: { size: 10.5 }, boxWidth: 12 }
                  }
                }
              }}
            />
          )}
        </div>
      </div>
    </section>
  )
}
