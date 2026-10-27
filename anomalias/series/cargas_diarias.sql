-- Cuántos pagos y cajas se cargaron por grupo y día (de Argentina), desde 12
-- semanas antes de la quincena. `viejos` cuenta los pagos con fecha de más
-- de 60 días antes de su carga: un pico hecho de esos suele ser una migración.
SELECT a.nombre AS grupo, 'pagos' AS tipo,
       DATE(p.created_at, 'America/Argentina/Buenos_Aires') AS dia,
       COUNT(*) AS n,
       COUNTIF(p.fecha_dia < DATE_SUB(DATE(p.created_at, 'America/Argentina/Buenos_Aires'), INTERVAL 60 DAY)) AS viejos
FROM `{{cdc}}.raw_pagos` p
JOIN `{{cdc}}.dim_locales` l ON l.id = p.id_local
JOIN `{{cdc}}.dim_apps` a ON a.id = l.id_app
WHERE DATE(p.created_at, 'America/Argentina/Buenos_Aires') BETWEEN DATE_SUB(@desde, INTERVAL 84 DAY) AND @hasta
  AND NOT REGEXP_CONTAINS(LOWER(CONCAT(l.nombre, ' ', a.nombre)), r'testing')
GROUP BY 1, 2, 3
UNION ALL
SELECT a.nombre, 'cajas',
       DATE(c.created_at, 'America/Argentina/Buenos_Aires'),
       COUNT(*),
       COUNTIF(DATE(c.fecha_inicio, 'America/Argentina/Buenos_Aires') < DATE_SUB(DATE(c.created_at, 'America/Argentina/Buenos_Aires'), INTERVAL 60 DAY))
FROM `{{cdc}}.public_cajas` c
JOIN `{{cdc}}.dim_locales` l ON l.id = CAST(c.id_local AS STRING)
JOIN `{{cdc}}.dim_apps` a ON a.id = l.id_app
WHERE DATE(c.created_at, 'America/Argentina/Buenos_Aires') BETWEEN DATE_SUB(@desde, INTERVAL 84 DAY) AND @hasta
  AND NOT REGEXP_CONTAINS(LOWER(CONCAT(l.nombre, ' ', a.nombre)), r'testing')
GROUP BY 1, 2, 3
