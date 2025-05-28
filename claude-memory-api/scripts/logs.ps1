# logs.ps1 - View service logs
param(
    [string]$ProjectId = "talkstudio-fb",
    [string]$Region = "us-east4", 
    [string]$ServiceName = "claude-memory-api",
    [int]$Lines = 50,
    [switch]$Follow
)

Write-Host "📋 Viewing logs for $ServiceName..." -ForegroundColor Yellow

if ($Follow) {
    Write-Host "Following logs (Ctrl+C to stop)..." -ForegroundColor Gray
    gcloud run services logs tail $ServiceName --region=$Region
} else {
    Write-Host "Showing last $Lines log entries..." -ForegroundColor Gray
    gcloud run services logs read $ServiceName --region=$Region --limit=$Lines
}