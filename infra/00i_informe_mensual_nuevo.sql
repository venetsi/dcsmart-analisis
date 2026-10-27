-- Informe mensual nuevo: configuración de hojas, líneas agregadas o corregidas, textos y cierres.
-- En prod se corre ANTES de desplegar el backend (el GET ya lee estas tablas).
-- Es idempotente. Aplicar primero en dcsmart_analytics_dev.

-- Razón social del cliente para la portada y las hojas del informe.
ALTER TABLE rv_cliente ADD COLUMN IF NOT EXISTS razon_social text;

-- Las observaciones por hoja ahora son de un reporte ('ventas' = Reporte de Ventas, 'informe' = Informe mensual).
-- La PK pasa a incluir el reporte. Se recrea solo si todavía no lo incluye (idempotente).
ALTER TABLE rv_observacion ADD COLUMN IF NOT EXISTS reporte text NOT NULL DEFAULT 'ventas';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'rv_observacion'::regclass AND c.contype = 'p' AND a.attname = 'reporte'
  ) THEN
    ALTER TABLE rv_observacion DROP CONSTRAINT IF EXISTS rv_observacion_pkey;
    ALTER TABLE rv_observacion ADD PRIMARY KEY (cliente_id, mes, pagina, reporte);
  END IF;
END $$;

-- Qué hojas muestra cada cliente en cada reporte, en qué orden, y los indicadores propios por local.
-- hojas = [{ clave, visible, orden }]; indicadores = { local: [{ clave, nombre, formato }] }.
-- Sin fila = valores por defecto.
CREATE TABLE IF NOT EXISTS reporte_hojas (
  cliente_id      integer     NOT NULL REFERENCES rv_cliente(id) ON DELETE CASCADE,
  reporte         text        NOT NULL,
  hojas           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  indicadores     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  actualizado_por text,
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, reporte)
);

-- Línea cargada a mano en el informe: agregada al P&L, corrección de una automática (corrige = clave
-- de la línea corregida) o renglón de cash flow / deuda. local NULL = del cliente entero.
CREATE TABLE IF NOT EXISTS im_linea (
  id              bigserial     PRIMARY KEY,
  cliente_id      integer       NOT NULL REFERENCES rv_cliente(id) ON DELETE CASCADE,
  local           text,
  mes             text          NOT NULL CHECK (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  hoja            text          NOT NULL,
  seccion         text          NOT NULL,
  concepto        text          NOT NULL DEFAULT '',
  monto           numeric(16,2),
  monto2          numeric(16,2),
  corrige         text,
  oculta          boolean       NOT NULL DEFAULT false,
  orden           integer       NOT NULL DEFAULT 0,
  actualizado_por text,
  actualizado_at  timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS im_linea_cliente_mes_idx ON im_linea (cliente_id, mes);

-- Cada alta, cambio o baja de im_linea, para saber quién tocó qué y cuándo.
CREATE TABLE IF NOT EXISTS im_linea_historial (
  id         bigserial   PRIMARY KEY,
  linea_id   bigint,
  cliente_id integer     NOT NULL,
  mes        text        NOT NULL,
  accion     text        NOT NULL,
  antes      jsonb,
  despues    jsonb,
  por        text        NOT NULL,
  at         timestamptz NOT NULL DEFAULT now()
);

-- Textos libres: comentario del resumen ('resumen:<renglón>'), 'cashflow:elaborado',
-- 'cashflow:proyectado', 'deuda:fecha'. local '' = del cliente entero.
CREATE TABLE IF NOT EXISTS im_texto (
  cliente_id      integer     NOT NULL REFERENCES rv_cliente(id) ON DELETE CASCADE,
  local           text        NOT NULL DEFAULT '',
  mes             text        NOT NULL CHECK (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  clave           text        NOT NULL,
  texto           text        NOT NULL,
  actualizado_por text,
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, local, mes, clave)
);

-- Mes congelado: snapshot guarda los números presentados. origen dice si salió del informe
-- o se cargó desde una planilla. Mismo esquema que rv_cierre.
CREATE TABLE IF NOT EXISTS im_cierre (
  cliente_id        integer     NOT NULL REFERENCES rv_cliente(id) ON DELETE CASCADE,
  mes               text        NOT NULL CHECK (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  origen            text        NOT NULL CHECK (origen IN ('informe', 'planilla')),
  snapshot          jsonb       NOT NULL,
  snapshot_anterior jsonb,
  cerrado           boolean     NOT NULL DEFAULT true,
  cerrado_por       text,
  cerrado_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, mes)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON reporte_hojas, im_linea, im_linea_historial, im_texto, im_cierre TO analytics_app;
    GRANT USAGE, SELECT ON SEQUENCE im_linea_id_seq, im_linea_historial_id_seq TO analytics_app;
  END IF;
END $$;
