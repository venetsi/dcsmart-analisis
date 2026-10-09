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
# Instancia de Cloud SQL de DEV. Variable propia a propósito: el README exporta
# INSTANCE con la de prod para los scripts 00-05, y si este script la usara,
# re-correrlo volvería a colgar la API de dev de la instancia de prod. El deploy
# usa --set-cloudsql-instances (no --add): reemplaza la lista entera, así la de
# prod no queda conectada de un deploy anterior.
DEV_INSTANCE=${DEV_INSTANCE:-dc-smart-mvp:us-central1:dev-gestion-dcsmart}
case "$DEV_INSTANCE" in
  *dcsmart-mvp-insta*)
    echo "✗ DEV_INSTANCE=$DEV_INSTANCE es la instancia de PROD. Dev vive en dev-gestion-dcsmart:" >&2
    echo "  unset DEV_INSTANCE (o exportala con dc-smart-mvp:us-central1:dev-gestion-dcsmart) y volvé a correr." >&2
    exit 1 ;;
esac
TAG=${TAG:-dev}
IMAGE=$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/dcsmart-analytics-api:$TAG

# TV_EMAILS: mails que entran al dashboard de la TV sin ser usuarios DC (ver
# backend/src/lib/tvAcceso.js). No se versiona: se toma del entorno y, si no
# está, se conserva la que tiene hoy el servicio. --set-env-vars reemplaza TODAS
# las variables, así que sin esto re-correr el script la borraría.
if [ -z "${TV_EMAILS:-}" ]; then
  TV_EMAILS=$(gcloud run services describe dcsmart-analytics-api-dev --project=$PROJECT --region=$REGION \
      --flatten='spec.template.spec.containers[0].env' \
      --format='value(spec.template.spec.containers[0].env.name,spec.template.spec.containers[0].env.value)' 2>/dev/null \
    | awk -F'\t' '$1 == "TV_EMAILS" { print $2 }') || TV_EMAILS=
  if [ -n "$TV_EMAILS" ]; then
    echo "· TV_EMAILS no está en el entorno: se conserva la lista que tiene hoy dcsmart-analytics-api-dev"
  else
    echo "⚠ TV_EMAILS vacía: el dashboard de la TV en dev queda solo para usuarios DC (super_admin/dcsmart)." >&2
    echo "  Para sumar mails: export TV_EMAILS='a@dominio.com,b@dominio.com' y volvé a correr." >&2
  fi
fi

# ── API ──────────────────────────────────────────────────────────────────────
gcloud builds submit ../backend --project=$PROJECT --tag "$IMAGE"
gcloud run deploy dcsmart-analytics-api-dev --project=$PROJECT --region=$REGION \
  --image "$IMAGE" \
  --service-account dcsmart-analytics-api@$PROJECT.iam.gserviceaccount.com \
  --set-cloudsql-instances "$DEV_INSTANCE" \
  --set-env-vars "^|^PGHOST=/cloudsql/$DEV_INSTANCE|DCSMART_DB=dcsmart_dev|ANALYTICS_DB=dcsmart_analytics_dev|PGUSER_RO=dcsmart_dev_app|PGUSER_APP=dcsmart_dev_app|BQ_PROJECT=$PROJECT|BQ_DATASET=dcsmart_analytics|ANALYTICS_ALLOWED_ROLES=super_admin;dcsmart|FRONTEND_ORIGIN=https://dcsmart-analytics-dev.web.app|VERTEX_LOCATION=$REGION|AI_MODEL=gemini-2.5-flash|GOOGLE_CLIENT_ID=288069746644-9m0lq9tkh3lgcr2c7tkdb1ncltegbido.apps.googleusercontent.com|AMBIENTE=dev|TV_EMAILS=$TV_EMAILS" \
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
