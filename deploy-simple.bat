@echo off
echo AGI Memory API - Google Cloud Deployment
echo ==========================================

set PROJECT_ID=agi-memory-api-%RANDOM%
set REGION=us-east4
set SERVICE_NAME=agi-memory-api

echo Project: %PROJECT_ID%
echo Region: %REGION%
echo Service: %SERVICE_NAME%
echo.

echo Checking Google Cloud SDK...
where gcloud >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Google Cloud SDK not found!
    echo Please install from: https://cloud.google.com/sdk/docs/install
    pause
    exit /b 1
)
echo OK: Google Cloud SDK found

echo Checking Docker...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker not running!
    echo Please start Docker Desktop
    pause
    exit /b 1
)
echo OK: Docker is running

echo Setting up authentication...
gcloud auth list --filter=status:ACTIVE --format="value(account)" >nul 2>&1
if %errorlevel% neq 0 (
    echo Please authenticate...
    gcloud auth login
)
echo OK: Authenticated

echo Setting up project...
gcloud config set project %PROJECT_ID% >nul 2>&1
if %errorlevel% neq 0 (
    echo Creating new project: %PROJECT_ID%
    gcloud projects create %PROJECT_ID% --name="AGI Memory API"
    gcloud config set project %PROJECT_ID%
)
echo OK: Project set: %PROJECT_ID%

echo.
echo IMPORTANT: Enable billing at:
echo https://console.cloud.google.com/billing/linkedaccount?project=%PROJECT_ID%
echo.
echo Press any key when billing is enabled...
pause >nul

echo Enabling APIs...
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
echo OK: APIs enabled

echo Building container...
gcloud builds submit --tag gcr.io/%PROJECT_ID%/%SERVICE_NAME%
if %errorlevel% neq 0 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)
echo OK: Build successful

echo Deploying to Cloud Run...
gcloud run deploy %SERVICE_NAME% --image gcr.io/%PROJECT_ID%/%SERVICE_NAME% --platform managed --region %REGION% --allow-unauthenticated --port 3000 --memory 1Gi --set-env-vars NODE_ENV=production,PORT=3000
if %errorlevel% neq 0 (
    echo ERROR: Deploy failed!
    pause
    exit /b 1
)
echo OK: Deploy successful

echo.
echo *** DEPLOYMENT COMPLETE ***

for /f "tokens=*" %%i in ('gcloud run services describe %SERVICE_NAME% --region=%REGION% --format="value(status.url)"') do set SERVICE_URL=%%i

echo Service URL: %SERVICE_URL%
echo Health Check: %SERVICE_URL%/health
echo.
echo Your AGI Memory API is now live!

echo.
echo Press any key to exit...
pause >nul
