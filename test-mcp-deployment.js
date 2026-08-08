#!/usr/bin/env node

// Test script for MCP server and cloud API connectivity
import { spawn } from 'child_process';
import { createReadStream, createWriteStream } from 'fs';

const CLOUD_API_BASE_URL = 'https://agi-memory-api-3ibabnlfhq-uk.a.run.app';
const TEST_TIMEOUT = 30000; // 30 seconds

console.log('🧪 Testing MCP Server and Cloud API Connectivity');
console.log('================================================');

// Test 1: Check if the cloud API endpoint is accessible
async function testCloudAPIConnectivity() {
  console.log('\n1. Testing Cloud API Connectivity...');
  
  try {
    console.log(`   Checking: ${CLOUD_API_BASE_URL}`);
    
    const response = await fetch(CLOUD_API_BASE_URL, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('   ✅ Cloud API is accessible');
      console.log(`   📊 Status: ${response.status}`);
      console.log(`   📋 Response:`, JSON.stringify(data, null, 2));
      return true;
    } else {
      console.log(`   ❌ Cloud API returned status: ${response.status}`);
      const text = await response.text();
      console.log(`   📋 Error response: ${text}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Cloud API connection failed: ${error.message}`);
    return false;
  }
}

// Test 2: Check specific API endpoints
async function testAPIEndpoints() {
  console.log('\n2. Testing API Endpoints...');
  
  const endpoints = [
    { path: '/health', method: 'GET', description: 'Health check' },
    { path: '/api/remember', method: 'POST', description: 'Remember endpoint', 
      body: { content: 'Test memory from MCP test', context: 'testing', emotional_weight: 0.7 } },
    { path: '/api/memories', method: 'GET', description: 'Memory query', 
      query: '?query=test&limit=5' }
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`   Testing ${endpoint.description}: ${endpoint.method} ${endpoint.path}`);
      
      const url = `${CLOUD_API_BASE_URL}${endpoint.path}${endpoint.query || ''}`;
      const options = {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000)
      };
      
      if (endpoint.body) {
        options.body = JSON.stringify(endpoint.body);
      }
      
      const response = await fetch(url, options);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ ${endpoint.description}: SUCCESS`);
        console.log(`      Response: ${JSON.stringify(data).substring(0, 100)}...`);
      } else {
        console.log(`   ❌ ${endpoint.description}: FAILED (${response.status})`);
        const text = await response.text();
        console.log(`      Error: ${text.substring(0, 200)}...`);
      }
    } catch (error) {
      console.log(`   ❌ ${endpoint.description}: ERROR - ${error.message}`);
    }
  }
}

// Test 3: Test MCP server startup
async function testMCPServerStartup() {
  console.log('\n3. Testing MCP Server Startup...');
  
  return new Promise((resolve) => {
    console.log('   Starting MCP server...');
    
    const mcpProcess = spawn('node', ['cloud-memory-server.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });
    
    let serverStarted = false;
    let errorOutput = '';
    
    // Timeout handler
    const timeout = setTimeout(() => {
      if (!serverStarted) {
        console.log('   ❌ MCP server startup timed out');
        mcpProcess.kill();
        resolve(false);
      }
    }, TEST_TIMEOUT);
    
    // Handle stderr (where MCP server logs go)
    mcpProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.log(`   📋 MCP Server: ${output.trim()}`);
      
      if (output.includes('Cloud Memory MCP server running on stdio')) {
        console.log('   ✅ MCP server started successfully');
        serverStarted = true;
        clearTimeout(timeout);
        
        // Test a simple MCP command
        testMCPCommand(mcpProcess).then((commandResult) => {
          mcpProcess.kill();
          resolve(commandResult);
        });
      }
    });
    
    // Handle stdout
    mcpProcess.stdout.on('data', (data) => {
      console.log(`   📤 MCP Output: ${data.toString().trim()}`);
    });
    
    // Handle errors
    mcpProcess.on('error', (error) => {
      console.log(`   ❌ MCP server error: ${error.message}`);
      clearTimeout(timeout);
      resolve(false);
    });
    
    mcpProcess.on('exit', (code, signal) => {
      console.log(`   🔚 MCP server exited with code ${code}, signal ${signal}`);
      clearTimeout(timeout);
      if (!serverStarted) {
        resolve(false);
      }
    });
  });
}

// Test 4: Send a command to MCP server
async function testMCPCommand(mcpProcess) {
  console.log('   🔄 Testing MCP command execution...');
  
  return new Promise((resolve) => {
    let responseReceived = false;
    
    // Prepare a list tools request
    const listToolsRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list"
    };
    
    // Set up response handler
    mcpProcess.stdout.on('data', (data) => {
      try {
        const response = JSON.parse(data.toString().trim());
        if (response.id === 1 && response.result && response.result.tools) {
          console.log(`   ✅ MCP command successful - Found ${response.result.tools.length} tools`);
          console.log(`   📋 Available tools: ${response.result.tools.map(t => t.name).join(', ')}`);
          responseReceived = true;
          resolve(true);
        }
      } catch (error) {
        // Ignore JSON parse errors - might be partial data
      }
    });
    
    // Send the request
    mcpProcess.stdin.write(JSON.stringify(listToolsRequest) + '\n');
    
    // Timeout for command response
    setTimeout(() => {
      if (!responseReceived) {
        console.log('   ❌ MCP command timed out');
        resolve(false);
      }
    }, 5000);
  });
}

// Test 5: Check Claude Desktop configuration
async function testClaudeDesktopConfig() {
  console.log('\n4. Checking Claude Desktop Configuration...');
  
  try {
    const configPath = 'claude_desktop_config.json.example';
    const { readFile } = await import('fs/promises');
    
    try {
      const configContent = await readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);
      
      console.log('   ✅ Found Claude Desktop config example');
      console.log('   📋 Config structure:', Object.keys(config));
      
      if (config.mcpServers && config.mcpServers['cloud-memory-server']) {
        console.log('   ✅ Cloud memory server configuration found');
        const serverConfig = config.mcpServers['cloud-memory-server'];
        console.log(`   📋 Server command: ${serverConfig.command}`);
        console.log(`   📋 Server args: ${serverConfig.args?.join(' ') || 'none'}`);
      } else {
        console.log('   ⚠️  Cloud memory server not configured in example');
      }
    } catch (fileError) {
      console.log(`   ⚠️  Config file not found or invalid: ${fileError.message}`);
    }
  } catch (error) {
    console.log(`   ❌ Error checking config: ${error.message}`);
  }
}

// Main test runner
async function runAllTests() {
  console.log(`🎯 Target Cloud API: ${CLOUD_API_BASE_URL}`);
  console.log(`📅 Test started at: ${new Date().toISOString()}\n`);
  
  const results = {
    cloudAPI: await testCloudAPIConnectivity(),
    apiEndpoints: await testAPIEndpoints(),
    mcpServer: await testMCPServerStartup(),
    config: await testClaudeDesktopConfig()
  };
  
  console.log('\n📊 Test Results Summary:');
  console.log('========================');
  console.log(`Cloud API Connectivity: ${results.cloudAPI ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`API Endpoints: ${results.apiEndpoints ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`MCP Server Startup: ${results.mcpServer ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Claude Config: ✅ CHECKED`);
  
  console.log('\n🎯 Next Steps:');
  if (!results.cloudAPI) {
    console.log('   1. Deploy the web server to the cloud API endpoint');
    console.log('   2. Ensure the URL is accessible and returning valid responses');
  }
  if (!results.mcpServer) {
    console.log('   3. Fix MCP server startup issues');
    console.log('   4. Ensure all dependencies are installed (npm install)');
  }
  if (results.cloudAPI && results.mcpServer) {
    console.log('   🎉 MCP server appears to be working correctly!');
    console.log('   📋 You can now use it with Claude Desktop');
  }
  
  console.log('\n✅ Test completed');
}

// Run the tests
runAllTests().catch(console.error);
