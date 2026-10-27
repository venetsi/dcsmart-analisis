-- Pagos cargados en la quincena a los que les falta un dato. Una línea por
-- local y dato faltante, con la cantidad: son errores de a muchos y en el
-- mail alcanza con saber dónde mirar.
--   sin rubro                → media (salvo que el pago tenga reparto en pago_rubcats)
--   sin proveedor            → baja (hay gastos de caja chica que se cargan así)
--   pagado sin fecha de pago → baja
WITH base AS (
  SELECT p.id, p.nro_ord, p.importe, p.id_local, p.id_rubcat, p.id_proveedor, p.pagado, p.fecha_pago
  FROM `{{cdc}}.raw_pagos` p
  WHERE DATE(p.created_at, 'America/Argentina/Buenos_Aires') BETWEEN @desde AND @hasta
),
faltas AS (
  SELECT id, nro_ord, importe, id_local, 'sin rubro' AS dato, 'media' AS severidad FROM base b
  WHERE id_rubcat IS NULL
    AND NOT EXISTS (SELECT 1 FROM `{{cdc}}.public_pago_rubcats` r WHERE CAST(r.id_pago AS STRING) = b.id)
  UNION ALL
  SELECT id, nro_ord, importe, id_local, 'sin proveedor', 'baja' FROM base WHERE id_proveedor IS NULL
  UNION ALL
  SELECT id, nro_ord, importe, id_local, 'pagado sin fecha de pago', 'baja' FROM base WHERE pagado AND fecha_pago IS NULL
)
SELECT
  'pago_datos_faltantes' AS regla, f.severidad,
  IFNULL(l.nombre, 'sin local') AS local, a.nombre AS grupo,
  IF(COUNT(*) = 1, CONCAT('OP ', CAST(MIN(f.nro_ord) AS STRING)),
     CONCAT('OP ', CAST(MIN(f.nro_ord) AS STRING), ' a ', CAST(MAX(f.nro_ord) AS STRING))) AS referencia,
  IF(COUNT(*) = 1, ANY_VALUE(f.id), NULL) AS ref_id,
  CAST(NULL AS DATE) AS fecha,
  CAST(SUM(f.importe) AS FLOAT64) AS valor, CAST(NULL AS FLOAT64) AS esperado, COUNT(*) AS cantidad,
  f.dato AS detalle
FROM faltas f
LEFT JOIN `{{cdc}}.dim_locales` l ON l.id = f.id_local
LEFT JOIN `{{cdc}}.dim_apps` a ON a.id = l.id_app
WHERE NOT REGEXP_CONTAINS(LOWER(CONCAT(IFNULL(l.nombre, ''), ' ', IFNULL(a.nombre, ''))), r'testing')
GROUP BY l.nombre, a.nombre, f.dato, f.severidad
