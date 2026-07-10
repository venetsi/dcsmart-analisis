# DCSmart Analytics — Plataforma paralela (Opción B: BigQuery)

Plataforma independiente en **analisis.dcsmart.app** para análisis customizable con IA sobre `pagos` y `cajas`, alimentada por un pipeline micro-batch Cloud SQL → BigQuery (3 cortes diarios: 06:00, 12:00 y 20:00, hora AR). **Cero modificaciones** al repo, backend, base o red de la app en producción.

---

## Arquitectura

```
                    PRODUCCIÓN (intocada)
┌─────────────────────────────────────────────────┐
│ Firebase Hosting (live) ── Cloud Run             │
│ dcsmart-backend ── Cloud SQL dcsmart-mvp-insta   │
│                     └── DB "postgres" (OLTP)     │
└──────────────────────────┬──────────────────────┘
                           │ SELECT (usuario RO)
                           │ 3×/día · cron 0 6,12,20 * * *
        ┌──────────────────▼──────────────────┐
        │ Cloud Scheduler → Cloud Run Job      │
        │ dcsmart-etl (extracción incremental  │
        │ por updated_at + MERGE + validación) │
        └──────────────────┬──────────────────┘
                           ▼
        ┌─────────────────────────────────────┐
        │ BigQuery: dataset dcsmart_analytics │
        │ raw_* particionadas por fecha       │
        │ vw_pagos / vw_cajas / vw_flujo_caja │
        │ etl_runs (cuadratura por corte)     │
        └──────────────────┬──────────────────┘
                           │ consultas
        ┌──────────────────▼──────────────────┐     ┌─────────────────────┐
        │ Cloud Run: dcsmart-analytics-api    │────▶│ Vertex AI            │
        │ auth vs tabla users (RO) ·          │     │ Gemini Flash (IAM)   │
        │ accesos/presets/log en DB propia    │     └─────────────────────┘
        │ "dcsmart_analytics" (misma instancia│
        │  Cloud SQL, base NUEVA)             │
        └──────────────────┬──────────────────┘
                           ▼
        Firebase Hosting (sitio nuevo) → analisis.dcsmart.app
        Login · Sidebar de informes preseteados · Explorador
        con filtros · Análisis IA · Admin de usuarios
```

### Por qué esto no toca producción

| Recurso nuevo | Relación con producción |
|---|---|
| Usuario PostgreSQL `analytics_ro` | Solo `GRANT SELECT` sobre tablas existentes. Con `statement_timeout=15s`. |
| Base `dcsmart_analytics` (misma instancia) | Base **nueva**: accesos, presets, log de consultas IA. La base `postgres` (producción) no se altera. |
| Dataset BigQuery `dcsmart_analytics` | Copia analítica; la app nunca lo ve. |
| Cloud Run Job `dcsmart-etl` + Scheduler | Solo lee, 3 ventanas diarias, conector oficial de Cloud SQL (no cambia la red/IP pública actual). |
| Cloud Run `dcsmart-analytics-api` | Servicio separado del `dcsmart-backend`. |
| Sitio Firebase Hosting `dcsmart-analytics` | Sitio adicional del mismo proyecto → dominio propio `analisis.dcsmart.app`. |

---

## Acceso y usuarios (reutilizando la tabla original)

1. **Login** en `analisis.dcsmart.app` con las mismas credenciales de DCSmart: la API valida `email + password_hash` (bcrypt) leyendo la tabla `users` con el usuario RO. Google OAuth se puede sumar después con el mismo client id.
2. **Quién entra:** por defecto, los roles definidos en `ANALYTICS_ALLOWED_ROLES` (default: `super_admin,dcsmart` — el perfil "DCADMIN"). El rol se resuelve vía `user_app_roles → roles.nombre`, igual que la app.
3. **Admin de usuarios:** pantalla "Usuarios" (visible solo para DCADMIN) que lista los usuarios reales de la tabla original y permite **habilitar/deshabilitar** acceso individual a la plataforma. Esos grants viven en `dcsmart_analytics.access_grants` — nunca se escribe en la base original. Regla efectiva: `puede entrar = (rol permitido O grant explícito) Y activo Y no revocado`.
4. La API de analytics firma **su propio JWT** (`ANALYTICS_JWT_SECRET`, distinto del de producción) con `{id, email, rol, admin}`.

## Sidebar de informes preseteados

Los presets viven en la tabla `dcsmart_analytics.presets` (no hardcodeados): nombre, ícono, dataset, filtros default, configuración de gráficos y prompt IA sugerido. La API los expone en `GET /presets` y los DCADMIN pueden crear/editar los suyos (`POST/PUT`). Seed inicial:

| Informe | Dataset | Qué muestra |
|---|---|---|
| Flujo de caja por corte | vw_flujo_caja | Ingresos (cajas) vs egresos (pagos) por local en cada corte 06/12/20 |
| Egresos por rubro | pagos | Ranking + evolución mensual por rubro |
| Comparativa de locales | ambos | Ventas y gastos lado a lado por local |
| Pagos pendientes | pagos | Deuda por proveedor y antigüedad |
| Ventas por turno | cajas | Turnos, tickets, efectivo vs fiscal |

## Flujo de análisis (2 pasos, igual que el MVP)

**Paso 1:** el usuario entra por un preset del sidebar o por el explorador, y ajusta filtros (fechas, local, rubro, proveedor, estado, cajero…). La API traduce filtros a SQL **parametrizado** sobre las vistas de BigQuery (el LLM nunca genera SQL).
**Paso 2:** "Analizar con IA" envía agregados + muestra acotada de filas al endpoint `/ai`, que llama a **Gemini Flash en Vertex AI** (autenticación por IAM de la cuenta de servicio — sin API key) y loguea usuario, filtros, prompt y tokens en `ai_queries`.

---

## Pipeline ETL (detalle)

- **Programación:** Cloud Scheduler `0 6,12,20 * * *`, timezone `America/Argentina/Buenos_Aires`, dispara el Cloud Run Job `dcsmart-etl`.
- **Extracción incremental:** por tabla, `WHERE updated_at > watermark` (watermark en `etl_watermarks` de BigQuery). Primera corrida = full. Dimensiones chicas (`locales`, `proveedores`, `rubcat`, `metodos_pago`, `detalle_tipos`) se refrescan completas en cada corte.
- **Carga:** NDJSON → tabla staging → `MERGE` por `id` en las tablas raw (soporta updates y borrados lógicos futuros).
- **Particionado (FinOps):** `raw_pagos` particionada por `DATE(fecha)` y clusterizada por `id_local, rubro`; `raw_cajas` por `DATE(fecha_inicio)` clusterizada por `id_local`. Las consultas del tablero siempre filtran por fecha → escanean solo las particiones necesarias.
- **Validación por corte (f_post):** al final de cada corrida se compara `COUNT` y `SUM(importe)/SUM(total)` entre Postgres y BigQuery para la ventana procesada y se registra en `etl_runs` con estado `OK / MISMATCH`. Un mismatch no corta el servicio: queda visible en el header del tablero ("último corte: 12:00 — cuadratura OK").

## Estructura del proyecto

```
dcsmart-analytics/
├── infra/            # scripts gcloud numerados (ejecutar en orden)
├── etl/              # Cloud Run Job de extracción (Node 20)
│   └── sql/          # DDL BigQuery: tablas, vistas, validación
├── backend/          # dcsmart-analytics-api (Fastify, Node 20)
└── frontend/         # dcsmart-analytics-api client: React + Vite (login, sidebar, explorador, admin)
```

## Puesta en marcha

```bash
# 0. Variables
export PROJECT=dc-smart-mvp REGION=us-central1
export INSTANCE=dc-smart-mvp:us-central1:dcsmart-mvp-insta

# 1. Usuario RO y base propia (una vez, vía Cloud SQL Proxy) — ver infra/00_postgres.sql
# 2. BigQuery: bash infra/01_bigquery.sh
# 3. Cuentas de servicio + secretos: bash infra/02_service_accounts.sh
# 4. ETL job + scheduler (cron 0 6,12,20): bash infra/03_etl_job.sh
# 5. API analytics: bash infra/04_backend.sh
# 6. Hosting + dominio analisis.dcsmart.app: bash infra/05_frontend_hosting.sh
```

## Desarrollo local

```bash
# Backend (requiere Cloud SQL Auth Proxy corriendo en 127.0.0.1:5432 y
# `gcloud auth application-default login` para BigQuery/Vertex AI)
cd backend && cp .env.example .env   # completar PGPASSWORD_RO/APP y ANALYTICS_JWT_SECRET
npm install && npm run dev           # http://localhost:8080

# Frontend (React + Vite; el dev server proxea /api -> localhost:8080)
cd frontend
npm install && npm run dev           # http://localhost:5173
```

## Costos estimados (mensual)

| Concepto | Estimación |
|---|---|
| Cloud Run Job ETL (3 corridas/día × ~2 min) | < USD 1 |
| BigQuery storage (< 5 GB primeros años) | < USD 1 |
| BigQuery queries (particionado, uso interno) | USD 1–10 |
| Cloud Run API (scale to zero) | USD 0–5 |
| Vertex AI Gemini Flash (~200 análisis/mes) | < USD 1 |
| **Total** | **~USD 3–15/mes** |
