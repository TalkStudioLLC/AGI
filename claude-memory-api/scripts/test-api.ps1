# test-api.ps1 - Test the deployed API
param(
    [string]$ProjectId = "",
    [string]$Region = "",
    [string]$ServiceName = ""
)

# Function to load environment variables from .env file
function Load-EnvironmentVariables {
    if (Test-Path ".env") {
        Get-Content ".env" | ForEach-Object {
            if ($_ -match '^([^#][^=]+)=(.*)$') {
                $name = $matches[1].Trim()
                $value = $matches[2].Trim()
                # Remove quotes if present
                $value = $value -replace '^["'']|["'']$'
                [Environment]::SetEnvironmentVariable($name, $value, "Process")
            }
        }
    }
}

# Load environment variables
Load-EnvironmentVariables

# Use environment variables as defaults if parameters not provided
$ProjectId = if ($ProjectId) { $ProjectId } else { $env:PROJECT_ID }
$Region = if ($Region) { $Region } else { $env:REGION }
$ServiceName = if ($ServiceName) { $ServiceName } else { $env:SERVICE_NAME }

# Validate required parameters
if (-not $ProjectId) {
    Write-Error "PROJECT_ID not found in .env file or parameters."
    exit 1
}

if (-not $Region) {
    Write-Error "REGION not found in .env file or parameters."
    exit 1
}

if (-not $ServiceName) {
    Write-Error "SERVICE_NAME not found in .env file or parameters."
    exit 1
}

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