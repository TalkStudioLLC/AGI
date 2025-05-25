#!/usr/bin/env node

/**
 * Simple AGI MCP Server Start
 * 
 * Minimal startup without the launcher complexity
 */

const { AGIServer } = require('./src/mcp/server.js');

async function simpleStart() {
    console.log('🧠 Simple AGI MCP Server Start\\n');
    
    try {
        console.log('📡 Creating server...');
        
        // Create server with fixed port to avoid port manager complexity
        const server = new AGIServer(3050);
        
        console.log('🚀 Starting server...');
        
        // Start in HTTP mode explicitly
        await server.run('http');
        
        console.log('✅ Server started successfully!');
        
    } catch (error) {
        console.error('❌ Simple start failed:', error.message);
        console.error('Full error:', error.stack);
        process.exit(1);
    }
}

if (require.main === module) {
    simpleStart();
}

module.exports = { simpleStart };
