# deploy.ps1 - Claude Memory API Deployment Script
param(
    [string]$ProjectId = "",
    [string]$Region = "",
    [string]$ServiceName = "",
    [string]$AnthropicApiKey = "",
    [switch]$SkipBuild,
    [switch]$Force
)

# Function to load environment variables from .env file
function Load-EnvironmentVariables {
    if (Test-Path ".env") {
        Write-Host "Loading environment variables from .env file..." -ForegroundColor Gray
        Get-Content ".env" | ForEach-Object {
            if ($_ -match '^([^#][^=]+)=(.*)$') {
                $name = $matches[1].Trim()
                $value = $matches[2].Trim()
                # Remove quotes if present
                $value = $value -replace '^["'']|["'']$'
                [Environment]::SetEnvironmentVariable($name, $value, "Process")
            }
        }
    } else {
        Write-Host "No .env file found. Using default values or parameters." -ForegroundColor Yellow
    }
}

# Load environment variables
Load-EnvironmentVariables

# Use environment variables as defaults if parameters not provided
$ProjectId = if ($ProjectId) { $ProjectId } else { $env:PROJECT_ID }
$Region = if ($Region) { $Region } else { $env:REGION }
$ServiceName = if ($ServiceName) { $ServiceName } else { $env:SERVICE_NAME }
$AnthropicApiKey = if ($AnthropicApiKey) { $AnthropicApiKey } else { $env:ANTHROPIC_API_KEY }

# Validate required parameters
if (-not $ProjectId) {
    Write-Error "PROJECT_ID not found in .env file or parameters. Please set PROJECT_ID in .env or use -ProjectId parameter."
    exit 1
}

if (-not $Region) {
    Write-Error "REGION not found in .env file or parameters. Please set REGION in .env or use -Region parameter."
    exit 1
}

if (-not $ServiceName) {
    Write-Error "SERVICE_NAME not found in .env file or parameters. Please set SERVICE_NAME in .env or use -ServiceName parameter."
    exit 1
}

# Set error handling
$ErrorActionPreference = "Stop"

Write-Host "Starting Claude Memory API Deployment" -ForegroundColor Green
Write-Host "Project: $ProjectId" -ForegroundColor Cyan
Write-Host "Region: $Region" -ForegroundColor Cyan

# 1. Set project configuration
Write-Host "`nSetting project configuration..." -ForegroundColor Yellow
gcloud config set project $ProjectId
gcloud config set run/region $Region

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to set project configuration"
    exit 1
}

# 2. Enable required APIs
Write-Host "`nEnabling required APIs..." -ForegroundColor Yellow
$apis = @(
    "cloudbuild.googleapis.com",
    "run.googleapis.com", 
    "artifactregistry.googleapis.com"
)

foreach ($api in $apis) {
    Write-Host "Enabling $api..." -ForegroundColor Gray
    gcloud services enable $api --quiet
}

# 3. Configure Docker authentication
Write-Host "`nConfiguring Docker authentication..." -ForegroundColor Yellow
gcloud auth configure-docker "$Region-docker.pkg.dev" --quiet

# 4. Create Artifact Registry repository
Write-Host "`nCreating Artifact Registry repository..." -ForegroundColor Yellow
$ErrorActionPreference = "Continue"
gcloud artifacts repositories create claude-memory `
    --repository-format=docker `
    --location=$Region `
    --description="Claude Memory API Docker Repository" `
    --quiet 2>$null
$ErrorActionPreference = "Stop"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Repository created successfully" -ForegroundColor Green
} else {
    Write-Host "Repository already exists (continuing)" -ForegroundColor Yellow
}

# 5. Create Cloud Storage bucket
Write-Host "`nCreating Cloud Storage bucket..." -ForegroundColor Yellow
$bucketName = $env:BUCKET_NAME
if (-not $bucketName) {
    $bucketName = "$ProjectId-memory-data"
}

gsutil mb -p $ProjectId -c STANDARD -l $Region gs://$bucketName 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Bucket created successfully" -ForegroundColor Green
} else {
    Write-Host "Bucket already exists (continuing)" -ForegroundColor Yellow
}

# 6. Build and deploy
if (-not $SkipBuild) {
    Write-Host "`nBuilding and deploying..." -ForegroundColor Yellow
    gcloud builds submit --config cloudbuild.yaml .
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed"
        exit 1
    }
    Write-Host "Build completed successfully" -ForegroundColor Green
}

# 7. Set environment variables
if ($AnthropicApiKey -and $AnthropicApiKey -ne "your-anthropic-api-key-here") {
    Write-Host "`nSetting environment variables..." -ForegroundColor Yellow
    gcloud run services update $ServiceName `
        --region=$Region `
        --set-env-vars="ANTHROPIC_API_KEY=$AnthropicApiKey" `
        --quiet
        
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Environment variables set" -ForegroundColor Green
    }
} else {
    Write-Host "ANTHROPIC_API_KEY not provided or is placeholder. Set it manually later." -ForegroundColor Yellow
}

# 8. Configure persistent storage
Write-Host "`nConfiguring persistent storage..." -ForegroundColor Yellow
gcloud run services update $ServiceName `
    --region=$Region `
    --add-volume=name=memory-data,type=cloud-storage,bucket=$bucketName `
    --add-volume-mount=volume=memory-data,mount-path=/app/data `
    --quiet

if ($LASTEXITCODE -eq 0) {
    Write-Host "Persistent storage configured" -ForegroundColor Green
}

# 9. Get service URL and test
Write-Host "`nGetting service URL..." -ForegroundColor Yellow
$serviceUrl = gcloud run services describe $ServiceName --region=$Region --format="value(status.url)"

if ($serviceUrl) {
    Write-Host "Service deployed successfully!" -ForegroundColor Green
    Write-Host "Service URL: $serviceUrl" -ForegroundColor Cyan
    
    # Test health endpoint
    Write-Host "`nTesting health endpoint..." -ForegroundColor Yellow
    try {
        $response = Invoke-RestMethod -Uri "$serviceUrl/health" -Method Get -TimeoutSec 10
        Write-Host "Health check passed: $($response.status)" -ForegroundColor Green
    } catch {
        Write-Host "Health check failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Error "Failed to get service URL"
}

Write-Host "`nDeployment completed!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Set ANTHROPIC_API_KEY if not done: .\scripts\set-env.ps1 -ApiKey 'your-key'" -ForegroundColor Gray
Write-Host "2. Test the API: .\scripts\test-api.ps1" -ForegroundColor Gray
Write-Host "3. View logs: .\scripts\logs.ps1" -ForegroundColor Gray