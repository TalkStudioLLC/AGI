# import-claude-export.ps1 - Import Claude conversation export to cloud memory
param(
    [Parameter(Mandatory=$true)]
    [string]$ZipFile,
    [string]$ApiUrl = "",
    [int]$BatchSize = 25,
    [switch]$DryRun,
    [double]$UserWeight = 0.8,
    [double]$AssistantWeight = 0.7
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

# Use environment variables if API URL not provided
if (-not $ApiUrl) {
    $ProjectId = $env:PROJECT_ID
    $Region = $env:REGION
    $ServiceName = $env:SERVICE_NAME
    
    if ($ProjectId -and $Region -and $ServiceName) {
        try {
            $ApiUrl = gcloud run services describe $ServiceName --region=$Region --format="value(status.url)"
            if (-not $ApiUrl) {
                Write-Warning "Could not get service URL from gcloud. Please provide -ApiUrl parameter."
                exit 1
            }
        } catch {
            Write-Warning "Could not get service URL from gcloud. Please provide -ApiUrl parameter."
            exit 1
        }
    } else {
        Write-Error "API URL not provided and environment variables not found. Please set PROJECT_ID, REGION, SERVICE_NAME in .env or use -ApiUrl parameter."
        exit 1
    }
}

Write-Host "Claude Export Import Tool" -ForegroundColor Green
Write-Host "ZIP File: $ZipFile" -ForegroundColor Cyan
Write-Host "API URL: $ApiUrl" -ForegroundColor Cyan

if (-not (Test-Path $ZipFile)) {
    Write-Error "ZIP file not found: $ZipFile"
    exit 1
}

# Extract ZIP to temp directory
$extractPath = Join-Path $env:TEMP "claude-export-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Write-Host "Extracting to: $extractPath" -ForegroundColor Yellow

try {
    Expand-Archive -Path $ZipFile -DestinationPath $extractPath -Force
    Write-Host "ZIP extracted successfully" -ForegroundColor Green
} catch {
    Write-Error "Failed to extract ZIP: $($_.Exception.Message)"
    exit 1
}

# Look for conversations.json
$conversationsFile = Join-Path $extractPath "conversations.json"
if (-not (Test-Path $conversationsFile)) {
    Write-Error "conversations.json not found in ZIP"
    exit 1
}

Write-Host "Found conversations.json" -ForegroundColor Green

# Function to import a single memory
function Import-Memory {
    param($content, $context, $emotionalWeight, $apiUrl)
    
    if ($DryRun) {
        $preview = if ($content.Length -gt 80) { $content.Substring(0, 80) + "..." } else { $content }
        Write-Host "DRY RUN: Would import: $preview" -ForegroundColor Yellow
        return @{ success = $true; id = "dry-run-id" }
    }
    
    try {
        $body = @{
            content = $content
            context = $context
            emotional_weight = $emotionalWeight
        } | ConvertTo-Json -Depth 10
        
        $response = Invoke-RestMethod -Uri "$apiUrl/api/remember" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 30
        return @{ success = $true; id = $response.id }
    } catch {
        Write-Warning "Failed to import memory: $($_.Exception.Message)"
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# Load and process conversations
Write-Host "Loading conversations..." -ForegroundColor Yellow
try {
    $conversations = Get-Content $conversationsFile -Raw | ConvertFrom-Json
    Write-Host "Loaded conversation data" -ForegroundColor Green
} catch {
    Write-Error "Failed to parse conversations.json: $($_.Exception.Message)"
    exit 1
}

$memories = @()
$conversationCount = 0

# Process each conversation
if ($conversations -is [array]) {
    $conversationList = $conversations
} else {
    $conversationList = @($conversations)
}

foreach ($conversation in $conversationList) {
    $conversationCount++
    $conversationId = if ($conversation.uuid) { $conversation.uuid } elseif ($conversation.id) { $conversation.id } else { "conv-$conversationCount" }
    $conversationName = if ($conversation.name) { $conversation.name } else { "Untitled Conversation $conversationCount" }
    
    Write-Host "Processing conversation: $conversationName" -ForegroundColor Cyan
    
    # Process messages in this conversation
    $messageCount = 0
    $messages = if ($conversation.chat_messages) { $conversation.chat_messages } elseif ($conversation.messages) { $conversation.messages } else { @() }
    
    foreach ($message in $messages) {
        $messageCount++
        $role = if ($message.sender) { $message.sender } elseif ($message.role) { $message.role } else { "unknown" }
        $content = if ($message.text) { $message.text } elseif ($message.content) { $message.content } else { "" }
        
        if ($content -and $content.Length -gt 20) {
            # Clean up content
            $cleanContent = $content -replace '\n+', ' ' -replace '\s+', ' '
            $cleanContent = $cleanContent.Trim()
            
            if ($cleanContent.Length -gt 50) {
                $emotionalWeight = if ($role -eq "human" -or $role -eq "user") { $UserWeight } else { $AssistantWeight }
                
                $memories += @{
                    content = "$role`: $cleanContent"
                    context = "conversation-$conversationId"
                    emotional_weight = $emotionalWeight
                }
            }
        }
    }
    
    Write-Host "  Found $messageCount messages" -ForegroundColor Gray
}

Write-Host "`nProcessing Summary:" -ForegroundColor Green
Write-Host "Conversations processed: $conversationCount" -ForegroundColor Cyan
Write-Host "Memories to import: $($memories.Count)" -ForegroundColor Cyan

if ($memories.Count -eq 0) {
    Write-Warning "No memories found to import"
    exit 0
}

# Import memories in batches
$imported = 0
$failed = 0
$batch = 0
$totalBatches = [Math]::Ceiling($memories.Count / $BatchSize)

Write-Host "`nStarting import..." -ForegroundColor Green

for ($i = 0; $i -lt $memories.Count; $i += $BatchSize) {
    $batch++
    $endIndex = [Math]::Min($i + $BatchSize - 1, $memories.Count - 1)
    $batchMemories = $memories[$i..$endIndex]
    
    Write-Host "`nBatch $batch/$totalBatches - $($batchMemories.Count) memories..." -ForegroundColor Yellow
    
    foreach ($memory in $batchMemories) {
        $result = Import-Memory -content $memory.content -context $memory.context -emotionalWeight $memory.emotional_weight -apiUrl $ApiUrl
        
        if ($result.success) {
            $imported++
            if ($imported % 10 -eq 0) {
                Write-Host "Imported $imported memories..." -ForegroundColor Green
            }
        } else {
            $failed++
            Write-Host "Failed memory $($imported + $failed)" -ForegroundColor Red
        }
        
        # Small delay to avoid overwhelming the API
        Start-Sleep -Milliseconds 200
    }
}

Write-Host "`nImport completed!" -ForegroundColor Green
Write-Host "Successfully imported: $imported memories" -ForegroundColor Green
Write-Host "Failed imports: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })

# Clean up temp directory
Remove-Item -Path $extractPath -Recurse -Force
Write-Host "Cleaned up temporary files" -ForegroundColor Gray

if (-not $DryRun -and $imported -gt 0) {
    # Test the import
    Write-Host "`nTesting import..." -ForegroundColor Yellow
    try {
        $testQuery = Invoke-RestMethod -Uri "$ApiUrl/api/memories?limit=5" -Method Get
        Write-Host "Verified: $($testQuery.Count) memories accessible in database" -ForegroundColor Green
        
        # Show a sample
        if ($testQuery.Count -gt 0) {
            Write-Host "`nSample imported memory:" -ForegroundColor Cyan
            $sampleContent = if ($testQuery[0].content.Length -gt 100) { $testQuery[0].content.Substring(0, 100) + "..." } else { $testQuery[0].content }
            Write-Host "Content: $sampleContent" -ForegroundColor Gray
            Write-Host "Context: $($testQuery[0].context)" -ForegroundColor Gray
        }
    } catch {
        Write-Warning "Could not verify import: $($_.Exception.Message)"
    }
}