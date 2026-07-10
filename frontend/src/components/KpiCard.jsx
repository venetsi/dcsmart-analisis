export default function KpiCard({ label, value, sub, accent }) {
  return (
    <div className={`kpi ${accent || ''}`}>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      <div className="s">{sub}</div>
    </div>
  )
}
