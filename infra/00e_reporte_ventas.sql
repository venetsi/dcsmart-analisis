-- Reporte de Ventas mensual. Base propia de Analytics: nunca se escribe en la
-- de gestión. Aplicar primero en dcsmart_analytics_dev.
--
-- En prod el dueño de las tablas es postgres y la app entra como analytics_app:
-- por eso los GRANT del final (en dev el dueño ya es dcsmart_dev_app).

-- Un cliente es un conjunto de locales de un grupo que se reporta junto.
CREATE TABLE IF NOT EXISTS rv_cliente (
  id         serial      PRIMARY KEY,
  grupo      text        NOT NULL,
  nombre     text        NOT NULL,
  locales    text[]      NOT NULL,
  creado_por text,
  creado_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo, nombre)
);

-- Qué es cada canal de venta, por local: se reconoce por método de pago o por
-- origen de la caja, y marca si es delivery.
CREATE TABLE IF NOT EXISTS rv_regla_canal (
  cliente_id      int         NOT NULL REFERENCES rv_cliente(id),
  local           text        NOT NULL,
  match           text        NOT NULL CHECK (match IN ('metodo','origen')),
  valor           text        NOT NULL,
  canal           text        NOT NULL,
  delivery        boolean     NOT NULL DEFAULT false,
  actualizado_por text,
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, local, match, valor)
);

-- Dato corregido o cargado a mano. `original` guarda lo que había antes de
-- corregirlo (null si se cargó de cero).
CREATE TABLE IF NOT EXISTS rv_valor (
  cliente_id      int           NOT NULL REFERENCES rv_cliente(id),
  local           text          NOT NULL,
  mes             char(7)       NOT NULL,            -- 'YYYY-MM'
  dato            text          NOT NULL,
  valor           numeric(16,2) NOT NULL,
  original        numeric(16,2),
  actualizado_por text          NOT NULL,
  actualizado_at  timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, local, mes, dato)
);

-- Cada cambio de rv_valor, para saber quién tocó qué y cuándo.
CREATE TABLE IF NOT EXISTS rv_valor_historial (
  id         bigserial     PRIMARY KEY,
  cliente_id int           NOT NULL,
  local      text          NOT NULL,
  mes        char(7)       NOT NULL,
  dato       text          NOT NULL,
  antes      numeric(16,2),
  despues    numeric(16,2),
  por        text          NOT NULL,
  at         timestamptz   NOT NULL DEFAULT now()
);

-- Mes congelado: `snapshot` guarda los números presentados. `origen` dice si
-- salió del reporte o se cargó desde un deck ya armado.
CREATE TABLE IF NOT EXISTS rv_cierre (
  cliente_id int         NOT NULL REFERENCES rv_cliente(id),
  mes        char(7)     NOT NULL,
  origen     text        NOT NULL CHECK (origen IN ('reporte','deck')),
  snapshot   jsonb       NOT NULL,
  cerrado    boolean     NOT NULL DEFAULT true,
  cerrado_por text,
  cerrado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, mes)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON rv_cliente, rv_regla_canal, rv_valor, rv_valor_historial, rv_cierre TO analytics_app;
    GRANT USAGE, SELECT ON SEQUENCE rv_cliente_id_seq, rv_valor_historial_id_seq TO analytics_app;
  END IF;
END $$;

-- Nombre para mostrar de cada local en el reporte del cliente (local -> texto).
ALTER TABLE rv_cliente ADD COLUMN IF NOT EXISTS nombres jsonb NOT NULL DEFAULT '{}'::jsonb;
