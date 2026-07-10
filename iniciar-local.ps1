# DCSmart Analytics — arranque local completo
# Abre 3 ventanas: túnel Cloud SQL, backend (8080) y frontend (5173),
# y después abre el navegador. Cerrá las ventanas para apagar los servicios.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

$proxy = "cloud-sql-proxy --gcloud-auth --port 5433 dc-smart-mvp:us-central1:dcsmart-mvp-insta"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $proxy

Start-Sleep -Seconds 3

Start-Process powershell -WorkingDirectory "$root\backend" -ArgumentList "-NoExit", "-Command", "node src/server.js"
Start-Process powershell -WorkingDirectory "$root\frontend" -ArgumentList "-NoExit", "-Command", "npm run dev"

Start-Sleep -Seconds 4
Start-Process "http://localhost:5173"
Write-Host "Listo: tunel (5433) + backend (8080) + frontend (5173)."
