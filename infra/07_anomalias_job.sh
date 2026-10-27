#!/usr/bin/env bash
# 07 — Control quincenal de datos (job dcsmart-anomalias, ver anomalias/).
#
# Crea recursos NUEVOS en el proyecto de prod: correrlo solo con el OK de la
# dirección. No toca la base de producción ni el dataset dcsmart_analytics.
#
#   recurso                         para qué
#   ------------------------------  ---------------------------------------------
#   dataset dcsmart_anomalias       tabla `hallazgos` (una fila por hallazgo y corrida)
#   SA dcsmart-anomalias            lee dcsmart_analytics_cdc, escribe dcsmart_anomalias
#   Cloud Run Job dcsmart-anomalias corre en MODO SECO hasta cambiar las variables
#   Scheduler dcsmart-anomalias-trigger  días 3 y 18 a las 8:00 (Argentina)
#
# Orden recomendado (ver README, sección "Control quincenal de datos"):
#   1. este script con SCHEDULER=0 (default): crea todo menos el Scheduler
#   2. gcloud run jobs execute dcsmart-anomalias  → mirar el mail en los logs
#   3. probar el envío real a una sola persona:
#        gcloud run jobs execute dcsmart-anomalias --update-env-vars \
#          ANOMALIAS_GUARDAR=1,ANOMALIAS_ENVIAR_REAL=1,ANOMALIAS_DESTINO=<mail>
#   4. SCHEDULER=1 DESTINO=<mails> ./07_anomalias_job.sh  → deja programado el envío real
set -euo pipefail
PROJECT=${PROJECT:-dc-smart-mvp}
REGION=${REGION:-us-central1}
SCHEDULER=${SCHEDULER:-0}
DESTINO=${DESTINO:-}
SA=dcsmart-anomalias@$PROJECT.iam.gserviceaccount.com
IMAGE=$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/dcsmart-anomalias:latest

# ── Dataset y tabla ──────────────────────────────────────────────────────────
bq --project_id=$PROJECT mk --location=$REGION --dataset \
  --description "Hallazgos del control quincenal de datos (job dcsmart-anomalias)" \
  dcsmart_anomalias || true
bq --project_id=$PROJECT query --use_legacy_sql=false < ../anomalias/sql/01_hallazgos.sql

# ── Cuenta de servicio: lee el CDC, escribe solo su dataset ──────────────────
gcloud iam service-accounts create dcsmart-anomalias --project=$PROJECT \
  --display-name="DCSmart control quincenal de datos" || true
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:$SA" --role=roles/bigquery.jobUser --condition=None -q
bq add-iam-policy-binding --member="serviceAccount:$SA" --role=roles/bigquery.dataViewer \
  $PROJECT:dcsmart_analytics_cdc
bq add-iam-policy-binding --member="serviceAccount:$SA" --role=roles/bigquery.dataEditor \
  $PROJECT:dcsmart_anomalias
# la misma clave de EnvíaloSimple que usa gestión
gcloud secrets add-iam-policy-binding envialosimple-api-key --project=$PROJECT \
  --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor

# ── Imagen y job (modo seco) ─────────────────────────────────────────────────
gcloud builds submit ../anomalias --project=$PROJECT --tag "$IMAGE"
gcloud run jobs deploy dcsmart-anomalias --project=$PROJECT --region=$REGION \
  --image "$IMAGE" --service-account "$SA" \
  --set-env-vars "BQ_PROJECT=$PROJECT,BQ_DATASET_CDC=dcsmart_analytics_cdc,BQ_DATASET_ANOMALIAS=dcsmart_anomalias,ANOMALIAS_GUARDAR=0,ANOMALIAS_ENVIAR_REAL=0" \
  --set-secrets "ENVIALOSIMPLE_API_KEY=envialosimple-api-key:latest" \
  --max-retries 0 --task-timeout 900
echo "✓ job dcsmart-anomalias en modo seco"

if [ "$SCHEDULER" != "1" ]; then
  echo "Scheduler NO creado (SCHEDULER=1 para crearlo, con DESTINO=<mails separados por coma>)"
  exit 0
fi
if [ -z "$DESTINO" ]; then echo "Falta DESTINO"; exit 1; fi

# ── Envío real + Scheduler ───────────────────────────────────────────────────
# Las variables con coma (DESTINO) van con otro separador: ^|^
gcloud run jobs update dcsmart-anomalias --project=$PROJECT --region=$REGION \
  --update-env-vars "^|^ANOMALIAS_GUARDAR=1|ANOMALIAS_ENVIAR_REAL=1|ANOMALIAS_DESTINO=$DESTINO"
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:$SA" --role=roles/run.invoker --condition=None -q
gcloud scheduler jobs create http dcsmart-anomalias-trigger --project=$PROJECT --location=$REGION \
  --schedule="0 8 3,18 * *" --time-zone="America/Argentina/Buenos_Aires" \
  --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT/jobs/dcsmart-anomalias:run" \
  --http-method=POST --oauth-service-account-email="$SA" || \
gcloud scheduler jobs update http dcsmart-anomalias-trigger --project=$PROJECT --location=$REGION \
  --schedule="0 8 3,18 * *" --time-zone="America/Argentina/Buenos_Aires"
echo "✓ envío real programado los días 3 y 18 a las 8:00 (AR) a: $DESTINO"
