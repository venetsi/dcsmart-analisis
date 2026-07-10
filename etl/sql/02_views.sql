-- ============================================================
-- Capa semántica: vistas para el tablero y BI
-- ============================================================

CREATE OR REPLACE VIEW dcsmart_analytics.vw_pagos AS
SELECT
  p.id, p.nro_ord, p.fecha, p.fecha_dia, p.importe, p.importe_neto,
  p.pagado, IF(p.pagado,'PAGADO','PENDIENTE') AS estado,
  p.estado_op, p.id_tipo AS tipo,
  IF(p.ingresa_egreso,'INGRESO','EGRESO') AS ingresa_egreso,
  p.cashflow,
  DATE(p.cashflow)   AS cashflow_dia,
  DATE(p.fecha_pago) AS fecha_pago_dia,
  DATE(p.periodo)    AS periodo_dia,
  l.nombre  AS local,
  a.nombre  AS grupo,
  pr.nombre AS proveedor,
  rc.rubro, rc.categoria,
  mp.nombre AS metodo
FROM dcsmart_analytics.raw_pagos p
LEFT JOIN dcsmart_analytics.dim_locales      l  ON l.id  = p.id_local
LEFT JOIN dcsmart_analytics.dim_apps         a  ON a.id  = l.id_app
LEFT JOIN dcsmart_analytics.dim_proveedores  pr ON pr.id = p.id_proveedor
LEFT JOIN dcsmart_analytics.dim_rubcat       rc ON rc.id = p.id_rubcat
LEFT JOIN dcsmart_analytics.dim_metodos_pago mp ON mp.id = p.id_metodo;

CREATE OR REPLACE VIEW dcsmart_analytics.vw_cajas AS
SELECT
  c.id, c.nro_turno, c.fecha_inicio, c.fecha_dia, c.fecha_cierre,
  c.cajero, c.total, c.efectivo, c.fiscal, c.tickets, c.comensales, c.origin,
  l.nombre AS local,
  a.nombre AS grupo
FROM dcsmart_analytics.raw_cajas c
LEFT JOIN dcsmart_analytics.dim_locales l ON l.id = c.id_local
LEFT JOIN dcsmart_analytics.dim_apps    a ON a.id = l.id_app;

-- Cashflow: ingresos (ventas de cajas por día) vs egresos con criterio de caja:
-- solo pagos EFECTIVAMENTE pagados, ubicados por DATE(cashflow) con fallback a DATE(fecha_pago).
CREATE OR REPLACE VIEW dcsmart_analytics.vw_flujo_caja AS
WITH ingresos AS (
  SELECT fecha_dia, local, grupo, SUM(total) AS ingresos, COUNT(*) AS turnos
  FROM dcsmart_analytics.vw_cajas GROUP BY 1,2,3
),
egresos AS (
  SELECT COALESCE(cashflow_dia, fecha_pago_dia) AS fecha_dia, local, grupo,
         SUM(IF(ingresa_egreso='EGRESO', importe, 0))  AS egresos,
         SUM(IF(ingresa_egreso='INGRESO', importe, 0)) AS otros_ingresos,
         COUNT(*) AS pagos
  FROM dcsmart_analytics.vw_pagos
  WHERE pagado AND COALESCE(cashflow_dia, fecha_pago_dia) IS NOT NULL
  GROUP BY 1,2,3
)
SELECT
  COALESCE(i.fecha_dia, e.fecha_dia) AS fecha_dia,
  COALESCE(i.local, e.local)         AS local,
  COALESCE(i.grupo, e.grupo)         AS grupo,
  IFNULL(i.ingresos,0)  AS ingresos,
  IFNULL(e.egresos,0)   AS egresos,
  IFNULL(i.ingresos,0) + IFNULL(e.otros_ingresos,0) - IFNULL(e.egresos,0) AS neto,
  IFNULL(i.turnos,0) AS turnos, IFNULL(e.pagos,0) AS pagos,
  IF(i.fecha_dia IS NULL OR e.fecha_dia IS NULL, 'PARCIAL', 'OK') AS cuadratura
FROM ingresos i FULL OUTER JOIN egresos e USING (fecha_dia, local);
