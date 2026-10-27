-- Cajas de la quincena que cierran antes de abrir. TapTap guarda el cierre
-- sin segundos y a veces queda unos segundos antes que la apertura: por eso
-- se pide una diferencia de más de 5 minutos. Tampoco cuentan los cierres a
-- las 00:00 en punto: son cajas viejas (TOGNIS-CAFE 2025) que guardaban solo
-- el día del cierre.
SELECT
  'caja_cierre_antes_del_inicio' AS regla, 'media' AS severidad,
  l.nombre AS local, a.nombre AS grupo,
  CONCAT(CAST(c.origin AS STRING), IF(IFNULL(c.nro_turno, '') = '', '', CONCAT(' turno ', c.nro_turno))) AS referencia,
  CAST(c.id AS STRING) AS ref_id,
  DATE(c.fecha_inicio, 'America/Argentina/Buenos_Aires') AS fecha,
  CAST(c.total AS FLOAT64) AS valor, CAST(NULL AS FLOAT64) AS esperado, 1 AS cantidad,
  CONCAT('abre ', FORMAT_DATETIME('%d/%m %H:%M', DATETIME(c.fecha_inicio, 'America/Argentina/Buenos_Aires')),
         ' · cierra ', FORMAT_DATETIME('%d/%m %H:%M', DATETIME(c.fecha_cierre, 'America/Argentina/Buenos_Aires'))) AS detalle
FROM `{{cdc}}.public_cajas` c
JOIN `{{cdc}}.dim_locales` l ON l.id = CAST(c.id_local AS STRING)
LEFT JOIN `{{cdc}}.dim_apps` a ON a.id = l.id_app
WHERE DATE(c.fecha_inicio, 'America/Argentina/Buenos_Aires') BETWEEN @desde AND @hasta
  AND c.fecha_cierre < TIMESTAMP_SUB(c.fecha_inicio, INTERVAL 5 MINUTE)
  AND TIME(DATETIME(c.fecha_cierre, 'America/Argentina/Buenos_Aires')) != TIME '00:00:00'
  AND NOT REGEXP_CONTAINS(LOWER(CONCAT(l.nombre, ' ', IFNULL(a.nombre, ''))), r'testing')
