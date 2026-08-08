// Blender MCP Verification Script
// This script tests if the Blender MCP server is properly configured

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Blender MCP Setup...\n');

// Check if Blender MCP repository exists
const blenderMcpPath = 'C:\\Users\\Tom\\Documents\\GitHub\\blender-mcp';
if (fs.existsSync(blenderMcpPath)) {
    console.log('✅ Blender MCP repository found at:', blenderMcpPath);
    
    // Check if package.json exists
    const packageJsonPath = path.join(blenderMcpPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        console.log('✅ package.json found');
        
        // Check if node_modules exists
        const nodeModulesPath = path.join(blenderMcpPath, 'node_modules');
        if (fs.existsSync(nodeModulesPath)) {
            console.log('✅ Dependencies installed (node_modules found)');
        } else {
            console.log('❌ Dependencies not installed (run npm install)');
        }
    } else {
        console.log('❌ package.json not found');
    }
    
    // Check for main entry point
    const indexPath = path.join(blenderMcpPath, 'index.js');
    if (fs.existsSync(indexPath)) {
        console.log('✅ Main entry point (index.js) found');
    } else {
        console.log('❌ Main entry point (index.js) not found');
    }
} else {
    console.log('❌ Blender MCP repository not found. Please run the setup script first.');
}

// Check Claude desktop configuration
const configPath = 'C:\\Users\\Tom\\Documents\\GitHub\\AGI\\claude_desktop_config.json';
if (fs.existsSync(configPath)) {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.mcpServers && config.mcpServers['blender-mcp']) {
            console.log('✅ Blender MCP server configured in Claude desktop config');
        } else {
            console.log('❌ Blender MCP server not found in Claude desktop config');
        }
    } catch (error) {
        console.log('❌ Error reading Claude desktop config:', error.message);
    }
} else {
    console.log('❌ Claude desktop config not found');
}

console.log('\n🎯 Setup verification complete!');
