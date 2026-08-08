#!/usr/bin/env node

/**
 * AGI Memory System Error Handling Test
 * Tests various error scenarios and edge cases
 */

const CLOUD_API_BASE_URL = 'https://claude-memory-api-274213809869.us-east4.run.app';

async function testErrorScenarios() {
    console.log('🧪 AGI Memory System Error Handling Test');
    console.log('=' .repeat(50));
    
    const testCases = [
        {
            name: 'Invalid endpoint',
            url: '/api/nonexistent',
            method: 'GET',
            expectError: true
        },
        {
            name: 'Malformed JSON',
            url: '/api/remember', 
            method: 'POST',
            body: '{"invalid": json}',
            expectError: true
        },
        {
            name: 'Missing required fields',
            url: '/api/remember',
            method: 'POST', 
            body: '{}',
            expectError: true
        },
        {
            name: 'Large content test',
            url: '/api/remember',
            method: 'POST',
            body: JSON.stringify({
                content: 'A'.repeat(10000), // 10KB of content
                context: 'stress_test',
                emotional_weight: 0.5
            }),
            expectError: false
        }
    ];
    
    for (const testCase of testCases) {
        console.log(`\n📋 Testing: ${testCase.name}`);
        
        try {
            const options = {
                method: testCase.method,
                headers: {
                    'Content-Type': 'application/json',
                },
            };
            
            if (testCase.body) {
                options.body = testCase.body;
            }
            
            const response = await fetch(`${CLOUD_API_BASE_URL}${testCase.url}`, options);
            
            if (testCase.expectError && response.ok) {
                console.log(`   ⚠️  Expected error but got success: ${response.status}`);
            } else if (!testCase.expectError && !response.ok) {
                console.log(`   ❌ Unexpected error: ${response.status} ${response.statusText}`);
            } else {
                console.log(`   ✅ Expected result: ${response.status} ${response.statusText}`);
            }
            
        } catch (error) {
            if (testCase.expectError) {
                console.log(`   ✅ Expected error caught: ${error.message}`);
            } else {
                console.log(`   ❌ Unexpected error: ${error.message}`);
            }
        }
    }
    
    console.log('\n🎉 Error handling tests completed!');
}

// Run error tests
testErrorScenarios();
