-- Logo de cada local para la portada del Reporte de Ventas: { "<local>": "data:image/png;base64,..." }.
-- En prod se corre ANTES de desplegar el backend (el GET y el PUT ya leen y escriben esta columna).
-- Es idempotente. Aplicar primero en dcsmart_analytics_dev.
ALTER TABLE rv_cliente ADD COLUMN IF NOT EXISTS logos jsonb NOT NULL DEFAULT '{}'::jsonb;
