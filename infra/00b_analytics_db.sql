-- ============================================================
-- 00b — Schema de la base propia de la plataforma
-- psql "host=127.0.0.1 port=5432 dbname=dcsmart_analytics user=postgres" -v app_password='TU_PASSWORD' -f 00b_analytics_db.sql
-- ============================================================

-- Grants de acceso a la plataforma (referencia lógica a users.id de la base postgres)
CREATE TABLE access_grants (
  user_id     TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  is_admin    BOOLEAN NOT NULL DEFAULT false,   -- admin de la plataforma analytics
  granted_by  TEXT,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Informes preseteados del sidebar
CREATE TABLE presets (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug        TEXT UNIQUE NOT NULL,
  nombre      TEXT NOT NULL,
  icono       TEXT,
  dataset     TEXT NOT NULL CHECK (dataset IN ('pagos','cajas','flujo')),
  filtros     JSONB NOT NULL DEFAULT '{}',      -- filtros default
  layout      JSONB NOT NULL DEFAULT '{}',      -- kpis/gráficos a mostrar
  ai_prompt   TEXT,                             -- prompt IA sugerido
  orden       INT NOT NULL DEFAULT 100,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Log de consultas IA (auditoría + costos)
CREATE TABLE ai_queries (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  email       TEXT,
  dataset     TEXT,
  filtros     JSONB,
  prompt      TEXT,
  rows_sent   INT,
  tokens_in   INT,
  tokens_out  INT,
  ok          BOOLEAN,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_queries_user_idx ON ai_queries(user_id, created_at);

GRANT CONNECT ON DATABASE dcsmart_analytics TO analytics_ro; -- la API escribe con su propio usuario:
CREATE ROLE analytics_app WITH LOGIN PASSWORD :'app_password';
GRANT USAGE ON SCHEMA public TO analytics_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO analytics_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO analytics_app;

-- Seed de presets iniciales
INSERT INTO presets (slug, nombre, icono, dataset, filtros, layout, ai_prompt, orden) VALUES
('flujo-caja-cortes','Flujo de caja por corte','trending-up','flujo','{}',
 '{"kpis":["ingresos","egresos","neto","locales"],"charts":["evolucion_cortes","neto_por_local"]}',
 'Analizá el flujo de caja: ¿qué locales tienen flujo neto negativo y en qué cortes se concentran los egresos?',10),
('egresos-rubro','Egresos por rubro','pie-chart','pagos','{"ingresa_egreso":"EGRESO"}',
 '{"kpis":["total","operaciones","pendiente","ticket_prom"],"charts":["evolucion_mensual","por_rubro"]}',
 'Resumí los egresos por rubro, señalá dónde se concentra el gasto y qué rubros crecieron más el último mes.',20),
('comparativa-locales','Comparativa de locales','bar-chart','flujo','{}',
 '{"kpis":["ingresos","egresos","neto","locales"],"charts":["ventas_vs_gastos_local"]}',
 'Compará los locales: ventas vs gastos, ¿cuál es el más eficiente y cuál merece atención?',30),
('pagos-pendientes','Pagos pendientes','alert-circle','pagos','{"pagado":"false"}',
 '{"kpis":["total","operaciones","proveedores"],"charts":["por_proveedor","antiguedad"]}',
 'Analizá la deuda pendiente: montos por proveedor, antigüedad, y priorizá qué pagar primero.',40),
('ventas-turno','Ventas por turno','shopping-cart','cajas','{}',
 '{"kpis":["ventas","efectivo","tickets","prom_turno"],"charts":["evolucion_mensual","por_local"]}',
 'Analizá las ventas por turno: tendencia, proporción efectivo vs fiscal y locales destacados.',50);
