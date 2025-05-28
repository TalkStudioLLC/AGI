# setup.ps1 - Initial Setup for Claude Memory API
param(
    [string]$ProjectId = "",
    [string]$Region = ""
)

$ErrorActionPreference = "Stop"

Write-Host "Setting up Claude Memory API Environment" -ForegroundColor Green

# Check if gcloud is installed
Write-Host "`nChecking gcloud installation..." -ForegroundColor Yellow
$gcloudCheck = Get-Command gcloud -ErrorAction SilentlyContinue
if ($gcloudCheck) {
    Write-Host "gcloud CLI found and working" -ForegroundColor Green
} else {
    Write-Error "gcloud CLI not found. Please install Google Cloud SDK first."
    exit 1
}

# Check authentication
Write-Host "`nChecking authentication..." -ForegroundColor Yellow
$currentAccount = gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null

if ($currentAccount) {
    Write-Host "Authenticated as: $currentAccount" -ForegroundColor Green
} else {
    Write-Host "Not authenticated. Running gcloud auth login..." -ForegroundColor Red
    gcloud auth login
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Authentication failed"
        exit 1
    }
    Write-Host "Authentication successful" -ForegroundColor Green
}

# Get project ID from user if not provided
if (-not $ProjectId) {
    $ProjectId = Read-Host "Enter your Google Cloud Project ID"
    if (-not $ProjectId) {
        Write-Error "Project ID is required"
        exit 1
    }
}

# Get region if not provided
if (-not $Region) {
    $Region = Read-Host "Enter your preferred region (default: us-east4)"
    if (-not $Region) {
        $Region = "us-east4"
    }
}

# Set project
Write-Host "`nSetting project..." -ForegroundColor Yellow
gcloud config set project $ProjectId

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to set project: $ProjectId"
    exit 1
}

# Verify project access
$currentProject = gcloud config get-value project 2>$null
Write-Host "Project set to: $currentProject" -ForegroundColor Green

# Check billing
Write-Host "`nChecking billing..." -ForegroundColor Yellow
try {
    $billing = gcloud beta billing projects describe $ProjectId --format="value(billingEnabled)" 2>$null
    if ($LASTEXITCODE -eq 0) {
        if ($billing -eq "True") {
            Write-Host "Billing is enabled" -ForegroundColor Green
        } else {
            Write-Host "Billing might not be enabled. Some services may not work." -ForegroundColor Yellow
        }
    } else {
        Write-Host "Could not check billing status (beta components not installed)" -ForegroundColor Yellow
        Write-Host "You can check billing manually at: https://console.cloud.google.com/billing/linkedaccount?project=$ProjectId" -ForegroundColor Gray
    }
} catch {
    Write-Host "Could not check billing status" -ForegroundColor Yellow
    Write-Host "You can check billing manually at: https://console.cloud.google.com/billing/linkedaccount?project=$ProjectId" -ForegroundColor Gray
}

# Create .env file template
Write-Host "`nCreating .env template..." -ForegroundColor Yellow
$envContent = @"
# Claude Memory API Environment Variables
PROJECT_ID=$ProjectId
REGION=$Region
SERVICE_NAME=claude-memory-api
ANTHROPIC_API_KEY=your-anthropic-api-key-here
NODE_ENV=production
PORT=8080

# Database
DB_PATH=/app/data/memory.db

# Cloud Storage
BUCKET_NAME=$ProjectId-memory-data
"@

$envContent | Out-File -FilePath ".env" -Encoding UTF8
Write-Host ".env file created" -ForegroundColor Green

# Create directory structure
Write-Host "`nCreating directory structure..." -ForegroundColor Yellow
$directories = @(
    "src/memory",
    "src/claude", 
    "src/routes",
    "scripts",
    "data"
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "Created: $dir" -ForegroundColor Gray
    }
}

Write-Host "Directory structure created" -ForegroundColor Green

# Check Docker
Write-Host "`nChecking Docker..." -ForegroundColor Yellow
$dockerCheck = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCheck) {
    $dockerVersion = docker --version 2>$null
    Write-Host "Docker found: $dockerVersion" -ForegroundColor Green
} else {
    Write-Host "Docker not found. Install Docker Desktop for local testing." -ForegroundColor Yellow
}

Write-Host "`nSetup completed successfully!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Edit .env file with your ANTHROPIC_API_KEY" -ForegroundColor Gray
Write-Host "2. Run: .\scripts\deploy.ps1 -AnthropicApiKey 'your-key'" -ForegroundColor Gray
Write-Host "3. Or run: .\scripts\deploy.ps1 then set API key later" -ForegroundColor Gray