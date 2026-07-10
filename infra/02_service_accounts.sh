#!/usr/bin/env bash
# 02 — Cuentas de servicio y secretos
set -euo pipefail
PROJECT=${PROJECT:-dc-smart-mvp}

# SA del ETL: lee Cloud SQL, escribe BigQuery
gcloud iam service-accounts create dcsmart-etl --project=$PROJECT \
  --display-name="DCSmart ETL a BigQuery" || true
for ROLE in roles/cloudsql.client roles/bigquery.dataEditor roles/bigquery.jobUser; do
  gcloud projects add-iam-policy-binding $PROJECT \
    --member="serviceAccount:dcsmart-etl@$PROJECT.iam.gserviceaccount.com" \
    --role=$ROLE --condition=None -q
done

# SA de la API: lee BigQuery, lee Cloud SQL (auth), lee secretos
gcloud iam service-accounts create dcsmart-analytics-api --project=$PROJECT \
  --display-name="DCSmart Analytics API" || true
for ROLE in roles/cloudsql.client roles/bigquery.dataViewer roles/bigquery.jobUser roles/secretmanager.secretAccessor roles/aiplatform.user; do
  gcloud projects add-iam-policy-binding $PROJECT \
    --member="serviceAccount:dcsmart-analytics-api@$PROJECT.iam.gserviceaccount.com" \
    --role=$ROLE --condition=None -q
done

# Habilitar Vertex AI (Gemini) — la IA se autentica por IAM, sin API key
gcloud services enable aiplatform.googleapis.com --project=$PROJECT

# Secretos de base de datos y JWT (la IA NO necesita secreto: usa IAM)
echo -n "CAMBIAR_PASSWORD_SEGURO"    | gcloud secrets create analytics-ro-password    --data-file=- --project=$PROJECT || true
echo -n "CAMBIAR_PASSWORD_SEGURO_2"  | gcloud secrets create analytics-app-password   --data-file=- --project=$PROJECT || true
echo -n "GENERAR_SECRET_LARGO"       | gcloud secrets create analytics-jwt-secret     --data-file=- --project=$PROJECT || true
echo "✓ SAs y secretos creados (cargar valores reales con: gcloud secrets versions add)"
