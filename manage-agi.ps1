# AGI Management Utilities
# File: manage-agi.ps1

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("status", "logs", "restart", "test")]
    [string]$Action,
    
    [Parameter(Mandatory=$false)]
    [string]$ServiceName = "agi-memory-api",
    
    [Parameter(Mandatory=$false)]
    [string]$Region = "us-east4"
)

function Get-ServiceStatus {
    Write-Host "📊 Getting AGI service status..." -ForegroundColor Cyan
    
    try {
        $service = gcloud run services describe $ServiceName --region=$Region --format=json | ConvertFrom-Json
        
        Write-Host "`n🤖 AGI Memory API Status" -ForegroundColor Magenta
        Write-Host "Name: $($service.metadata.name)" -ForegroundColor White
        Write-Host "URL: $($service.status.url)" -ForegroundColor Green
        Write-Host "Region: $Region" -ForegroundColor White
        Write-Host "Image: $($service.spec.template.spec.containers[0].image)" -ForegroundColor White
        
        # Test health
        try {
            $health = Invoke-RestMethod -Uri "$($service.status.url)/health" -TimeoutSec 10
            Write-Host "Health: $($health.status)" -ForegroundColor Green
        }
        catch {
            Write-Host "Health: FAILED" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "Failed to get status: $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Get-ServiceLogs {
    Write-Host "📋 Fetching AGI service logs..." -ForegroundColor Cyan
    gcloud run services logs read $ServiceName --region=$Region --limit=50
}

function Restart-Service {
    Write-Host "🔄 Restarting AGI service..." -ForegroundColor Cyan
    $timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
    gcloud run services update $ServiceName --region=$Region --update-annotations="restart-timestamp=$timestamp"
    Write-Host "✅ Restart initiated" -ForegroundColor Green
}

function Test-Service {
    Write-Host "🧪 Testing AGI Memory API..." -ForegroundColor Cyan
    
    try {
        $service = gcloud run services describe $ServiceName --region=$Region --format="value(status.url)"
        
        # Test health endpoint
        Write-Host "Testing health endpoint..." -ForegroundColor Yellow
        $health = Invoke-RestMethod -Uri "$service/health" -TimeoutSec 10
        Write-Host "✅ Health: $($health.status)" -ForegroundColor Green
        
        # Test memory endpoint if it exists
        Write-Host "Testing memory endpoint..." -ForegroundColor Yellow
        try {
            $testData = @{
                content = "PowerShell test - $(Get-Date)"
                context = "testing"
                emotional_weight = 0.5
            } | ConvertTo-Json
            
            $headers = @{"Content-Type" = "application/json"}
            $response = Invoke-RestMethod -Uri "$service/api/remember" -Method Post -Body $testData -Headers $headers -TimeoutSec 10
            Write-Host "✅ Memory API working" -ForegroundColor Green
        }
        catch {
            Write-Host "⚠️ Memory API test failed: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        
    }
    catch {
        Write-Host "❌ Service test failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Execute the requested action
switch ($Action) {
    "status"  { Get-ServiceStatus }
    "logs"    { Get-ServiceLogs }
    "restart" { Restart-Service }
    "test"    { Test-Service }
}
