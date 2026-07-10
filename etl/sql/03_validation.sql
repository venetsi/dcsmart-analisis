-- f_post — Cuadratura del último corte (la ejecuta el job y queda en etl_runs;
-- esta versión manual sirve para chequear a mano)
SELECT tabla, corte, filas_procesadas,
       pg_count, bq_count, pg_sum, bq_sum, estado, finished_at
FROM dcsmart_analytics.etl_runs
WHERE DATE(started_at) = CURRENT_DATE('America/Argentina/Buenos_Aires')
ORDER BY started_at DESC;
