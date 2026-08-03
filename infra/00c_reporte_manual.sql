-- Capa manual del Reporte de Ventas Mensuales (P&L).
-- Vive en la base propia dcsmart_analytics (NO en la base de gestión).
-- Correr como usuario owner (postgres); analytics_app no tiene DDL.
-- El GRANT del final habilita el RW de runtime para analytics_app.
CREATE TABLE IF NOT EXISTS reporte_mensual_manual (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo       TEXT NOT NULL,
  local       TEXT NOT NULL,
  mes         DATE NOT NULL,
  seccion     TEXT NOT NULL,
  concepto    TEXT NOT NULL,
  monto       NUMERIC(14,2) NOT NULL DEFAULT 0,
  columna     SMALLINT NOT NULL CHECK (columna IN (1,2)),
  creado_por  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (grupo, local, mes, seccion, concepto)
);
CREATE INDEX IF NOT EXISTS idx_rmm_scope ON reporte_mensual_manual (grupo, local, mes);
GRANT SELECT, INSERT, UPDATE, DELETE ON reporte_mensual_manual TO analytics_app;
