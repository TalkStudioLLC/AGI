# test-api.ps1 - Test the deployed API
param(
    [string]$ProjectId = "talkstudio-fb",
    [string]$Region = "us-east4",
    [string]$ServiceName = "claude-memory-api"
)

Write-Host "🧪 Testing Claude Memory API..." -ForegroundColor Yellow

# Get service URL
$serviceUrl = gcloud run services describe $ServiceName --region=$Region --format="value(status.url)"

if (-not $serviceUrl) {
    Write-Error "Could not get service URL"
    exit 1
}

Write-Host "Service URL: $serviceUrl" -ForegroundColor Cyan

# Test health endpoint
Write-Host "`n🏥 Testing health endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$serviceUrl/health" -Method Get
    Write-Host "✅ Health: $($health.status)" -ForegroundColor Green
    Write-Host "Timestamp: $($health.timestamp)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test memory endpoints
Write-Host "`n🧠 Testing memory endpoints..." -ForegroundColor Yellow

# Test remember
$rememberPayload = @{
    content = "PowerShell deployment test"
    context = "testing"
    emotional_weight = 0.8
} | ConvertTo-Json

try {
    $rememberResponse = Invoke-RestMethod -Uri "$serviceUrl/api/remember" -Method Post -Body $rememberPayload -ContentType "application/json"
    Write-Host "✅ Remember test passed" -ForegroundColor Green
    Write-Host "Memory ID: $($rememberResponse.id)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Remember test failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test recall  
try {
    $recallResponse = Invoke-RestMethod -Uri "$serviceUrl/api/memories?query=PowerShell" -Method Get
    Write-Host "✅ Recall test passed" -ForegroundColor Green
    Write-Host "Found $($recallResponse.length) memories" -ForegroundColor Gray
} catch {
    Write-Host "❌ Recall test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🎉 API testing completed!" -ForegroundColor Green