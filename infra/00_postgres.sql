-- ============================================================
-- 00 — Preparación en Cloud SQL (ejecutar UNA vez vía Cloud SQL Auth Proxy)
-- psql "host=127.0.0.1 port=5432 dbname=postgres user=postgres" -v ro_password='TU_PASSWORD' -f 00_postgres.sql
-- No modifica ninguna tabla existente.
-- ============================================================

-- 1. Usuario de SOLO LECTURA para el ETL y la API analytics
CREATE ROLE analytics_ro WITH LOGIN PASSWORD :'ro_password';
ALTER ROLE analytics_ro SET statement_timeout = '15s';        -- protege OLTP
GRANT CONNECT ON DATABASE postgres TO analytics_ro;
GRANT USAGE ON SCHEMA public TO analytics_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO analytics_ro;

-- 2. Base PROPIA de la plataforma (misma instancia, base nueva)
CREATE DATABASE dcsmart_analytics OWNER postgres;
