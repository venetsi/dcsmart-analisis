-- Costo impositivo: configuración por local (alícuota de IIBB y si entra en el reporte).
-- En prod se corre ANTES de desplegar el backend (el GET ya lee esta tabla).
-- Es idempotente. Aplicar primero en dcsmart_analytics_dev.

-- id_local es el id del local en gestión (no el nombre: los nombres cambian, Trello #273).
CREATE TABLE IF NOT EXISTS ci_local (
  id_local        text        PRIMARY KEY,
  alicuota_iibb   numeric     CHECK (alicuota_iibb IS NULL OR (alicuota_iibb >= 0 AND alicuota_iibb <= 20)),
  incluir         boolean     NOT NULL DEFAULT true,
  actualizado_por text,
  actualizado_at  timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ci_local TO analytics_app;
  END IF;
END $$;
