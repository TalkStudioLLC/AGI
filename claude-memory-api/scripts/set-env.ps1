# set-env.ps1 - Set environment variables
param(
    [Parameter(Mandatory=$true)]
    [string]$ApiKey,
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

Write-Host "🔑 Setting ANTHROPIC_API_KEY..." -ForegroundColor Yellow
gcloud run services update $ServiceName `
    --region=$Region `
    --set-env-vars="ANTHROPIC_API_KEY=$ApiKey"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ API key set successfully" -ForegroundColor Green
} else {
    Write-Error "Failed to set API key"
}