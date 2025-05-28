# status.ps1 - Check deployment status
param(
    [string]$ProjectId = "talkstudio-fb",
    [string]$Region = "us-east4",
    [string]$ServiceName = "claude-memory-api"
)

Write-Host "📊 Checking deployment status..." -ForegroundColor Yellow

# Service status
Write-Host "`n🏃 Cloud Run Service:" -ForegroundColor Cyan
gcloud run services describe $ServiceName --region=$Region --format="table(
    metadata.name,
    status.url,
    status.conditions[0].type,
    spec.template.spec.containers[0].image
)"

# Recent deployments
Write-Host "`n📈 Recent Revisions:" -ForegroundColor Cyan
gcloud run revisions list --service=$ServiceName --region=$Region --limit=3 --format="table(
    metadata.name,
    status.conditions[0].lastTransitionTime.date(),
    spec.containers[0].image.split('/').slice(-1).join(),
    status.allocation
)"

# Storage bucket
Write-Host "`n🪣 Storage Bucket:" -ForegroundColor Cyan
$bucketName = "$ProjectId-memory-data"
gsutil ls -L gs://$bucketName 2>$null | Select-String "Creation time|Storage class|Location"