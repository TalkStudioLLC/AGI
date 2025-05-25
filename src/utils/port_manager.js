/**
 * Port Management Utility
 * 
 * Manages port allocation in the range 3050-3060 for AGI MCP servers
 */

const net = require('net');
const fs = require('fs').promises;
const path = require('path');

class PortManager {
    constructor() {
        this.portRange = { start: 3050, end: 3060 };
        this.lockFile = path.join(__dirname, '../../.port_locks.json');
    }

    async findAvailablePort(preferredPort = null) {
        const locks = await this.loadPortLocks();
        
        // Clean up expired locks (older than 1 hour)
        await this.cleanupExpiredLocks(locks);
        
        // If preferred port is specified and available, use it
        if (preferredPort && preferredPort >= this.portRange.start && preferredPort <= this.portRange.end) {
            if (await this.isPortAvailable(preferredPort) && !locks[preferredPort]) {
                await this.lockPort(preferredPort);
                return preferredPort;
            }
        }
        
        // Find any available port in range
        for (let port = this.portRange.start; port <= this.portRange.end; port++) {
            if (!locks[port] && await this.isPortAvailable(port)) {
                await this.lockPort(port);
                return port;
            }
        }
        
        throw new Error(`No available ports in range ${this.portRange.start}-${this.portRange.end}`);
    }

    async isPortAvailable(port) {
        return new Promise((resolve) => {
            const server = net.createServer();
            
            server.listen(port, () => {
                server.close(() => resolve(true));
            });
            
            server.on('error', () => resolve(false));
        });
    }

    async loadPortLocks() {
        try {
            const data = await fs.readFile(this.lockFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return {};
        }
    }

    async savePortLocks(locks) {
        await fs.writeFile(this.lockFile, JSON.stringify(locks, null, 2));
    }

    async lockPort(port) {
        const locks = await this.loadPortLocks();
        locks[port] = {
            pid: process.pid,
            timestamp: new Date().toISOString(),
            server: 'agi-mcp-server'
        };
        await this.savePortLocks(locks);
        
        // Set up cleanup on process exit
        process.on('exit', () => this.releasePort(port));
        process.on('SIGINT', () => this.releasePort(port));
        process.on('SIGTERM', () => this.releasePort(port));
    }

    async releasePort(port) {
        try {
            const locks = await this.loadPortLocks();
            if (locks[port] && locks[port].pid === process.pid) {
                delete locks[port];
                await this.savePortLocks(locks);
            }
        } catch (error) {
            // Ignore errors during cleanup
        }
    }

    async cleanupExpiredLocks(locks) {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        let changed = false;
        
        for (const [port, lock] of Object.entries(locks)) {
            const lockTime = new Date(lock.timestamp);
            if (lockTime < oneHourAgo) {
                delete locks[port];
                changed = true;
            }
        }
        
        if (changed) {
            await this.savePortLocks(locks);
        }
    }

    async listActivePorts() {
        const locks = await this.loadPortLocks();
        await this.cleanupExpiredLocks(locks);
        
        const activePorts = [];
        for (const [port, lock] of Object.entries(locks)) {
            if (await this.isPortAvailable(parseInt(port))) {
                // Port is available but still locked - probably stale lock
                await this.releasePort(parseInt(port));
            } else {
                activePorts.push({
                    port: parseInt(port),
                    pid: lock.pid,
                    timestamp: lock.timestamp,
                    server: lock.server || 'unknown'
                });
            }
        }
        
        return activePorts;
    }

    async getPortStatus() {
        const locks = await this.loadPortLocks();
        const status = {};
        
        for (let port = this.portRange.start; port <= this.portRange.end; port++) {
            const isAvailable = await this.isPortAvailable(port);
            const isLocked = !!locks[port];
            
            status[port] = {
                available: isAvailable,
                locked: isLocked,
                lock_info: locks[port] || null
            };
        }
        
        return status;
    }
}

// CLI usage
if (require.main === module) {
    const portManager = new PortManager();
    const command = process.argv[2];
    
    switch (command) {
        case 'find':
            const preferredPort = process.argv[3] ? parseInt(process.argv[3]) : null;
            portManager.findAvailablePort(preferredPort)
                .then(port => console.log(port))
                .catch(error => {
                    console.error(error.message);
                    process.exit(1);
                });
            break;
            
        case 'list':
            portManager.listActivePorts()
                .then(ports => {
                    if (ports.length === 0) {
                        console.log('No active AGI MCP servers');
                    } else {
                        console.log('Active AGI MCP servers:');
                        ports.forEach(p => {
                            console.log(`  Port ${p.port}: PID ${p.pid} (${p.server}) - ${new Date(p.timestamp).toLocaleString()}`);
                        });
                    }
                })
                .catch(console.error);
            break;
            
        case 'status':
            portManager.getPortStatus()
                .then(status => {
                    console.log('Port Status (3050-3060):');
                    Object.entries(status).forEach(([port, info]) => {
                        const statusText = info.available ? 
                            (info.locked ? '🟡 Available (locked)' : '🟢 Available') : 
                            '🔴 In use';
                        console.log(`  ${port}: ${statusText}`);
                        if (info.lock_info) {
                            console.log(`    Locked by PID ${info.lock_info.pid} at ${new Date(info.lock_info.timestamp).toLocaleString()}`);
                        }
                    });
                })
                .catch(console.error);
            break;
            
        case 'release':
            const releasePort = parseInt(process.argv[3]);
            if (releasePort) {
                portManager.releasePort(releasePort)
                    .then(() => console.log(`Released port ${releasePort}`))
                    .catch(console.error);
            } else {
                console.error('Please specify port number to release');
            }
            break;
            
        default:
            console.log(`
AGI MCP Server Port Manager

Usage:
  node src/utils/port_manager.js find [preferred_port]  - Find available port
  node src/utils/port_manager.js list                   - List active servers
  node src/utils/port_manager.js status                 - Show port status
  node src/utils/port_manager.js release <port>         - Release port lock

Examples:
  node src/utils/port_manager.js find 3055
  node src/utils/port_manager.js status
  node src/utils/port_manager.js release 3055
            `);
    }
}

module.exports = { PortManager };
