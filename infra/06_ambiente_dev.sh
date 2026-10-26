#!/usr/bin/env bash
# Ambiente de DEV de Analytics (creado el 2026-09-25). Espeja al de gestión:
#
#   pieza            prod                          dev
#   ---------------  ----------------------------  ---------------------------------
#   frontend         sitio dcsmart-analytics       sitio dcsmart-analytics-dev
#                    (analisis.dcsmart.app)        (https://dcsmart-analytics-dev.web.app)
#   API              dcsmart-analytics-api         dcsmart-analytics-api-dev
#   instancia SQL    dcsmart-mvp-insta             dev-gestion-dcsmart (propia de dev)
#   usuarios/cajas   base postgres                 base dcsmart_dev (copia de prod de gestión)
#   base propia      dcsmart_analytics             dcsmart_analytics_dev (copia)
#   usuario de base  analytics_ro / analytics_app  dcsmart_dev_app (SIN acceso a las bases de prod)
#   BigQuery         dcsmart_analytics             el MISMO dataset: la API solo hace SELECT
#
# Desde el 2026-10-09 lo de dev (dcsmart_dev y dcsmart_analytics_dev) vive en
# la instancia de Cloud SQL propia dev-gestion-dcsmart, separada de la de prod
# para dejar esa instancia solo con prod. Las bases y dcsmart_dev_app (dueño de
# las dos) conservan nombre y clave. El admin de esa instancia es dev_admin (su
# clave no se versiona).
#
# Lo que se prueba en dev (accesos, reporte manual, presets) queda en
# dcsmart_analytics_dev. BigQuery se comparte porque la API no escribe ahí y
# los reportes necesitan los datos del ETL, que corre solo en prod.
#
# Secretos propios de dev: analytics-dev-db-password (la de dcsmart_dev_app) y
# analytics-dev-jwt-secret (un token de dev no sirve en prod). El SSO desde
# gestión usa internal-shared-secret, igual que prod.
#
# Para refrescar la base propia desde prod (borra lo cargado en dev). El dump
# sale de la instancia de prod (solo lectura) y todo lo demás se hace en la de
# dev con dev_admin. Con un solo proxy para las dos (puertos de ejemplo):
#   cloud-sql-proxy --address 127.0.0.1 \
#     "dc-smart-mvp:us-central1:dcsmart-mvp-insta?port=5436" \
#     "dc-smart-mvp:us-central1:dev-gestion-dcsmart?port=5437"
#   pg_dump -h 127.0.0.1 -p 5436 -U postgres -Fc --no-owner --no-privileges -d dcsmart_analytics -f a.dump &&
#   dropdb   -h 127.0.0.1 -p 5437 -U dev_admin --if-exists dcsmart_analytics_dev &&
#   createdb -h 127.0.0.1 -p 5437 -U dev_admin -O dcsmart_dev_app dcsmart_analytics_dev &&
#   pg_restore -h 127.0.0.1 -p 5437 -U dev_admin --no-owner --role=dcsmart_dev_app -d dcsmart_analytics_dev a.dump
# Van encadenados con && para que, si el dump falla (usuario, clave, proxy), no
# se borre la base de dev. Las dos instancias son PG18: usar pg_dump/pg_restore
# 18 (un pg_dump 17 se niega a leer un servidor 18).
# createdb -O y pg_restore --role exigen (PG16+) que dev_admin pueda hacer
# SET ROLE dcsmart_dev_app; si da "must be able to SET ROLE": GRANT dcsmart_dev_app TO dev_admin.
#
# GRANT en los SQL de la base propia (infra/00*.sql): en dev el dueño de las
# tablas es dcsmart_dev_app y los roles de prod no se usan. Todo GRANT nuevo a
# un rol de prod (analytics_app, analytics_ro) va con guarda IF EXISTS, como en
# 00d_informe_mensual.sql. En dev-gestion-dcsmart existe analytics_app NOLOGIN
# solo para que no fallen los SQL viejos que lo tienen sin guarda (00c).
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
# Si el servicio no se puede leer (token vencido, permisos, un corte, o que
# todavía no exista) el script corta en vez de seguir con la lista vacía, que
# la borraría sin aviso. Para dejarla vacía a propósito: export TV_EMAILS=
# (definida aunque vacía, no se lee del servicio).
if [ -z "${TV_EMAILS+x}" ]; then
  if ! ENV_ACTUAL=$(gcloud run services describe dcsmart-analytics-api-dev --project=$PROJECT --region=$REGION \
      --flatten='spec.template.spec.containers[0].env' \
      --format='value(spec.template.spec.containers[0].env.name,spec.template.spec.containers[0].env.value)'); then
    echo "✗ No se pudo leer TV_EMAILS de dcsmart-analytics-api-dev (el error de gcloud está arriba)." >&2
    echo "  No se despliega: seguir con la lista vacía la borraría. Pasala a mano y volvé a correr:" >&2
    echo "  export TV_EMAILS='a@dominio.com,b@dominio.com'   (o export TV_EMAILS= para dejarla vacía)" >&2
    exit 1
  fi
  TV_EMAILS=$(printf '%s\n' "$ENV_ACTUAL" | awk -F'\t' '$1 == "TV_EMAILS" { print $2 }')
  if [ -n "$TV_EMAILS" ]; then
    echo "· TV_EMAILS no está en el entorno: se conserva la lista que tiene hoy dcsmart-analytics-api-dev"
  fi
fi
if [ -z "$TV_EMAILS" ]; then
  echo "⚠ TV_EMAILS vacía: el dashboard de la TV en dev queda solo para usuarios DC (super_admin/dcsmart)." >&2
  echo "  Para sumar mails: export TV_EMAILS='a@dominio.com,b@dominio.com' y volvé a correr." >&2
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
