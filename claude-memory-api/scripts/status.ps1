# status.ps1 - Check deployment status
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
$bucketName = $env:BUCKET_NAME
if (-not $bucketName) {
    $bucketName = "$ProjectId-memory-data"
}
gsutil ls -L gs://$bucketName 2>$null | Select-String "Creation time|Storage class|Location"