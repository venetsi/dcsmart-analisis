-- Hallazgos del control quincenal de datos: una fila por hallazgo y corrida.
-- Dataset propio (dcsmart_anomalias) para no escribir en dcsmart_analytics.
CREATE TABLE IF NOT EXISTS dcsmart_anomalias.hallazgos (
  corrida_id STRING NOT NULL,
  corrida_at TIMESTAMP NOT NULL,
  desde DATE NOT NULL,          -- ventana revisada
  hasta DATE NOT NULL,
  regla STRING NOT NULL,        -- ver anomalias/lib/hallazgos.js (REGLAS)
  severidad STRING NOT NULL,    -- alta | media | baja
  local STRING,
  grupo STRING,
  referencia STRING,            -- OP, turno o cantidad, para buscarlo en gestión
  ref_id STRING,                -- id del pago o la caja cuando es uno solo
  fecha DATE,
  valor FLOAT64,
  esperado FLOAT64,             -- mediana del histórico (reglas estadísticas)
  cantidad INT64,
  detalle STRING
)
PARTITION BY DATE(corrida_at)
CLUSTER BY regla, grupo;
