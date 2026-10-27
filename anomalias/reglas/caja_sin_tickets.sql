-- Cajas con venta pero sin tickets o sin comensales, SOLO en los locales que
-- normalmente los informan: TapTap casi nunca manda tickets y muchas cajas
-- manuales no los llevan, así que marcar todas sería ruido.
-- "Normalmente" = el dato vino en al menos el 90 % de las cajas con venta de
-- los 60 días anteriores a la quincena (y hubo al menos 20 cajas).
WITH cajas AS (
  SELECT CAST(c.id AS STRING) AS id, CAST(c.id_local AS STRING) AS id_local, c.total,
         CAST(c.origin AS STRING) AS origin, c.nro_turno, c.tickets, c.comensales,
         DATE(c.fecha_inicio, 'America/Argentina/Buenos_Aires') AS dia
  FROM `{{cdc}}.public_cajas` c
  WHERE c.total > 0
    AND DATE(c.fecha_inicio, 'America/Argentina/Buenos_Aires') BETWEEN DATE_SUB(@desde, INTERVAL 60 DAY) AND @hasta
),
costumbre AS (
  SELECT id_local,
         COUNTIF(IFNULL(tickets, 0) > 0) / COUNT(*) AS con_tickets,
         COUNTIF(IFNULL(comensales, 0) > 0) / COUNT(*) AS con_comensales
  FROM cajas WHERE dia < @desde
  GROUP BY id_local HAVING COUNT(*) >= 20
),
faltan AS (
  SELECT c.*,
         ARRAY_TO_STRING(ARRAY_CONCAT(
           IF(k.con_tickets >= 0.9 AND IFNULL(c.tickets, 0) = 0, ['tickets'], []),
           IF(k.con_comensales >= 0.9 AND IFNULL(c.comensales, 0) = 0, ['comensales'], [])), ' ni ') AS falta
  FROM cajas c JOIN costumbre k USING (id_local)
  WHERE c.dia >= @desde
)
-- Una línea por local y dato faltante, con los días.
SELECT
  'caja_sin_tickets' AS regla, 'media' AS severidad,
  l.nombre AS local, a.nombre AS grupo,
  IF(COUNT(*) = 1, CONCAT(ANY_VALUE(f.origin), IF(IFNULL(ANY_VALUE(f.nro_turno), '') = '', '', CONCAT(' turno ', ANY_VALUE(f.nro_turno)))),
     CONCAT(CAST(COUNT(*) AS STRING), ' cajas')) AS referencia,
  IF(COUNT(*) = 1, ANY_VALUE(f.id), NULL) AS ref_id, MIN(f.dia) AS fecha,
  CAST(SUM(f.total) AS FLOAT64) AS valor, CAST(NULL AS FLOAT64) AS esperado, COUNT(*) AS cantidad,
  CONCAT('venta sin ', f.falta, ' · días: ', STRING_AGG(DISTINCT FORMAT_DATE('%d/%m', f.dia), ', ')) AS detalle
FROM faltan f
JOIN `{{cdc}}.dim_locales` l ON l.id = f.id_local
LEFT JOIN `{{cdc}}.dim_apps` a ON a.id = l.id_app
WHERE f.falta != ''
  AND NOT REGEXP_CONTAINS(LOWER(CONCAT(l.nombre, ' ', IFNULL(a.nombre, ''))), r'testing')
GROUP BY l.nombre, a.nombre, f.falta
