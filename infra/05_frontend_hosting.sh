#!/usr/bin/env bash
# 05 — Sitio nuevo de Firebase Hosting + dominio analisis.dcsmart.app
set -euo pipefail
PROJECT=${PROJECT:-dc-smart-mvp}

# Build del frontend (React + Vite) -> frontend/dist, que es lo que firebase.json publica
( cd ../frontend && npm install && npm run build )

# Sitio adicional en el MISMO proyecto (no toca el sitio actual)
firebase hosting:sites:create dcsmart-analytics --project $PROJECT || true

# firebase.json vive en la RAÍZ del repo (firebase-tools no permite public fuera del project dir)
cd ..
firebase target:apply hosting analytics dcsmart-analytics --project $PROJECT
firebase deploy --only hosting:analytics --project $PROJECT

echo ">>> Último paso manual (una vez):"
echo "Firebase Console → Hosting → sitio dcsmart-analytics → 'Agregar dominio personalizado'"
echo "→ analisis.dcsmart.app → agregar el registro CNAME/A que indique en el DNS de dcsmart.app"
