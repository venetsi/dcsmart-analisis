-- La misma venta cargada dos veces: dos o más cajas del mismo local, el mismo
-- día y con el mismo total al peso. Es el caso de las cajas manuales que se
-- cargan además de la de Fudo/TapTap, o de una caja manual cargada dos veces.
-- No se cuentan las de Centro de Producción / Eventos (tipo_turno 'Evento' o
-- cajero 'CP'): son otro circuito de venta y caen el mismo día por casualidad.
-- El día es el de Argentina (la vista raw_cajas lo calcula en UTC y corre
-- un día las cajas que abren después de las 21:00).
WITH cajas AS (
  SELECT CAST(c.id AS STRING) AS id, CAST(c.id_local AS STRING) AS id_local, c.total,
         CAST(c.origin AS STRING) AS origin, c.nro_turno, c.cajero,
         DATE(c.fecha_inicio, 'America/Argentina/Buenos_Aires') AS dia
  FROM `{{cdc}}.public_cajas` c
  WHERE c.total > 0
    AND IFNULL(c.tipo_turno, '') != 'Evento' AND UPPER(IFNULL(c.cajero, '')) != 'CP'
    AND DATE(c.fecha_inicio, 'America/Argentina/Buenos_Aires') BETWEEN @desde AND @hasta
)
SELECT
  'caja_repetida' AS regla, 'alta' AS severidad,
  l.nombre AS local, a.nombre AS grupo,
  STRING_AGG(CONCAT(c.origin, IF(IFNULL(c.nro_turno, '') = '', '', CONCAT(' turno ', c.nro_turno))), ' + ' ORDER BY c.origin) AS referencia,
  MIN(c.id) AS ref_id, c.dia AS fecha,
  CAST(c.total AS FLOAT64) AS valor, CAST(NULL AS FLOAT64) AS esperado, COUNT(*) AS cantidad,
  CONCAT(CAST(COUNT(*) AS STRING), ' cajas con el mismo total · cajeros: ',
         STRING_AGG(IFNULL(c.cajero, '?'), ', ' ORDER BY c.origin)) AS detalle
FROM cajas c
JOIN `{{cdc}}.dim_locales` l ON l.id = c.id_local
LEFT JOIN `{{cdc}}.dim_apps` a ON a.id = l.id_app
WHERE NOT REGEXP_CONTAINS(LOWER(CONCAT(l.nombre, ' ', IFNULL(a.nombre, ''))), r'testing')
GROUP BY l.nombre, a.nombre, c.dia, c.total
HAVING COUNT(*) > 1
