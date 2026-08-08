#!/usr/bin/env node

/**
 * Test Local Memory System
 * Tests if the local MCP server is working properly
 */

import { MemoryManager } from './src/memory/manager.js';

async function testLocalMemory() {
    console.log('🧪 Testing Local Memory System');
    console.log('=' .repeat(40));
    
    try {
        // Initialize memory manager
        console.log('📋 Step 1: Initialize Memory Manager');
        const memoryManager = new MemoryManager();
        await memoryManager.initialize();
        console.log('✅ Memory manager initialized');
        
        // Store a test memory
        console.log('\n📋 Step 2: Store Test Memory');
        const testMemory = await memoryManager.store({
            content: 'Local memory system test - F3IL working with Tom',
            context: 'system_test',
            emotional_weight: 0.8,
            timestamp: new Date().toISOString()
        });
        console.log(`✅ Stored memory with ID: ${testMemory.id}`);
        
        // Retrieve the memory
        console.log('\n📋 Step 3: Retrieve Test Memory');
        const memories = await memoryManager.search('F3IL working', 'system_test');
        console.log(`✅ Found ${memories.length} memories`);
        
        if (memories.length > 0) {
            console.log('   Memory content:', memories[0].content);
            console.log('   Confidence:', (memories[0].confidence * 100).toFixed(1) + '%');
        }
        
        console.log('\n🎉 Local memory system is working!');
        console.log('   ⚠️  Now restart Claude Desktop to activate the new configuration');
        
    } catch (error) {
        console.error('\n💥 Local memory test failed:', error.message);
        console.error('   Full error:', error);
        process.exit(1);
    }
}

// Run test
testLocalMemory();
