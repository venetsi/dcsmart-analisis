#!/usr/bin/env bash
# 03 — Cloud Run Job del ETL + Cloud Scheduler (cron 0 6,12,20 * * *)
set -euo pipefail
PROJECT=${PROJECT:-dc-smart-mvp}
REGION=${REGION:-us-central1}
INSTANCE=${INSTANCE:-dc-smart-mvp:us-central1:dcsmart-mvp-insta}

# Build de la imagen del ETL
gcloud builds submit ../etl --project=$PROJECT \
  --tag $REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/dcsmart-etl:latest

# Job (el conector de Cloud SQL NO requiere tocar la red de la instancia)
gcloud run jobs deploy dcsmart-etl --project=$PROJECT --region=$REGION \
  --image $REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/dcsmart-etl:latest \
  --service-account dcsmart-etl@$PROJECT.iam.gserviceaccount.com \
  --set-cloudsql-instances $INSTANCE \
  --set-env-vars "PGHOST=/cloudsql/$INSTANCE,PGDATABASE=postgres,PGUSER=analytics_ro,BQ_PROJECT=$PROJECT,BQ_DATASET=dcsmart_analytics" \
  --set-secrets "PGPASSWORD=analytics-ro-password:latest" \
  --max-retries 1 --task-timeout 900

# Scheduler: 3 cortes diarios hora Argentina
gcloud scheduler jobs create http dcsmart-etl-trigger --project=$PROJECT --location=$REGION \
  --schedule="0 7,15,23 * * *" --time-zone="America/Argentina/Buenos_Aires" \
  --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT/jobs/dcsmart-etl:run" \
  --http-method=POST \
  --oauth-service-account-email=dcsmart-etl@$PROJECT.iam.gserviceaccount.com || \
gcloud scheduler jobs update http dcsmart-etl-trigger --project=$PROJECT --location=$REGION \
  --schedule="0 7,15,23 * * *" --time-zone="America/Argentina/Buenos_Aires"
echo "✓ ETL job + scheduler (07:00, 15:00, 23:00 AR)"
