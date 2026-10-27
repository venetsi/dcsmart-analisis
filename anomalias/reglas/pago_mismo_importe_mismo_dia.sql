-- Posible pago repetido sin número de factura que lo confirme: mismo local,
-- proveedor, importe y fecha. Si los dos tienen número de factura no se marca:
-- con números distintos son dos facturas, y con el mismo ya lo informa
-- pago_factura_repetida.
WITH base AS (
  SELECT p.id, p.nro_ord, p.id_local, p.id_proveedor, p.importe, p.fecha_dia, p.nro,
         DATE(p.created_at, 'America/Argentina/Buenos_Aires') AS cargado
  FROM `{{cdc}}.raw_pagos` p
  WHERE p.id_proveedor IS NOT NULL AND p.id_local IS NOT NULL AND p.importe > 0
    AND p.fecha_dia >= DATE_SUB(@desde, INTERVAL 180 DAY)
),
pares AS (
  SELECT n.*, v.nro_ord AS otro_nro_ord,
         ROW_NUMBER() OVER (PARTITION BY n.id ORDER BY v.cargado, v.id) AS orden
  FROM base n
  JOIN base v
    ON v.id_local = n.id_local AND v.id_proveedor = n.id_proveedor
   AND v.importe = n.importe AND v.fecha_dia = n.fecha_dia AND v.id != n.id
  WHERE n.cargado BETWEEN @desde AND @hasta
    AND (v.cargado NOT BETWEEN @desde AND @hasta OR v.id < n.id)
    AND NOT (IFNULL(n.nro, 0) > 0 AND IFNULL(v.nro, 0) > 0)
)
SELECT
  'pago_mismo_importe_mismo_dia' AS regla, 'media' AS severidad,
  l.nombre AS local, a.nombre AS grupo,
  IF(COUNT(*) = 1, CONCAT('OP ', CAST(ANY_VALUE(p.nro_ord) AS STRING), ' y OP ', CAST(ANY_VALUE(p.otro_nro_ord) AS STRING)),
     CONCAT(CAST(COUNT(*) AS STRING), ' pares, OP ', CAST(MIN(p.nro_ord) AS STRING), ' a ', CAST(MAX(p.nro_ord) AS STRING))) AS referencia,
  IF(COUNT(*) = 1, ANY_VALUE(p.id), NULL) AS ref_id, MIN(p.fecha_dia) AS fecha,
  CAST(SUM(p.importe) AS FLOAT64) AS valor, CAST(NULL AS FLOAT64) AS esperado, COUNT(*) AS cantidad,
  IFNULL(pr.nombre, '?') AS detalle
FROM pares p
LEFT JOIN `{{cdc}}.dim_locales` l ON l.id = p.id_local
LEFT JOIN `{{cdc}}.dim_apps` a ON a.id = l.id_app
LEFT JOIN `{{cdc}}.dim_proveedores` pr ON pr.id = p.id_proveedor
WHERE p.orden = 1
  AND NOT REGEXP_CONTAINS(LOWER(CONCAT(IFNULL(l.nombre, ''), ' ', IFNULL(a.nombre, ''))), r'testing')
-- una línea por local y proveedor: una migración trae cientos de pares del
-- mismo proveedor y tiene que verse como una sola
GROUP BY l.nombre, a.nombre, pr.nombre
