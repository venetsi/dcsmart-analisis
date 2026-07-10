-- ============================================================
-- Tablas raw (particionadas por fecha de transacción — FinOps)
-- Dataset: dcsmart_analytics
-- ============================================================

CREATE TABLE IF NOT EXISTS dcsmart_analytics.raw_pagos (
  id STRING NOT NULL,
  nro_ord INT64,
  fecha TIMESTAMP,
  fecha_dia DATE,               -- columna de partición (DATE(fecha))
  id_proveedor STRING,
  id_rubcat STRING,
  id_tipo STRING,
  importe_neto NUMERIC,
  descuento NUMERIC,
  importe NUMERIC,
  id_metodo STRING,
  cashflow TIMESTAMP,
  observaciones STRING,
  pagado BOOL,
  fecha_pago TIMESTAMP,
  estado_op STRING,
  periodo TIMESTAMP,
  ingresa_egreso BOOL,
  id_local STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  _etl_loaded_at TIMESTAMP
)
PARTITION BY fecha_dia
CLUSTER BY id_local, id_rubcat
OPTIONS (require_partition_filter = FALSE);

CREATE TABLE IF NOT EXISTS dcsmart_analytics.raw_cajas (
  id STRING NOT NULL,
  nro_turno STRING,
  fecha_inicio TIMESTAMP,
  fecha_dia DATE,               -- DATE(fecha_inicio)
  fecha_cierre TIMESTAMP,
  id_local STRING,
  cajero STRING,
  total NUMERIC,
  efectivo NUMERIC,
  fiscal NUMERIC,
  comensales INT64,
  tickets INT64,
  origin STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  _etl_loaded_at TIMESTAMP
)
PARTITION BY fecha_dia
CLUSTER BY id_local;

CREATE TABLE IF NOT EXISTS dcsmart_analytics.raw_caja_movimientos (
  id STRING NOT NULL, tipo STRING, id_metodo STRING,
  monto NUMERIC, id_caja STRING, cantidad INT64, _etl_loaded_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dcsmart_analytics.raw_caja_detalles (
  id STRING NOT NULL, id_caja STRING, tipo STRING, id_tipo STRING,
  nombre STRING, monto NUMERIC, observaciones STRING,
  created_at TIMESTAMP, _etl_loaded_at TIMESTAMP
);

-- Dimensiones (full refresh en cada corte — son chicas)
CREATE TABLE IF NOT EXISTS dcsmart_analytics.dim_locales (
  id STRING, nombre STRING, activo BOOL, id_app STRING);
CREATE TABLE IF NOT EXISTS dcsmart_analytics.dim_proveedores (
  id STRING, nombre STRING, razon_social STRING, cuit STRING, id_rubcat STRING);
CREATE TABLE IF NOT EXISTS dcsmart_analytics.dim_rubcat (
  id STRING, rubro STRING, categoria STRING, cuenta STRING);
CREATE TABLE IF NOT EXISTS dcsmart_analytics.dim_metodos_pago (
  id STRING, nombre STRING);
CREATE TABLE IF NOT EXISTS dcsmart_analytics.dim_apps (
  id STRING, nombre STRING, slug STRING, activo BOOL);

-- Control del pipeline
CREATE TABLE IF NOT EXISTS dcsmart_analytics.etl_watermarks (
  tabla STRING NOT NULL, watermark TIMESTAMP, updated_at TIMESTAMP);

CREATE TABLE IF NOT EXISTS dcsmart_analytics.etl_runs (
  run_id STRING, started_at TIMESTAMP, finished_at TIMESTAMP,
  corte STRING,                       -- '06:00' | '12:00' | '20:00' | 'manual'
  tabla STRING, filas_procesadas INT64,
  pg_count INT64, bq_count INT64,     -- validación f_post
  pg_sum NUMERIC, bq_sum NUMERIC,
  estado STRING                       -- OK | MISMATCH | ERROR
);
