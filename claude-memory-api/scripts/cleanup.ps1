# cleanup.ps1 - Clean up resources
param(
    [string]$ProjectId = "talkstudio-fb",
    [string]$Region = "us-east4",
    [string]$ServiceName = "claude-memory-api",
    [switch]$Force
)

if (-not $Force) {
    $confirm = Read-Host "Are you sure you want to delete all resources? (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "Cleanup cancelled" -ForegroundColor Yellow
        exit 0
    }
}

Write-Host "🧹 Cleaning up resources..." -ForegroundColor Red

# Delete Cloud Run service
Write-Host "Deleting Cloud Run service..." -ForegroundColor Yellow
gcloud run services delete $ServiceName --region=$Region --quiet

# Delete Artifact Registry repository
Write-Host "Deleting Artifact Registry repository..." -ForegroundColor Yellow
gcloud artifacts repositories delete claude-memory --location=$Region --quiet

# Delete Cloud Storage bucket
Write-Host "Deleting Cloud Storage bucket..." -ForegroundColor Yellow
$bucketName = "$ProjectId-memory-data"
gsutil rm -r gs://$bucketName 2>$null

Write-Host "✅ Cleanup completed" -ForegroundColor Green