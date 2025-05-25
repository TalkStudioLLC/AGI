#!/usr/bin/env node

/**
 * Minimal MCP Server Test
 * 
 * Test basic MCP SDK functionality
 */

async function testMCP() {
    console.log('🧪 Testing MCP SDK...\n');
    
    try {
        console.log('1️⃣ Loading MCP SDK...');
        const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
        console.log('   ✅ MCP SDK loaded');
        
        console.log('2️⃣ Creating basic server...');
        const server = new Server(
            {
                name: 'test-server',
                version: '0.1.0'
            },
            {
                capabilities: {
                    tools: {}
                }
            }
        );
        console.log('   ✅ Server created');
        
        console.log('3️⃣ Testing request handler setup...');
        
        // Try different approaches to setRequestHandler
        try {
            server.setRequestHandler('tools/list', async () => {
                return { tools: [] };
            });
            console.log('   ✅ Request handler set successfully');
        } catch (error) {
            console.log('   ❌ setRequestHandler failed:', error.message);
            
            // Try alternative approaches
            console.log('   🔄 Trying alternative approaches...');
            
            // Check if server has the method
            console.log('   Server methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(server)));
            console.log('   Server properties:', Object.keys(server));
            
            // Check if it's an async initialization issue
            if (typeof server.initialize === 'function') {
                console.log('   🔄 Trying server.initialize()...');
                await server.initialize();
                server.setRequestHandler('tools/list', async () => {
                    return { tools: [] };
                });
                console.log('   ✅ Request handler set after initialize');
            }
        }
        
        console.log('4️⃣ MCP SDK test completed successfully!');
        
    } catch (error) {
        console.error('❌ MCP SDK test failed:', error.message);
        console.error('Stack:', error.stack);
        
        // Check SDK version
        const packageJson = require('./package.json');
        console.log('\n📦 Dependency versions:');
        console.log('   @modelcontextprotocol/sdk:', packageJson.dependencies['@modelcontextprotocol/sdk']);
        
        // Try to get more info about the SDK
        try {
            const sdkPackage = require('./node_modules/@modelcontextprotocol/sdk/package.json');
            console.log('   Installed SDK version:', sdkPackage.version);
        } catch (e) {
            console.log('   Could not read SDK package.json');
        }
    }
}

if (require.main === module) {
    testMCP();
}

module.exports = { testMCP };
