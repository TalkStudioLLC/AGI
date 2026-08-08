#!/usr/bin/env node

/**
 * AGI Memory System API Connectivity Test
 * Tests the cloud API endpoint directly
 */

const CLOUD_API_BASE_URL = 'https://claude-memory-api-274213809869.us-east4.run.app';

async function testApiEndpoint(endpoint, method = 'GET', body = null) {
    const url = `${CLOUD_API_BASE_URL}${endpoint}`;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        console.log(`🔍 Testing ${method} ${url}`);
        const response = await fetch(url, options);
        
        console.log(`   Status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log(`   ✅ Success:`, result);
        return result;
    } catch (error) {
        console.error(`   ❌ Failed: ${error.message}`);
        throw error;
    }
}

async function runApiTests() {
    console.log('🧪 AGI Memory System API Connectivity Test');
    console.log('=' .repeat(50));
    
    try {
        // Test 1: Health check (if available)
        console.log('\n📋 Test 1: Health Check');
        try {
            await testApiEndpoint('/health');
        } catch (error) {
            console.log('   ℹ️  Health endpoint not available (expected)');
        }
        
        // Test 2: Store a memory
        console.log('\n📋 Test 2: Store Memory');
        const storeResult = await testApiEndpoint('/api/remember', 'POST', {
            content: 'API connectivity test memory',
            context: 'api_test',
            emotional_weight: 0.8
        });
        
        // Test 3: Retrieve memories
        console.log('\n📋 Test 3: Retrieve Memories');
        await testApiEndpoint('/api/memories?query=API connectivity test&limit=5');
        
        // Test 4: Reflection
        console.log('\n📋 Test 4: Reflection');
        await testApiEndpoint('/api/reflect', 'POST', {
            topic: 'API testing',
            depth: 'surface'
        });
        
        console.log('\n🎉 All API tests passed!');
        
    } catch (error) {
        console.error('\n💥 API test failed:', error.message);
        process.exit(1);
    }
}

// Run tests
runApiTests();
