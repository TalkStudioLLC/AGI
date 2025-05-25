#!/usr/bin/env node

/**
 * AGI MCP Server Quick Start
 * 
 * Simple startup script that checks dependencies and starts the server
 */

async function quickStart() {
    console.log('🧠 AGI MCP Server Quick Start\\n');
    
    // Check if we're in the right directory
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync('./package.json')) {
        console.error('❌ Error: package.json not found. Please run from the AGI project directory.');
        process.exit(1);
    }
    
    // Check if dependencies are installed
    if (!fs.existsSync('./node_modules')) {
        console.log('📦 Installing dependencies...');
        const { spawn } = require('child_process');
        
        const npmInstall = spawn('npm', ['install'], { stdio: 'inherit' });
        
        await new Promise((resolve, reject) => {
            npmInstall.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`npm install failed with code ${code}`));
                }
            });
        });
    }
    
    // Start the server
    console.log('🚀 Starting AGI MCP Server...');
    
    try {
        // Import and start the launcher
        const { main } = require('./launcher.js');
        
        // Set command line args for launcher
        process.argv = ['node', 'quick-start.js', 'start'];
        
        await main();
        
    } catch (error) {
        console.error('❌ Startup failed:', error.message);
        console.error('\\n🔍 Troubleshooting:');
        console.error('  1. Make sure you\\'re in the AGI project directory');
        console.error('  2. Run: npm install');
        console.error('  3. Check if ports 3050-3060 are available');
        console.error('  4. Try: npm run ports:status');
        console.error('\\n📖 Full error details:');
        console.error(error.stack);
        process.exit(1);
    }
}

if (require.main === module) {
    quickStart().catch(error => {
        console.error('💥 Quick start failed:', error.message);
        process.exit(1);
    });
}

module.exports = { quickStart };
