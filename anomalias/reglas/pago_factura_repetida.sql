-- La misma factura cargada dos veces en el grupo: mismo proveedor, tipo,
-- punto de venta, número e importe. Mira los pagos cargados en la quincena
-- contra todos los del grupo.
-- Lo que NO se cuenta, porque en el backtest era casi todo ruido:
--   - importes distintos: son pagos parciales de la misma factura;
--   - números que son una fecha (DDMMAAAA, p. ej. 1111-30092026): son planillas
--     internas del local, no facturas ("Corte", "ADA", "Tita La Vedette");
--   - números que el proveedor repite más de 3 veces: también son planillas.
-- Desde el PR #368 gestión bloquea los duplicados nuevos dentro del grupo;
-- lo que aparezca acá entró por migración o por un camino sin ese control.
WITH base AS (
  SELECT p.id, p.nro_ord, p.id_proveedor, p.id_tipo, p.pv, p.nro, p.importe, p.fecha_dia,
         l.nombre AS local, a.id AS id_grupo, a.nombre AS grupo,
         DATE(p.created_at, 'America/Argentina/Buenos_Aires') AS cargado
  FROM `{{cdc}}.raw_pagos` p
  JOIN `{{cdc}}.dim_locales` l ON l.id = p.id_local
  JOIN `{{cdc}}.dim_apps` a ON a.id = l.id_app
  WHERE p.id_proveedor IS NOT NULL AND p.nro IS NOT NULL AND p.nro > 0
    AND IFNULL(SAFE.PARSE_DATE('%d%m%Y', LPAD(CAST(p.nro AS STRING), 8, '0'))
               BETWEEN DATE '2015-01-01' AND DATE '2035-12-31', FALSE) = FALSE
    AND NOT REGEXP_CONTAINS(LOWER(CONCAT(l.nombre, ' ', a.nombre)), r'testing')
),
planillas AS (
  SELECT id_proveedor, nro FROM base GROUP BY 1, 2 HAVING COUNT(*) > 3
),
pares AS (
  SELECT n.*, v.nro_ord AS otro_nro_ord, v.local AS otro_local,
         ROW_NUMBER() OVER (PARTITION BY n.id ORDER BY v.cargado, v.id) AS orden
  FROM base n
  JOIN base v
    ON v.id_grupo = n.id_grupo AND v.id_proveedor = n.id_proveedor
   AND v.id_tipo IS NOT DISTINCT FROM n.id_tipo AND v.pv IS NOT DISTINCT FROM n.pv
   AND v.nro = n.nro AND v.importe = n.importe AND v.id != n.id
  WHERE n.cargado BETWEEN @desde AND @hasta
    -- si los dos se cargaron en la quincena, el par se informa una sola vez
    AND (v.cargado NOT BETWEEN @desde AND @hasta OR v.id < n.id)
    AND NOT EXISTS (SELECT 1 FROM planillas x WHERE x.id_proveedor = n.id_proveedor AND x.nro = n.nro)
)
SELECT
  'pago_factura_repetida' AS regla, 'alta' AS severidad,
  p.local, p.grupo,
  CONCAT('OP ', CAST(p.nro_ord AS STRING), ' = OP ', CAST(p.otro_nro_ord AS STRING),
         IF(p.otro_local != p.local, CONCAT(' (', p.otro_local, ')'), '')) AS referencia,
  p.id AS ref_id, p.fecha_dia AS fecha,
  CAST(p.importe AS FLOAT64) AS valor, CAST(NULL AS FLOAT64) AS esperado, 1 AS cantidad,
  CONCAT(IFNULL(pr.nombre, '?'), ' · ', IFNULL(p.id_tipo, ''), ' ',
         LPAD(CAST(IFNULL(p.pv, 0) AS STRING), 4, '0'), '-', LPAD(CAST(p.nro AS STRING), 8, '0')) AS detalle
FROM pares p
LEFT JOIN `{{cdc}}.dim_proveedores` pr ON pr.id = p.id_proveedor
WHERE p.orden = 1
