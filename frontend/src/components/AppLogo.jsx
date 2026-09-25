// Mismo logo que gestión y costos, con el nombre de la app debajo de DC SMART.
// Los PNG salen del molde de New-app-logos (ver public/logos).
export default function AppLogo({ variant = 'horizontal', className = '' }) {
  return (
    <img
      src={`/logos/DCSMART-ANALYTICS-${variant}.png`}
      alt="DCSMART Analytics"
      className={`app-logo${className ? ' ' + className : ''}`}
    />
  )
}
