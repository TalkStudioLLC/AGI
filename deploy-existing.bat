@echo off
echo AGI Memory API - Deploy to Existing Project
echo ============================================

set PROJECT_ID=talkstudio-fb
set REGION=us-east4
set SERVICE_NAME=agi-memory-api

echo Using existing project: %PROJECT_ID%
echo Region: %REGION%
echo Service: %SERVICE_NAME%
echo.

echo Setting project...
gcloud config set project %PROJECT_ID%

echo Enabling APIs (if not already enabled)...
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com

echo Building container...
gcloud builds submit --tag gcr.io/%PROJECT_ID%/%SERVICE_NAME%

echo Deploying to Cloud Run...
gcloud run deploy %SERVICE_NAME% --image gcr.io/%PROJECT_ID%/%SERVICE_NAME% --platform managed --region %REGION% --allow-unauthenticated --port 3000 --memory 1Gi --set-env-vars NODE_ENV=production,PORT=3000

echo.
echo Getting service URL...
for /f "tokens=*" %%i in ('gcloud run services describe %SERVICE_NAME% --region=%REGION% --format="value(status.url)"') do set SERVICE_URL=%%i

echo.
echo *** DEPLOYMENT COMPLETE ***
echo Service URL: %SERVICE_URL%
echo Health Check: %SERVICE_URL%/health
echo.

pause
