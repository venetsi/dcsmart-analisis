-- Reporte de Ventas: observaciones por hoja e inflación mensual (IPC de INDEC).
-- En prod se corre ANTES de desplegar el backend (el GET ya lee estas tablas).
-- Es idempotente. Aplicar primero en dcsmart_analytics_dev.

-- Observación opcional de una hoja del reporte (pagina = id de la hoja: 'sintesis', 'mes:LOCAL', ...).
CREATE TABLE IF NOT EXISTS rv_observacion (
  cliente_id      integer     NOT NULL REFERENCES rv_cliente(id) ON DELETE CASCADE,
  mes             text        NOT NULL CHECK (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  pagina          text        NOT NULL,
  texto           text        NOT NULL CHECK (length(texto) BETWEEN 1 AND 280),
  actualizado_por text,
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, mes, pagina)
);

-- Inflación mensual de Argentina (variación % del IPC nivel general nacional).
-- fuente 'indec' = calculada del índice que publica datos.gob.ar; 'mano' = cargada por el equipo
-- (le gana a la de INDEC y no se pisa al volver a consultar).
CREATE TABLE IF NOT EXISTS rv_ipc (
  mes             text        PRIMARY KEY CHECK (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  variacion       numeric     NOT NULL,
  fuente          text        NOT NULL CHECK (fuente IN ('indec', 'mano')),
  actualizado_por text,
  actualizado_at  timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON rv_observacion, rv_ipc TO analytics_app;
  END IF;
END $$;
