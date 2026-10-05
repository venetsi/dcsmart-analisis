// Dónde está la API de la TV. La misma página se publica en dos lugares:
//   - Analytics (/tv/): la API está en el mismo origen (Firebase reescribe /api/**).
//   - dcsmart-rendimiento.web.app: el sitio de la TV de la oficina, que no tiene
//     backend propio y le pide los datos directo al servicio de Analytics.
window.TV_API_BASE = location.hostname === 'dcsmart-rendimiento.web.app'
  ? 'https://dcsmart-analytics-api-288069746644.us-central1.run.app'
  : ''
