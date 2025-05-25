# AGI MCP Setup Script for Claude Desktop
# This script helps configure Claude Desktop to connect to your AGI MCP server

Write-Host "🧠 AGI MCP Server Setup for Claude Desktop" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Get current directory
$currentDir = Get-Location
$projectPath = $currentDir.Path
$templateConfigPath = Join-Path $projectPath "claude_desktop_config.json"

Write-Host "📁 Project location: $projectPath" -ForegroundColor Green
Write-Host ""

# Check if Claude config directory exists
$claudeConfigDir = "$env:APPDATA\Claude"
if (!(Test-Path $claudeConfigDir)) {
    Write-Host "📁 Creating Claude config directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $claudeConfigDir -Force
}

$claudeConfigFile = Join-Path $claudeConfigDir "claude_desktop_config.json"
Write-Host "📄 Claude Desktop config file: $claudeConfigFile" -ForegroundColor Green

# Read the template and update the path
$configTemplate = Get-Content $templateConfigPath -Raw | ConvertFrom-Json
$configTemplate.mcpServers."agi-server".args[0] = Join-Path $projectPath "mcp-server.js"

# Check if config file already exists and has other servers
$existingConfig = $null
if (Test-Path $claudeConfigFile) {
    Write-Host "📄 Found existing Claude Desktop config, merging..." -ForegroundColor Yellow
    $existingConfig = Get-Content $claudeConfigFile -Raw | ConvertFrom-Json
    
    # Merge configurations
    if ($existingConfig.mcpServers) {
        # Add our server to existing servers
        $existingConfig.mcpServers | Add-Member -MemberType NoteProperty -Name "agi-server" -Value $configTemplate.mcpServers."agi-server" -Force
        $finalConfig = $existingConfig
    } else {
        # Add mcpServers section to existing config
        $existingConfig | Add-Member -MemberType NoteProperty -Name "mcpServers" -Value $configTemplate.mcpServers
        $finalConfig = $existingConfig
    }
} else {
    Write-Host "📄 Creating new Claude Desktop config..." -ForegroundColor Green
    $finalConfig = $configTemplate
}

# Write the updated config
$finalConfig | ConvertTo-Json -Depth 4 | Set-Content $claudeConfigFile

Write-Host ""
Write-Host "✅ Claude Desktop MCP configuration updated!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Configuration Details:" -ForegroundColor Cyan
Write-Host "   Server Name: agi-server" -ForegroundColor White
Write-Host "   Script Path: $(Join-Path $projectPath "mcp-server.js")" -ForegroundColor White
Write-Host "   Config File: $claudeConfigFile" -ForegroundColor White
Write-Host ""
Write-Host "🔄 Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Close Claude Desktop completely" -ForegroundColor White
Write-Host "   2. Restart Claude Desktop application" -ForegroundColor White
Write-Host "   3. Look for 🧠 AGI tools in Claude's interface" -ForegroundColor White
Write-Host "   4. Test with: 'Remember that I'm working on an AGI project'" -ForegroundColor White
Write-Host ""
Write-Host "🧪 Test the server locally first:" -ForegroundColor Cyan
Write-Host "   npm start                    # Test web interface" -ForegroundColor White
Write-Host "   node mcp-server.js          # Test MCP interface" -ForegroundColor White
Write-Host ""
Write-Host "🛠️  For troubleshooting:" -ForegroundColor Cyan
Write-Host "   npm test                    # Run component tests" -ForegroundColor White
Write-Host "   npm run ports:status       # Check port availability" -ForegroundColor White
Write-Host ""

# Show the final config
Write-Host "📄 Final Claude Desktop configuration:" -ForegroundColor Cyan
Get-Content $claudeConfigFile | Write-Host -ForegroundColor Gray

Write-Host ""
Write-Host "🎉 Setup complete! Restart Claude Desktop to use your AGI server." -ForegroundColor Green
