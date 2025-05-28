# import-history.ps1 - Import conversation history to Claude Memory API
param(
    [Parameter(Mandatory=$true)]
    [string]$ExportFile,
    [string]$ApiUrl = "https://claude-memory-api-3ibabnlfhq-uk.a.run.app",
    [string]$Context = "conversation-history",
    [double]$DefaultEmotionalWeight = 0.6,
    [int]$BatchSize = 50,
    [switch]$DryRun
)

Write-Host "Claude Memory History Import Tool" -ForegroundColor Green
Write-Host "Export File: $ExportFile" -ForegroundColor Cyan
Write-Host "API URL: $ApiUrl" -ForegroundColor Cyan

if (-not (Test-Path $ExportFile)) {
    Write-Error "Export file not found: $ExportFile"
    exit 1
}

# Function to import a single memory
function Import-Memory {
    param($content, $context, $emotionalWeight, $apiUrl)
    
    if ($DryRun) {
        Write-Host "DRY RUN: Would import: $($content.Substring(0, [Math]::Min(100, $content.Length)))..." -ForegroundColor Yellow
        return @{ success = $true; id = "dry-run-id" }
    }
    
    try {
        $body = @{
            content = $content
            context = $context
            emotional_weight = $emotionalWeight
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri "$apiUrl/api/remember" -Method Post -Body $body -ContentType "application/json"
        return @{ success = $true; id = $response.id }
    } catch {
        Write-Warning "Failed to import memory: $($_.Exception.Message)"
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# Function to process JSON export (Claude Desktop format)
function Process-JsonExport {
    param($filePath)
    
    Write-Host "Processing JSON export..." -ForegroundColor Yellow
    $data = Get-Content $filePath -Raw | ConvertFrom-Json
    $memories = @()
    
    if ($data.conversations) {
        foreach ($conversation in $data.conversations) {
            $conversationId = $conversation.id
            $conversationTitle = $conversation.name -or "Untitled Conversation"
            
            foreach ($message in $conversation.messages) {
                $role = $message.role
                $content = $message.content
                
                if ($content -and $content.Length -gt 10) {
                    $memories += @{
                        content = "$role`: $content"
                        context = "conversation-$conversationId"
                        emotional_weight = if ($role -eq "user") { 0.7 } else { 0.6 }
                        metadata = @{
                            conversation_id = $conversationId
                            conversation_title = $conversationTitle
                            role = $role
                            timestamp = $message.created_at
                        }
                    }
                }
            }
        }
    }
    
    return $memories
}

# Function to process text export
function Process-TextExport {
    param($filePath)
    
    Write-Host "Processing text export..." -ForegroundColor Yellow
    $content = Get-Content $filePath -Raw
    $memories = @()
    
    # Split by conversation markers or large blocks
    $blocks = $content -split "`n`n" | Where-Object { $_.Trim().Length -gt 50 }
    
    foreach ($block in $blocks) {
        if ($block.Trim().Length -gt 10) {
            $memories += @{
                content = $block.Trim()
                context = $Context
                emotional_weight = $DefaultEmotionalWeight
            }
        }
    }
    
    return $memories
}

# Detect file format and process
$fileExtension = [System.IO.Path]::GetExtension($ExportFile).ToLower()
$memories = @()

switch ($fileExtension) {
    ".json" { $memories = Process-JsonExport $ExportFile }
    ".txt" { $memories = Process-TextExport $ExportFile }
    default { 
        Write-Warning "Unsupported file format: $fileExtension"
        Write-Host "Attempting to process as text file..."
        $memories = Process-TextExport $ExportFile
    }
}

Write-Host "Found $($memories.Count) memories to import" -ForegroundColor Green

if ($memories.Count -eq 0) {
    Write-Warning "No memories found to import"
    exit 0
}

# Import memories in batches
$imported = 0
$failed = 0
$batch = 0

for ($i = 0; $i -lt $memories.Count; $i += $BatchSize) {
    $batch++
    $batchMemories = $memories[$i..([Math]::Min($i + $BatchSize - 1, $memories.Count - 1))]
    
    Write-Host "`nProcessing batch $batch ($($batchMemories.Count) memories)..." -ForegroundColor Yellow
    
    foreach ($memory in $batchMemories) {
        $result = Import-Memory -content $memory.content -context $memory.context -emotionalWeight $memory.emotional_weight -apiUrl $ApiUrl
        
        if ($result.success) {
            $imported++
            Write-Host "✅ Imported memory $imported" -ForegroundColor Green
        } else {
            $failed++
            Write-Host "❌ Failed to import memory: $($result.error)" -ForegroundColor Red
        }
        
        # Small delay to avoid overwhelming the API
        Start-Sleep -Milliseconds 100
    }
    
    Write-Host "Batch $batch complete. Imported: $imported, Failed: $failed" -ForegroundColor Cyan
}

Write-Host "`n🎉 Import completed!" -ForegroundColor Green
Write-Host "Successfully imported: $imported memories" -ForegroundColor Green
Write-Host "Failed imports: $failed" -ForegroundColor Yellow

if (-not $DryRun) {
    # Test the import by querying
    Write-Host "`nTesting import..." -ForegroundColor Yellow
    try {
        $testQuery = Invoke-RestMethod -Uri "$ApiUrl/api/memories?limit=5" -Method Get
        Write-Host "✅ Found $($testQuery.Count) memories in database" -ForegroundColor Green
    } catch {
        Write-Warning "Could not verify import: $($_.Exception.Message)"
    }
}