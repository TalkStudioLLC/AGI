#!/usr/bin/env node

/**
 * AGI MCP Server Launcher
 * 
 * Smart launcher that handles port management and server startup
 */

const { AGIServer } = require('./src/mcp/server.js');
const { PortManager } = require('./src/utils/port_manager.js');

async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'start';
    
    console.log('🧠 AGI MCP Server Launcher\n');
    
    switch (command) {
        case 'start':
            await startServer(args[1], args[2]);
            break;
            
        case 'ports':
            await managePort(args[1], args[2]);
            break;
            
        case 'status':
            await showStatus();
            break;
            
        case 'stop':
            await stopServer(args[1]);
            break;
            
        case 'help':
        case '--help':
        case '-h':
            showHelp();
            break;
            
        default:
            console.log(`Unknown command: ${command}`);
            showHelp();
            process.exit(1);
    }
}

async function startServer(portArg, modeArg) {
    try {
        const port = portArg ? parseInt(portArg) : null;
        const mode = modeArg || 'auto';
        
        console.log('📡 Starting AGI MCP Server...');
        
        if (port) {
            console.log(`🎯 Requesting port: ${port}`);
        } else {
            console.log('🔍 Finding available port in range 3050-3060...');
        }
        
        const server = new AGIServer(port);
        
        // Graceful shutdown handlers
        const shutdown = async () => {
            console.log('\\n🛑 Shutting down AGI MCP Server...');
            await server.stop();
            process.exit(0);
        };
        
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        process.on('SIGQUIT', shutdown);
        
        await server.run(mode);
        
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

async function managePort(action, port) {
    const portManager = new PortManager();
    
    switch (action) {
        case 'status':
            const status = await portManager.getPortStatus();
            console.log('🔌 Port Status (3050-3060):');
            Object.entries(status).forEach(([port, info]) => {
                const emoji = info.available ? 
                    (info.locked ? '🟡' : '🟢') : '🔴';
                const statusText = info.available ? 
                    (info.locked ? 'Available (locked)' : 'Available') : 'In use';
                console.log(`  ${emoji} ${port}: ${statusText}`);
                if (info.lock_info) {
                    console.log(`    └─ Locked by PID ${info.lock_info.pid} at ${new Date(info.lock_info.timestamp).toLocaleString()}`);
                }
            });
            break;
            
        case 'list':
            const activePorts = await portManager.listActivePorts();
            if (activePorts.length === 0) {
                console.log('📭 No active AGI MCP servers');
            } else {
                console.log('📋 Active AGI MCP servers:');
                activePorts.forEach(p => {
                    console.log(`  🚀 Port ${p.port}: PID ${p.pid} (${p.server})`);
                    console.log(`     Started: ${new Date(p.timestamp).toLocaleString()}`);
                });
            }
            break;
            
        case 'find':
            const preferredPort = port ? parseInt(port) : null;
            try {
                const availablePort = await portManager.findAvailablePort(preferredPort);
                console.log(`✅ Available port: ${availablePort}`);
                // Release it immediately since we're just checking
                await portManager.releasePort(availablePort);
            } catch (error) {
                console.error(`❌ ${error.message}`);
            }
            break;
            
        case 'release':
            if (!port) {
                console.error('❌ Please specify port number to release');
                return;
            }
            const releasePort = parseInt(port);
            await portManager.releasePort(releasePort);
            console.log(`✅ Released port ${releasePort}`);
            break;
            
        default:
            console.log('❌ Unknown port command. Use: status, list, find, or release');
    }
}

async function showStatus() {
    console.log('📊 AGI MCP Server Status\\n');
    
    // Show port status
    await managePort('status');
    
    console.log('\\n📋 Active Servers:');
    await managePort('list');
    
    console.log('\\n💾 Memory Database:');
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.join(process.cwd(), 'agi_memory.db');
    
    if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        console.log(`  📁 Database file: ${dbPath}`);
        console.log(`  📏 Size: ${(stats.size / 1024).toFixed(2)} KB`);
        console.log(`  📅 Modified: ${stats.mtime.toLocaleString()}`);
    } else {
        console.log('  📭 No memory database found (will be created on first run)');
    }
}

async function stopServer(port) {
    if (!port) {
        console.log('❌ Please specify port number of server to stop');
        return;
    }
    
    console.log(`🛑 Stopping server on port ${port}...`);
    
    try {
        // Try to connect to check if server is running
        const http = require('http');
        const options = {
            hostname: 'localhost',
            port: port,
            path: '/health',
            method: 'GET',
            timeout: 5000
        };
        
        const req = http.request(options, (res) => {
            console.log('📡 Server is running, attempting graceful shutdown...');
            console.log('⚠️  Manual shutdown required - use Ctrl+C on the server process');
        });
        
        req.on('error', () => {
            console.log('📭 Server not responding on HTTP, may already be stopped');
        });
        
        req.on('timeout', () => {
            console.log('⏰ Server health check timed out');
        });
        
        req.end();
        
    } catch (error) {
        console.log('📭 Server not responding, may already be stopped');
    }
    
    // Release port lock
    const portManager = new PortManager();
    await portManager.releasePort(parseInt(port));
    console.log(`✅ Released port lock for ${port}`);
}

function showHelp() {
    console.log(`
🧠 AGI MCP Server Launcher

Usage:
  node launcher.js <command> [options]

Commands:
  start [port] [mode]     Start the AGI MCP server
                         port: specific port (3050-3060) or auto-select
                         mode: 'stdio', 'http', or 'auto' (default)
  
  ports <action> [port]   Manage server ports
                         actions: status, list, find, release
  
  status                  Show comprehensive server status
  
  stop <port>            Stop server on specified port
  
  help                   Show this help message

Examples:
  node launcher.js start              # Auto-select port, auto-detect mode
  node launcher.js start 3055         # Use port 3055
  node launcher.js start 3056 http    # Use port 3056 in HTTP mode
  node launcher.js start null stdio   # Use stdio mode for MCP clients
  
  node launcher.js ports status       # Show port availability
  node launcher.js ports list         # List running servers
  node launcher.js ports find 3055    # Check if port 3055 is available
  node launcher.js ports release 3055 # Release port 3055 lock
  
  node launcher.js status             # Show comprehensive status
  node launcher.js stop 3055          # Stop server on port 3055

Port Range: 3050-3060
Modes:
  - stdio: For MCP clients (Claude, etc.)
  - http:  For web browsers and HTTP clients  
  - auto:  Automatically detect based on environment
    `);
}

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the launcher
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Launcher error:', error.message);
        process.exit(1);
    });
}

module.exports = { main };
