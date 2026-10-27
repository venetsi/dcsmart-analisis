-- Cajas cargadas en la quincena con una fecha imposible: anterior a 2025 o
-- más de 2 días después de cuando se cargaron. Los eventos (tipo_turno
-- 'Evento') se cargan por adelantado y no cuentan como fecha futura.
-- Se agrupan por local, día de carga y motivo: la migración de ROMA y LA FUERZA
-- del 07/09/2026 trajo 635 cajas viejas de una vez y tiene que verse como dos
-- líneas. Desde 20 cajas en el mismo día se marca como carga masiva (baja).
WITH malas AS (
  SELECT CAST(c.id AS STRING) AS id, CAST(c.id_local AS STRING) AS id_local, c.total,
         DATE(c.fecha_inicio, 'America/Argentina/Buenos_Aires') AS dia,
         DATE(c.created_at, 'America/Argentina/Buenos_Aires') AS cargada,
         CAST(c.origin AS STRING) AS origin, c.nro_turno,
         IF(DATE(c.fecha_inicio, 'America/Argentina/Buenos_Aires') < DATE '2025-01-01', 'anterior a 2025', 'fecha futura') AS motivo
  FROM `{{cdc}}.public_cajas` c
  WHERE DATE(c.created_at, 'America/Argentina/Buenos_Aires') BETWEEN @desde AND @hasta
    AND (DATE(c.fecha_inicio, 'America/Argentina/Buenos_Aires') < DATE '2025-01-01'
         OR (DATE(c.fecha_inicio, 'America/Argentina/Buenos_Aires') > DATE_ADD(DATE(c.created_at, 'America/Argentina/Buenos_Aires'), INTERVAL 2 DAY)
             AND IFNULL(c.tipo_turno, '') != 'Evento'))
)
SELECT
  IF(COUNT(*) >= 20, 'caja_carga_masiva_fechas_viejas', 'caja_fecha_fuera_de_rango') AS regla,
  IF(COUNT(*) >= 20, 'baja', 'alta') AS severidad,
  l.nombre AS local, a.nombre AS grupo,
  IF(COUNT(*) = 1, CONCAT(ANY_VALUE(m.origin), IF(IFNULL(ANY_VALUE(m.nro_turno), '') = '', '', CONCAT(' turno ', ANY_VALUE(m.nro_turno)))),
     CONCAT(CAST(COUNT(*) AS STRING), ' cajas')) AS referencia,
  IF(COUNT(*) = 1, ANY_VALUE(m.id), NULL) AS ref_id,
  m.cargada AS fecha,
  CAST(SUM(m.total) AS FLOAT64) AS valor, CAST(NULL AS FLOAT64) AS esperado, COUNT(*) AS cantidad,
  CONCAT(m.motivo, ' · fechas del ', FORMAT_DATE('%d/%m/%Y', MIN(m.dia)),
         ' al ', FORMAT_DATE('%d/%m/%Y', MAX(m.dia))) AS detalle
FROM malas m
JOIN `{{cdc}}.dim_locales` l ON l.id = m.id_local
LEFT JOIN `{{cdc}}.dim_apps` a ON a.id = l.id_app
WHERE NOT REGEXP_CONTAINS(LOWER(CONCAT(l.nombre, ' ', IFNULL(a.nombre, ''))), r'testing')
GROUP BY l.nombre, a.nombre, m.cargada, m.motivo
