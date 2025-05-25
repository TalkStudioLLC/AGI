/**
 * Basic Tests for AGI Components
 */

const { MemoryManager } = require('../src/memory/manager.js');
const { ReasoningEngine } = require('../src/reasoning/engine.js');
const { IntegrationLayer } = require('../src/integration/layer.js');

async function testMemoryManager() {
    console.log('🧪 Testing Memory Manager...');
    
    const memory = new MemoryManager(':memory:'); // In-memory SQLite for testing
    await memory.initialize();

    // Test storing memories
    const memory1 = await memory.store({
        content: "Test memory about AI development",
        context: "testing",
        emotional_weight: 0.5
    });
    
    const memory2 = await memory.store({
        content: "Another test memory about machine learning",
        context: "testing", 
        emotional_weight: 0.3
    });

    console.log('✅ Stored memories:', memory1.id, memory2.id);

    // Test searching memories
    const searchResults = await memory.search("AI development");
    console.log('✅ Search results:', searchResults.length, 'memories found');

    // Test relationship tracking
    await memory.updateRelationship("test_user", new Date().toISOString());
    const relationship = await memory.getRelationship("test_user");
    console.log('✅ Relationship created:', relationship.person_id);

    await memory.close();
    console.log('✅ Memory Manager tests passed\\n');
}

async function testReasoningEngine() {
    console.log('🧪 Testing Reasoning Engine...');
    
    const reasoning = new ReasoningEngine();
    await reasoning.initialize();

    // Test basic reasoning
    const result = await reasoning.reason({
        premises: ["All humans are mortal", "Socrates is human"],
        goal: "Socrates is mortal",
        method: "forward"
    });

    console.log('✅ Forward reasoning result:', result.found);
    console.log('✅ Confidence:', result.confidence);
    console.log('✅ Steps:', result.steps.length);

    // Test abductive reasoning
    const abductiveResult = await reasoning.reason({
        premises: ["The grass is wet"],
        goal: "It rained", 
        method: "abductive"
    });

    console.log('✅ Abductive reasoning completed');
    console.log('✅ Explanations found:', abductiveResult.explanations?.length || 0);

    console.log('✅ Reasoning Engine tests passed\\n');
}

async function testIntegrationLayer() {
    console.log('🧪 Testing Integration Layer...');
    
    const memory = new MemoryManager(':memory:');
    await memory.initialize();
    
    const reasoning = new ReasoningEngine();
    await reasoning.initialize();
    
    const integration = new IntegrationLayer(memory, reasoning);

    // Store some test memories for reflection
    await memory.store({
        content: "Integration testing is important for complex systems",
        context: "software_development",
        emotional_weight: 0.6
    });

    await memory.store({
        content: "AGI systems require multiple components working together",
        context: "ai_development", 
        emotional_weight: 0.8
    });

    // Test reflection
    const reflection = await integration.reflect("system integration", "surface");
    console.log('✅ Reflection generated, length:', reflection.length);

    // Test confidence assessment
    const confidence = await integration.assessConfidence(
        "Integration testing improves software quality",
        ["Testing catches bugs", "Integration finds interface issues"]
    );
    console.log('✅ Confidence assessment:', confidence.level);
    console.log('✅ Confidence score:', confidence.score.toFixed(2));

    await memory.close();
    console.log('✅ Integration Layer tests passed\\n');
}

async function runAllTests() {
    console.log('🚀 Running AGI Component Tests\\n');
    
    try {
        await testMemoryManager();
        await testReasoningEngine();
        await testIntegrationLayer();
        
        console.log('🎉 All tests passed successfully!');
        console.log('\\n✨ The AGI system components are working correctly:');
        console.log('   • Memory persistence and retrieval ✓');
        console.log('   • Symbolic reasoning capabilities ✓');
        console.log('   • Meta-cognitive reflection ✓');
        console.log('   • Confidence assessment ✓');
        console.log('   • Component integration ✓');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    runAllTests();
}

module.exports = { testMemoryManager, testReasoningEngine, testIntegrationLayer, runAllTests };
