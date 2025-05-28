# test_cs.ps1 - Quick Cloud Storage test
param(
    [string]$ApiUrl = ""
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

# Use environment variables if API URL not provided
if (-not $ApiUrl) {
    $ProjectId = $env:PROJECT_ID
    $Region = $env:REGION
    $ServiceName = $env:SERVICE_NAME
    
    if ($ProjectId -and $Region -and $ServiceName) {
        try {
            $ApiUrl = gcloud run services describe $ServiceName --region=$Region --format="value(status.url)"
            if (-not $ApiUrl) {
                Write-Warning "Could not get service URL from gcloud. Please provide -ApiUrl parameter."
                exit 1
            }
        } catch {
            Write-Warning "Could not get service URL from gcloud. Please provide -ApiUrl parameter."
            exit 1
        }
    } else {
        Write-Error "API URL not provided and environment variables not found. Please set PROJECT_ID, REGION, SERVICE_NAME in .env or use -ApiUrl parameter."
        exit 1
    }
}

Write-Host "Testing Cloud Storage Integration" -ForegroundColor Green
Write-Host "API URL: $ApiUrl" -ForegroundColor Cyan

# Test health endpoint
Write-Host "`nTesting health endpoint..." -ForegroundColor Yellow
Invoke-RestMethod -Uri "$ApiUrl/health" -Method Get

# Test memory storage
Write-Host "`nTesting memory storage..." -ForegroundColor Yellow
$testMemory = @{
    content = "Testing Cloud Storage integration - $(Get-Date)"
    context = "cloud-storage-test"
    emotional_weight = 0.9
} | ConvertTo-Json

Invoke-RestMethod -Uri "$ApiUrl/api/remember" -Method Post -Body $testMemory -ContentType "application/json"

Write-Host "✅ Cloud Storage test completed!" -ForegroundColor Green