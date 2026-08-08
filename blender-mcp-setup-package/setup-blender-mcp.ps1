# Blender MCP Setup Script
# This script will clone and configure the Blender MCP server

Write-Host "Setting up Blender MCP..." -ForegroundColor Green

# Navigate to GitHub directory
$githubPath = "C:\Users\Tom\Documents\GitHub"
Set-Location $githubPath

# Clone the repository
Write-Host "Cloning Blender MCP repository..." -ForegroundColor Yellow
git clone git@github.com:ahujasid/blender-mcp.git

# Navigate to the cloned repository
Set-Location "blender-mcp"

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

# Go back to AGI directory
Set-Location "$githubPath\AGI"

# Backup current config
Write-Host "Backing up current Claude desktop config..." -ForegroundColor Yellow
Copy-Item "claude_desktop_config.json" "claude_desktop_config_backup.json"

# Update Claude desktop configuration
Write-Host "Updating Claude desktop configuration..." -ForegroundColor Yellow
Copy-Item "claude_desktop_config_with_blender.json" "claude_desktop_config.json"

Write-Host "Blender MCP setup complete!" -ForegroundColor Green
Write-Host "Please restart Claude Desktop to load the new configuration." -ForegroundColor Cyan

# Display next steps
Write-Host "`nNext steps:" -ForegroundColor Magenta
Write-Host "1. Restart Claude Desktop application" -ForegroundColor White
Write-Host "2. Verify Blender is installed and accessible" -ForegroundColor White
Write-Host "3. Test the Blender MCP integration" -ForegroundColor White
