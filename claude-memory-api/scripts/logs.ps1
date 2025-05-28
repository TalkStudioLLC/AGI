# logs.ps1 - View service logs
param(
    [string]$ProjectId = "",
    [string]$Region = "", 
    [string]$ServiceName = "",
    [int]$Lines = 50,
    [switch]$Follow
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

Write-Host "📋 Viewing logs for $ServiceName..." -ForegroundColor Yellow

if ($Follow) {
    Write-Host "Following logs (Ctrl+C to stop)..." -ForegroundColor Gray
    gcloud run services logs tail $ServiceName --region=$Region
} else {
    Write-Host "Showing last $Lines log entries..." -ForegroundColor Gray
    gcloud run services logs read $ServiceName --region=$Region --limit=$Lines
}