#!/usr/bin/env node

/**
 * Simple AGI Server Launcher
 * 
 * Bypasses MCP SDK issues with a direct HTTP/WebSocket implementation
 */

const { SimpleAGIServer } = require('./src/simple/server.js');

async function startSimpleServer() {
    console.log('🧠 Starting Simple AGI Server...\n');
    
    try {
        const port = process.argv[2] ? parseInt(process.argv[2]) : null;
        
        console.log('📡 Initializing server...');
        const server = new SimpleAGIServer(port);
        
        console.log('🚀 Starting server...');
        await server.start();
        
        console.log('\n✅ Server started successfully!');
        console.log('🌐 Open your browser and visit the web interface');
        console.log('🧪 Try the interactive test tools');
        console.log('\n⌨️  Press Ctrl+C to stop the server');
        
        // Graceful shutdown
        const shutdown = async () => {
            console.log('\n🛑 Shutting down Simple AGI Server...');
            await server.stop();
            process.exit(0);
        };
        
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        
    } catch (error) {
        console.error('❌ Failed to start Simple AGI Server:', error.message);
        console.error('\n🔍 Error details:');
        console.error(error.stack);
        console.error('\n💡 Try:');
        console.error('   1. npm install');
        console.error('   2. Check if ports 3050-3060 are available');
        console.error('   3. Run: npm run ports:status');
        process.exit(1);
    }
}

if (require.main === module) {
    startSimpleServer();
}

module.exports = { startSimpleServer };
