#!/usr/bin/env bash
# Ambiente de DEV de Analytics (creado el 2026-09-25). Espeja al de gestión:
#
#   pieza            prod                          dev
#   ---------------  ----------------------------  ---------------------------------
#   frontend         sitio dcsmart-analytics       sitio dcsmart-analytics-dev
#                    (analisis.dcsmart.app)        (https://dcsmart-analytics-dev.web.app)
#   API              dcsmart-analytics-api         dcsmart-analytics-api-dev
#   usuarios/cajas   base postgres                 base dcsmart_dev (copia de prod de gestión)
#   base propia      dcsmart_analytics             dcsmart_analytics_dev (copia)
#   usuario de base  analytics_ro / analytics_app  dcsmart_dev_app (SIN acceso a las bases de prod)
#   BigQuery         dcsmart_analytics             el MISMO dataset: la API solo hace SELECT
#
# Lo que se prueba en dev (accesos, reporte manual, presets) queda en
# dcsmart_analytics_dev. BigQuery se comparte porque la API no escribe ahí y
# los reportes necesitan los datos del ETL, que corre solo en prod.
#
# Secretos propios de dev: analytics-dev-db-password (la de dcsmart_dev_app) y
# analytics-dev-jwt-secret (un token de dev no sirve en prod). El SSO desde
# gestión usa internal-shared-secret, igual que prod.
#
# Para refrescar la base propia desde prod (borra lo cargado en dev):
#   pg_dump -Fc --no-owner --no-privileges -d dcsmart_analytics > a.dump
#   dropdb dcsmart_analytics_dev && createdb -O dcsmart_dev_app dcsmart_analytics_dev
#   pg_restore --no-owner --role=dcsmart_dev_app -d dcsmart_analytics_dev a.dump
set -euo pipefail
PROJECT=${PROJECT:-dc-smart-mvp}
REGION=${REGION:-us-central1}
INSTANCE=${INSTANCE:-dc-smart-mvp:us-central1:dcsmart-mvp-insta}
TAG=${TAG:-dev}
IMAGE=$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/dcsmart-analytics-api:$TAG

# ── API ──────────────────────────────────────────────────────────────────────
gcloud builds submit ../backend --project=$PROJECT --tag "$IMAGE"
gcloud run deploy dcsmart-analytics-api-dev --project=$PROJECT --region=$REGION \
  --image "$IMAGE" \
  --service-account dcsmart-analytics-api@$PROJECT.iam.gserviceaccount.com \
  --add-cloudsql-instances $INSTANCE \
  --set-env-vars "^|^PGHOST=/cloudsql/$INSTANCE|DCSMART_DB=dcsmart_dev|ANALYTICS_DB=dcsmart_analytics_dev|PGUSER_RO=dcsmart_dev_app|PGUSER_APP=dcsmart_dev_app|BQ_PROJECT=$PROJECT|BQ_DATASET=dcsmart_analytics|ANALYTICS_ALLOWED_ROLES=super_admin;dcsmart|FRONTEND_ORIGIN=https://dcsmart-analytics-dev.web.app|VERTEX_LOCATION=$REGION|AI_MODEL=gemini-2.5-flash|GOOGLE_CLIENT_ID=288069746644-9m0lq9tkh3lgcr2c7tkdb1ncltegbido.apps.googleusercontent.com|AMBIENTE=dev" \
  --set-secrets "PGPASSWORD_RO=analytics-dev-db-password:latest,PGPASSWORD_APP=analytics-dev-db-password:latest,ANALYTICS_JWT_SECRET=analytics-dev-jwt-secret:latest,INTERNAL_SHARED_SECRET=internal-shared-secret:latest" \
  --allow-unauthenticated --min-instances 0 --max-instances 2
gcloud run services update-traffic dcsmart-analytics-api-dev --project=$PROJECT --region=$REGION --to-latest
echo "✓ API de dev desplegada"

# ── Frontend ─────────────────────────────────────────────────────────────────
( cd ../frontend && npm ci && VITE_APP_ENV=dev npm run build )
firebase hosting:sites:create dcsmart-analytics-dev --project $PROJECT || true
cd ..
firebase deploy --only hosting:analytics-dev --project $PROJECT
echo "✓ Frontend de dev en https://dcsmart-analytics-dev.web.app"
