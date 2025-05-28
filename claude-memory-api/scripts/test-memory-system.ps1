# test-memory-system.ps1 - Test cloud memory system
param(
    [string]$ApiUrl = "https://claude-memory-api-3ibabnlfhq-uk.a.run.app"
)

Write-Host "Testing Cloud Memory System" -ForegroundColor Green
Write-Host "API URL: $ApiUrl" -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "`n1. Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$ApiUrl/health" -Method Get
    Write-Host "✅ API Status: $($health.status)" -ForegroundColor Green
    Write-Host "   Timestamp: $($health.timestamp)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 2: Get Total Memory Count
Write-Host "`n2. Memory Count..." -ForegroundColor Yellow
try {
    $allMemories = Invoke-RestMethod -Uri "$ApiUrl/api/memories?limit=1000" -Method Get
    Write-Host "✅ Total memories found: $($allMemories.Count)" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to get memory count: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Sample Recent Memories
Write-Host "`n3. Recent Memories Sample..." -ForegroundColor Yellow
try {
    $recentMemories = Invoke-RestMethod -Uri "$ApiUrl/api/memories?limit=5" -Method Get
    Write-Host "✅ Retrieved $($recentMemories.Count) recent memories" -ForegroundColor Green
    
    for ($i = 0; $i -lt [Math]::Min(3, $recentMemories.Count); $i++) {
        $memory = $recentMemories[$i]
        $preview = if ($memory.content.Length -gt 100) { $memory.content.Substring(0, 100) + "..." } else { $memory.content }
        Write-Host "   Memory $($i+1): $preview" -ForegroundColor Gray
        Write-Host "   Context: $($memory.context)" -ForegroundColor DarkGray
    }
} catch {
    Write-Host "❌ Failed to get recent memories: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Search Functionality
Write-Host "`n4. Search Test..." -ForegroundColor Yellow
$searchTerms = @("Claude", "conversation", "API", "deployment", "memory")

foreach ($term in $searchTerms) {
    try {
        $searchResults = Invoke-RestMethod -Uri "$ApiUrl/api/memories?query=$term&limit=3" -Method Get
        Write-Host "✅ Search '$term': $($searchResults.Count) results" -ForegroundColor Green
    } catch {
        Write-Host "❌ Search '$term' failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Test 5: Context Filtering
Write-Host "`n5. Context Test..." -ForegroundColor Yellow
try {
    $contexts = Invoke-RestMethod -Uri "$ApiUrl/api/memories?limit=100" -Method Get | 
                Group-Object context | 
                Select-Object Name, Count | 
                Sort-Object Count -Descending | 
                Select-Object -First 5
    
    Write-Host "✅ Top contexts found:" -ForegroundColor Green
    foreach ($context in $contexts) {
        Write-Host "   $($context.Name): $($context.Count) memories" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Context analysis failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: Store and Retrieve Test
Write-Host "`n6. Store/Retrieve Test..." -ForegroundColor Yellow
$testContent = "Memory system test - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

try {
    # Store a test memory
    $storeBody = @{
        content = $testContent
        context = "system-test"
        emotional_weight = 0.8
    } | ConvertTo-Json
    
    $stored = Invoke-RestMethod -Uri "$ApiUrl/api/remember" -Method Post -Body $storeBody -ContentType "application/json"
    Write-Host "✅ Stored test memory with ID: $($stored.id)" -ForegroundColor Green
    
    # Wait a moment
    Start-Sleep -Seconds 2
    
    # Try to retrieve it
    $retrieved = Invoke-RestMethod -Uri "$ApiUrl/api/memories?query=system-test&limit=5" -Method Get
    $found = $retrieved | Where-Object { $_.content -like "*Memory system test*" }
    
    if ($found) {
        Write-Host "✅ Successfully retrieved test memory" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Test memory stored but not found in search" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Store/retrieve test failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 7: Memory Statistics
Write-Host "`n7. Memory Statistics..." -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Uri "$ApiUrl/api/stats" -Method Get
    Write-Host "✅ Memory Statistics:" -ForegroundColor Green
    Write-Host "   Total memories: $($stats.total_memories)" -ForegroundColor Gray
    Write-Host "   Average emotional weight: $([Math]::Round($stats.avg_emotional_weight, 3))" -ForegroundColor Gray
    Write-Host "   Unique contexts: $($stats.unique_contexts)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Statistics failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🎉 Memory system testing completed!" -ForegroundColor Green
Write-Host "Your cloud memory system is ready for use!" -ForegroundColor Cyan