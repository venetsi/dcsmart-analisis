-- Pagos cargados en la quincena con una fecha imposible: anterior a 2025 o
-- más de 7 días después del día en que se cargaron (con menos margen salían
-- muchos pagos con la fecha de vencimiento en lugar de la de la factura).
-- Se agrupan por local, día de carga y motivo: una migración trae cientos de
-- pagos viejos de una vez y tiene que verse como UNA línea, no como cientos.
-- Desde 20 pagos en el mismo día se marca como carga masiva (severidad baja).
-- `fecha` se guarda a las 00:00 o 03:00 UTC (solo el día), así que DATE() en
-- UTC ya da el día correcto.
WITH malos AS (
  SELECT
    p.id, p.nro_ord, p.importe, p.id_local, p.fecha_dia,
    DATE(p.created_at, 'America/Argentina/Buenos_Aires') AS cargado,
    IF(p.fecha_dia < DATE '2025-01-01', 'anterior a 2025', 'fecha futura') AS motivo
  FROM `{{cdc}}.raw_pagos` p
  WHERE DATE(p.created_at, 'America/Argentina/Buenos_Aires') BETWEEN @desde AND @hasta
    AND (p.fecha_dia < DATE '2025-01-01'
         OR p.fecha_dia > DATE_ADD(DATE(p.created_at, 'America/Argentina/Buenos_Aires'), INTERVAL 7 DAY))
)
SELECT
  IF(COUNT(*) >= 20, 'pago_carga_masiva_fechas_viejas', 'pago_fecha_fuera_de_rango') AS regla,
  IF(COUNT(*) >= 20, 'baja', 'media') AS severidad,
  l.nombre AS local, a.nombre AS grupo,
  IF(COUNT(*) = 1, CONCAT('OP ', CAST(MIN(m.nro_ord) AS STRING)),
     CONCAT('OP ', CAST(MIN(m.nro_ord) AS STRING), ' a ', CAST(MAX(m.nro_ord) AS STRING))) AS referencia,
  IF(COUNT(*) = 1, ANY_VALUE(m.id), NULL) AS ref_id,
  m.cargado AS fecha,
  CAST(SUM(m.importe) AS FLOAT64) AS valor, CAST(NULL AS FLOAT64) AS esperado, COUNT(*) AS cantidad,
  CONCAT(m.motivo, ' · fechas del ', FORMAT_DATE('%d/%m/%Y', MIN(m.fecha_dia)),
         ' al ', FORMAT_DATE('%d/%m/%Y', MAX(m.fecha_dia))) AS detalle
FROM malos m
LEFT JOIN `{{cdc}}.dim_locales` l ON l.id = m.id_local
LEFT JOIN `{{cdc}}.dim_apps` a ON a.id = l.id_app
WHERE NOT REGEXP_CONTAINS(LOWER(CONCAT(IFNULL(l.nombre, ''), ' ', IFNULL(a.nombre, ''))), r'testing')
GROUP BY l.nombre, a.nombre, m.cargado, m.motivo
