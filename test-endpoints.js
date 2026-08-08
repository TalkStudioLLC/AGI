#!/usr/bin/env node

// Quick test for the remember endpoint
const API_URL = 'https://agi-memory-api-3ibabnlfhq-uk.a.run.app';

console.log('🧪 Testing AGI Memory API Endpoints');
console.log('===================================');

async function testEndpoint(name, method, path, body = null) {
  try {
    console.log(`\n📋 Testing ${name}...`);
    
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_URL}${path}`, options);
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Success: ${JSON.stringify(data).substring(0, 100)}...`);
      return data;
    } else {
      const text = await response.text();
      console.log(`   ❌ Failed: ${text.substring(0, 200)}...`);
      return null;
    }
  } catch (error) {
    console.log(`   💥 Error: ${error.message}`);
    return null;
  }
}

async function runTests() {
  // Test 1: Health check
  await testEndpoint('Health Check', 'GET', '/health');
  
  // Test 2: Root endpoint
  await testEndpoint('Root Endpoint', 'GET', '/');
  
  // Test 3: Memory query
  await testEndpoint('Memory Query', 'GET', '/api/memories?query=test&limit=3');
  
  // Test 4: Simple remember
  await testEndpoint('Simple Remember', 'POST', '/api/remember', {
    content: 'Test memory from endpoint test'
  });
  
  // Test 5: Full remember
  await testEndpoint('Full Remember', 'POST', '/api/remember', {
    content: 'Full test memory',
    context: 'testing',
    emotional_weight: 0.8
  });
  
  // Test 6: Recall
  await testEndpoint('Recall', 'POST', '/api/recall', {
    query: 'test',
    limit: 5
  });
  
  console.log('\n✅ Test completed');
}

runTests().catch(console.error);
