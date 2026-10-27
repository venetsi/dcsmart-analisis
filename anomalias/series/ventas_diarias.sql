-- Venta por local y día (de Argentina) desde 12 semanas antes de la quincena.
-- Los eventos (tipo_turno 'Evento') quedan afuera: son ventas sueltas que
-- deformarían lo "habitual" del local.
SELECT CAST(c.id_local AS STRING) AS id_local, l.nombre AS local, a.nombre AS grupo,
       DATE(c.fecha_inicio, 'America/Argentina/Buenos_Aires') AS dia,
       CAST(SUM(c.total) AS FLOAT64) AS total
FROM `{{cdc}}.public_cajas` c
JOIN `{{cdc}}.dim_locales` l ON l.id = CAST(c.id_local AS STRING)
LEFT JOIN `{{cdc}}.dim_apps` a ON a.id = l.id_app
WHERE DATE(c.fecha_inicio, 'America/Argentina/Buenos_Aires') BETWEEN DATE_SUB(@desde, INTERVAL 84 DAY) AND @hasta
  AND IFNULL(c.tipo_turno, '') != 'Evento'
  AND NOT REGEXP_CONTAINS(LOWER(CONCAT(l.nombre, ' ', IFNULL(a.nombre, ''))), r'testing')
GROUP BY 1, 2, 3, 4
