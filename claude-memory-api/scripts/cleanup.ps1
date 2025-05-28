# cleanup.ps1 - Clean up resources
param(
    [string]$ProjectId = "",
    [string]$Region = "",
    [string]$ServiceName = "",
    [switch]$Force
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
$bucketName = $env:BUCKET_NAME
if (-not $bucketName) {
    $bucketName = "$ProjectId-memory-data"
}
gsutil rm -r gs://$bucketName 2>$null

Write-Host "✅ Cleanup completed" -ForegroundColor Green