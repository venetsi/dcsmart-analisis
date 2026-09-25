-- Informe mensual (P&L + resumen + presentación). Base propia de Analytics:
-- nunca se escribe en la de gestión. Aplicar primero en dcsmart_analytics_dev.
--
-- En prod el dueño de las tablas es postgres y la app entra como analytics_app:
-- por eso los GRANT del final (en dev el dueño ya es dcsmart_dev_app).

-- Un informe por local y mes. `datos` guarda lo que se ajustó a mano (líneas
-- agregadas, montos corregidos, líneas ocultas, textos). Al cerrar el mes,
-- `snapshot` congela los números que se presentaron: el acumulado del año se
-- arma con los snapshots, así un cambio posterior en gestión no altera un mes
-- ya informado.
CREATE TABLE IF NOT EXISTS informe_mensual (
  grupo           text        NOT NULL,
  local           text        NOT NULL,
  mes             char(7)     NOT NULL,          -- 'YYYY-MM'
  datos           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  cerrado         boolean     NOT NULL DEFAULT false,
  snapshot        jsonb,
  actualizado_por text,
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  cerrado_por     text,
  cerrado_at      timestamptz,
  PRIMARY KEY (grupo, local, mes)
);

-- A qué sección del P&L va cada rubro/categoría de gestión, cuando no es la
-- que sale por defecto. Vale para todo el grupo y para los meses que vengan.
CREATE TABLE IF NOT EXISTS informe_reglas (
  grupo           text        NOT NULL,
  rubro           text        NOT NULL,
  categoria       text        NOT NULL,
  seccion         text        NOT NULL,
  concepto        text,                          -- nombre con que se muestra (opcional)
  actualizado_por text,
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (grupo, rubro, categoria)
);

-- Lo que la presentación necesita del local y gestión no tiene.
CREATE TABLE IF NOT EXISTS informe_local (
  grupo           text        NOT NULL,
  local           text        NOT NULL,
  razon_social    text,
  logo            text,                          -- data URL (imagen chica)
  foto            text,                          -- data URL (imagen comprimida)
  actualizado_por text,
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (grupo, local)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON informe_mensual, informe_reglas, informe_local TO analytics_app;
  END IF;
END $$;
