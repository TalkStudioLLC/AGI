#!/usr/bin/env node

/**
 * Debug launcher for AGI MCP Server
 * 
 * This version provides detailed error information to help diagnose startup issues
 */

const path = require('path');

async function debugStart() {
    console.log('🔍 AGI MCP Server Debug Mode\\n');
    
    try {
        console.log('1️⃣ Loading modules...');
        
        // Test each module loading individually
        console.log('   Loading PortManager...');
        const { PortManager } = require('./src/utils/port_manager.js');
        console.log('   ✅ PortManager loaded');
        
        console.log('   Loading MemoryManager...');
        const { MemoryManager } = require('./src/memory/manager.js');
        console.log('   ✅ MemoryManager loaded');
        
        console.log('   Loading ReasoningEngine...');
        const { ReasoningEngine } = require('./src/reasoning/engine.js');
        console.log('   ✅ ReasoningEngine loaded');
        
        console.log('   Loading IntegrationLayer...');
        const { IntegrationLayer } = require('./src/integration/layer.js');
        console.log('   ✅ IntegrationLayer loaded');
        
        console.log('   Loading AGIServer...');
        const { AGIServer } = require('./src/mcp/server.js');
        console.log('   ✅ AGIServer loaded');
        
        console.log('\\n2️⃣ Creating server instance...');
        const server = new AGIServer(null);
        console.log('   ✅ Server instance created');
        
        console.log('\\n3️⃣ Initializing port manager...');
        const port = await server.initializePort();
        console.log(`   ✅ Port initialized: ${port}`);
        
        console.log('\\n4️⃣ Initializing memory manager...');
        await server.memoryManager.initialize();
        console.log('   ✅ Memory manager initialized');
        
        console.log('\\n5️⃣ Initializing reasoning engine...');
        await server.reasoningEngine.initialize();
        console.log('   ✅ Reasoning engine initialized');
        
        console.log('\\n6️⃣ Starting HTTP server...');
        await server.startHttpServer();
        console.log('   ✅ HTTP server started');
        
        console.log('\\n🎉 Server successfully started!');
        console.log(`📍 Web interface: http://localhost:${port}`);
        console.log(`🔌 WebSocket MCP: ws://localhost:${port}/mcp`);
        
        // Keep running
        console.log('\\n⌨️  Press Ctrl+C to stop the server');
        
        // Set up graceful shutdown
        const shutdown = async () => {
            console.log('\\n🛑 Shutting down...');
            await server.stop();    
            process.exit(0);
        };
        
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        
    } catch (error) {
        console.error('\\n❌ Debug startup failed at step:', error.message);
        console.error('\\n📋 Error details:');
        console.error('   Type:', error.constructor.name);
        console.error('   Message:', error.message);
        if (error.code) {
            console.error('   Code:', error.code);
        }
        console.error('\\n📚 Stack trace:');
        console.error(error.stack);
        
        console.error('\\n🔧 Troubleshooting suggestions:');
        console.error('   1. Check if all dependencies are installed: npm install');
        console.error('   2. Check if ports 3050-3060 are available');
        console.error('   3. Try running: npm run ports:status');
        console.error('   4. Verify file permissions in the project directory');
        
        process.exit(1);
    }
}

if (require.main === module) {
    debugStart();
}

module.exports = { debugStart };
