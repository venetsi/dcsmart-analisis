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

const DIM_COLORS = ['#087C85', '#CEAC81', '#7AA8AC', '#E5B454', '#5FCF8A', '#B58CC9', '#E87171', '#8FA8E0']

const axisScales = {
  x: { ticks: { color: '#B0AFAE', font: { size: 10.5 } }, grid: { color: '#4e4d4c' } },
  y: {
    ticks: { color: '#B0AFAE', font: { size: 10.5 }, callback: (v) => '$' + (v / 1e6).toFixed(1) + 'M' },
    grid: { color: '#4e4d4c' }
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
        backgroundColor: '#087C85CC',
        borderColor: '#0ea3ae',
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
                  backgroundColor: dimValues.map((v) => (v >= 0 ? '#5FCF8ACC' : '#E87171CC')),
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
                datasets: [{ data: dimValues, backgroundColor: DIM_COLORS, borderColor: '#3C3B3A', borderWidth: 2 }]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                  legend: {
                    display: true,
                    position: 'right',
                    labels: { color: '#B0AFAE', font: { size: 10.5 }, boxWidth: 12 }
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
