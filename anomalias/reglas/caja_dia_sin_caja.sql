-- Días de la quincena en que un local que abre ese día de la semana no tiene
-- ninguna caja. "Abre ese día" = tuvo caja en al menos 7 de los 8 mismos días
-- de la semana anteriores; así no se marcan los días que el local cierra.
-- Una línea por local con la lista de días. Si no hay ninguna caja en toda la
-- quincena (local cerrado o integración caída) la severidad es alta.
WITH dias_con_caja AS (
  SELECT DISTINCT CAST(c.id_local AS STRING) AS id_local,
         DATE(c.fecha_inicio, 'America/Argentina/Buenos_Aires') AS dia
  FROM `{{cdc}}.public_cajas` c
  WHERE DATE(c.fecha_inicio, 'America/Argentina/Buenos_Aires') BETWEEN DATE_SUB(@desde, INTERVAL 56 DAY) AND @hasta
),
locales AS (
  SELECT l.id AS id_local, l.nombre AS local, a.nombre AS grupo
  FROM `{{cdc}}.dim_locales` l
  LEFT JOIN `{{cdc}}.dim_apps` a ON a.id = l.id_app
  WHERE IFNULL(l.activo, TRUE)
    AND NOT REGEXP_CONTAINS(LOWER(CONCAT(l.nombre, ' ', IFNULL(a.nombre, ''))), r'testing')
),
dias AS (
  SELECT lo.id_local, lo.local, lo.grupo, d AS dia
  FROM locales lo CROSS JOIN UNNEST(GENERATE_DATE_ARRAY(@desde, @hasta)) d
),
historia AS (
  SELECT d.id_local, d.dia, COUNT(x.dia) AS semanas_con_caja
  FROM dias d
  CROSS JOIN UNNEST(GENERATE_ARRAY(1, 8)) s
  LEFT JOIN dias_con_caja x ON x.id_local = d.id_local AND x.dia = DATE_SUB(d.dia, INTERVAL 7 * s DAY)
  GROUP BY d.id_local, d.dia
),
evaluados AS (
  SELECT d.*, y.dia IS NOT NULL AS tiene_caja
  FROM dias d
  JOIN historia h ON h.id_local = d.id_local AND h.dia = d.dia
  LEFT JOIN dias_con_caja y ON y.id_local = d.id_local AND y.dia = d.dia
  WHERE h.semanas_con_caja >= 7
)
SELECT
  'caja_dia_sin_caja' AS regla,
  IF(COUNTIF(tiene_caja) = 0, 'alta', 'media') AS severidad,
  local, grupo,
  IF(COUNTIF(tiene_caja) = 0, 'ninguna caja en la quincena',
     CONCAT(CAST(COUNTIF(NOT tiene_caja) AS STRING), IF(COUNTIF(NOT tiene_caja) = 1, ' día', ' días'), ' sin caja')) AS referencia,
  CAST(NULL AS STRING) AS ref_id, MIN(IF(tiene_caja, NULL, dia)) AS fecha,
  CAST(NULL AS FLOAT64) AS valor, CAST(NULL AS FLOAT64) AS esperado,
  COUNTIF(NOT tiene_caja) AS cantidad,
  CONCAT('sin caja: ', STRING_AGG(IF(tiene_caja, NULL, CONCAT(
    ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][OFFSET(EXTRACT(DAYOFWEEK FROM dia) - 1)],
    ' ', FORMAT_DATE('%d/%m', dia))), ', ' ORDER BY dia)) AS detalle
FROM evaluados
GROUP BY id_local, local, grupo
HAVING COUNTIF(NOT tiene_caja) > 0
