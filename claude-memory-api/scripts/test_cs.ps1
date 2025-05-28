Invoke-RestMethod -Uri "https://claude-memory-api-274213809869.us-east4.run.app/health" -Method Get

# Test memory storage
$testMemory = @{
    content = "Testing Cloud Storage integration - $(Get-Date)"
    context = "cloud-storage-test"
    emotional_weight = 0.9
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://claude-memory-api-274213809869.us-east4.run.app/api/remember" -Method Post -Body $testMemory -ContentType "application/json"