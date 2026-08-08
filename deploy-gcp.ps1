# AGI Memory API - Google Cloud Deployment Script
param(
    [string]$ProjectId = "agi-memory-api-$(Get-Random -Maximum 9999)",
    [string]$Region = "us-east4",
    [string]$ServiceName = "agi-memory-api"
)

Write-Host "🤖 AGI Memory API - Google Cloud Deployment" -ForegroundColor Magenta
Write-Host "Project: $ProjectId" -ForegroundColor Cyan
Write-Host "Region: $Region" -ForegroundColor Cyan
Write-Host "Service: $ServiceName" -ForegroundColor Cyan
Write-Host ""

# Check if gcloud is installed
Write-Host "🔍 Checking Google Cloud SDK..." -ForegroundColor Yellow
if (!(Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Google Cloud SDK not found!" -ForegroundColor Red
    Write-Host "📥 Please install from: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ Google Cloud SDK found" -ForegroundColor Green

# Check if Docker is running
Write-Host "🔍 Checking Docker..." -ForegroundColor Yellow
try {
    docker info | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
}
catch {
    Write-Host "❌ Docker not running!" -ForegroundColor Red
    Write-Host "📥 Please start Docker Desktop" -ForegroundColor Yellow
    exit 1
}

# Check authentication
Write-Host "🔐 Checking authentication..." -ForegroundColor Yellow
$account = gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null
if (-not $account) {
    Write-Host "🔑 Authenticating with Google Cloud..." -ForegroundColor Yellow
    gcloud auth login
}
Write-Host "✅ Authenticated" -ForegroundColor Green

# Set project
Write-Host "📋 Setting up project..." -ForegroundColor Yellow
gcloud config set project $ProjectId 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating new project: $ProjectId" -ForegroundColor Yellow
    gcloud projects create $ProjectId --name="AGI Memory API"
    gcloud config set project $ProjectId
}
Write-Host "✅ Project set: $ProjectId" -ForegroundColor Green

# Billing reminder
Write-Host "💳 IMPORTANT: Enable billing at:" -ForegroundColor Yellow
Write-Host "   https://console.cloud.google.com/billing/linkedaccount?project=$ProjectId" -ForegroundColor Cyan
$continue = Read-Host "Press Enter to continue or 'q' to quit"
if ($continue -eq 'q') { exit 0 }

# Enable APIs
Write-Host "🔧 Enabling APIs..." -ForegroundColor Yellow
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
Write-Host "✅ APIs enabled" -ForegroundColor Green

# Build
Write-Host "🏗️ Building..." -ForegroundColor Yellow
gcloud builds submit --tag gcr.io/$ProjectId/$ServiceName
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build successful" -ForegroundColor Green

# Deploy
Write-Host "🚀 Deploying..." -ForegroundColor Yellow
gcloud run deploy $ServiceName --image gcr.io/$ProjectId/$ServiceName --platform managed --region $Region --allow-unauthenticated --port 3000 --memory 1Gi --set-env-vars NODE_ENV=production,PORT=3000
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Deploy failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Deploy successful" -ForegroundColor Green

# Get URL
$serviceUrl = gcloud run services describe $ServiceName --region=$Region --format="value(status.url)"

Write-Host ""
Write-Host "🎉 Deployment Complete!" -ForegroundColor Green
Write-Host "🌐 Service URL: $serviceUrl" -ForegroundColor Cyan
Write-Host ""

# Test
Write-Host "🧪 Testing..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$serviceUrl/health" -TimeoutSec 10
    Write-Host "✅ Health check passed!" -ForegroundColor Green
}
catch {
    Write-Host "⚠️ Health check failed - service may be starting" -ForegroundColor Yellow
}

Write-Host "🚀 AGI Memory API is live!" -ForegroundColor Magenta
