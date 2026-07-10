#!/usr/bin/env bash
# 04 — API analytics en Cloud Run (servicio separado del backend de producción)
set -euo pipefail
PROJECT=${PROJECT:-dc-smart-mvp}
REGION=${REGION:-us-central1}
INSTANCE=${INSTANCE:-dc-smart-mvp:us-central1:dcsmart-mvp-insta}

gcloud builds submit ../backend --project=$PROJECT \
  --tag $REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/dcsmart-analytics-api:latest

gcloud run deploy dcsmart-analytics-api --project=$PROJECT --region=$REGION \
  --image $REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/dcsmart-analytics-api:latest \
  --service-account dcsmart-analytics-api@$PROJECT.iam.gserviceaccount.com \
  --add-cloudsql-instances $INSTANCE \
  --set-env-vars "PGHOST=/cloudsql/$INSTANCE,DCSMART_DB=postgres,ANALYTICS_DB=dcsmart_analytics,PGUSER_RO=analytics_ro,PGUSER_APP=analytics_app,BQ_PROJECT=$PROJECT,BQ_DATASET=dcsmart_analytics,ANALYTICS_ALLOWED_ROLES=super_admin;dcsmart,FRONTEND_ORIGIN=https://analisis.dcsmart.app,VERTEX_LOCATION=$REGION,AI_MODEL=gemini-2.5-flash" \
  --set-secrets "PGPASSWORD_RO=analytics-ro-password:latest,PGPASSWORD_APP=analytics-app-password:latest,ANALYTICS_JWT_SECRET=analytics-jwt-secret:latest" \
  --allow-unauthenticated --min-instances 0 --max-instances 3
echo "✓ API desplegada"
