-- Pagos cargados en la quincena con importe en 0, negativo o vacío.
-- Las notas de crédito (NCA) son ingresos con importe positivo, así que no caen acá.
-- Severidad media: hay pagos en $0 que se repiten todas las quincenas (Quilmes,
-- DBA) y pueden ser canjes o bonificaciones; si se confirma, se excluyen.
-- Una línea por local, con los proveedores.
SELECT
  'pago_importe_no_positivo' AS regla, 'media' AS severidad,
  l.nombre AS local, a.nombre AS grupo,
  IF(COUNT(*) = 1, CONCAT('OP ', CAST(MIN(p.nro_ord) AS STRING)),
     CONCAT(CAST(COUNT(*) AS STRING), ' pagos, OP ', CAST(MIN(p.nro_ord) AS STRING), ' a ', CAST(MAX(p.nro_ord) AS STRING))) AS referencia,
  IF(COUNT(*) = 1, ANY_VALUE(p.id), NULL) AS ref_id,
  MIN(p.fecha_dia) AS fecha,
  CAST(SUM(p.importe) AS FLOAT64) AS valor, CAST(NULL AS FLOAT64) AS esperado, COUNT(*) AS cantidad,
  STRING_AGG(DISTINCT IFNULL(pr.nombre, 'sin proveedor'), ', ') AS detalle
FROM `{{cdc}}.raw_pagos` p
LEFT JOIN `{{cdc}}.dim_locales` l ON l.id = p.id_local
LEFT JOIN `{{cdc}}.dim_apps` a ON a.id = l.id_app
LEFT JOIN `{{cdc}}.dim_proveedores` pr ON pr.id = p.id_proveedor
WHERE DATE(p.created_at, 'America/Argentina/Buenos_Aires') BETWEEN @desde AND @hasta
  AND (p.importe IS NULL OR p.importe <= 0)
  AND NOT REGEXP_CONTAINS(LOWER(CONCAT(IFNULL(l.nombre, ''), ' ', IFNULL(a.nombre, ''))), r'testing')
GROUP BY l.nombre, a.nombre
