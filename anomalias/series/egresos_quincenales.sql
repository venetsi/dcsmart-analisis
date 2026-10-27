-- Egresos por local, rubro y quincena (la quincena se identifica por su
-- primer día: el 1 o el 16), desde 9 meses antes de la actual (se compara
-- con la misma mitad del mes de los 8 meses anteriores).
-- Los pagos repartidos en varios rubros (pago_rubcats) no tienen id_rubcat
-- y quedan juntos en "(repartido o sin rubro)".
SELECT l.nombre AS local, a.nombre AS grupo,
       IFNULL(rc.rubro, '(repartido o sin rubro)') AS rubro,
       IF(EXTRACT(DAY FROM p.fecha_dia) <= 15, DATE_TRUNC(p.fecha_dia, MONTH),
          DATE_ADD(DATE_TRUNC(p.fecha_dia, MONTH), INTERVAL 15 DAY)) AS quincena,
       CAST(SUM(p.importe) AS FLOAT64) AS total
FROM `{{cdc}}.raw_pagos` p
JOIN `{{cdc}}.dim_locales` l ON l.id = p.id_local
LEFT JOIN `{{cdc}}.dim_apps` a ON a.id = l.id_app
LEFT JOIN `{{cdc}}.dim_rubcat` rc ON rc.id = p.id_rubcat
WHERE NOT IFNULL(p.ingresa_egreso, FALSE) AND p.importe > 0
  AND p.fecha_dia BETWEEN DATE_SUB(@desde, INTERVAL 280 DAY) AND @hasta
  AND NOT REGEXP_CONTAINS(LOWER(CONCAT(l.nombre, ' ', IFNULL(a.nombre, ''))), r'testing')
GROUP BY 1, 2, 3, 4
