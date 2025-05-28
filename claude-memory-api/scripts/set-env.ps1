# set-env.ps1 - Set environment variables
param(
    [Parameter(Mandatory=$true)]
    [string]$ApiKey,
    [string]$ProjectId = "talkstudio-fb",
    [string]$Region = "us-east4",
    [string]$ServiceName = "claude-memory-api"
)

Write-Host "🔑 Setting ANTHROPIC_API_KEY..." -ForegroundColor Yellow
gcloud run services update $ServiceName `
    --region=$Region `
    --set-env-vars="ANTHROPIC_API_KEY=$ApiKey"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ API key set successfully" -ForegroundColor Green
} else {
    Write-Error "Failed to set API key"
}