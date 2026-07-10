#!/usr/bin/env bash
# 01 — Dataset y tablas BigQuery (particionadas + clusterizadas)
set -euo pipefail
PROJECT=${PROJECT:-dc-smart-mvp}
REGION=${REGION:-us-central1}

bq --project_id=$PROJECT mk --location=$REGION --dataset \
  --description "DCSmart Analytics - copia analitica de pagos y cajas" \
  dcsmart_analytics || true

# Tablas raw, dims, watermarks, runs y vistas
bq --project_id=$PROJECT query --use_legacy_sql=false < ../etl/sql/01_tables.sql
bq --project_id=$PROJECT query --use_legacy_sql=false < ../etl/sql/02_views.sql
echo "✓ BigQuery listo"
