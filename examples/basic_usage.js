/**
 * Basic Usage Example for AGI MCP Server
 * 
 * This example demonstrates how to interact with the AGI server
 * to store memories, perform reasoning, and engage in reflection.
 */

const { AGIServer } = require('../src/mcp/server.js');

async function demonstrateAGICapabilities() {
    console.log('🧠 AGI MCP Server Demonstration');
    console.log('================================\\n');

    const server = new AGIServer();
    
    try {
        // Initialize the server components
        await server.memoryManager.initialize();
        await server.reasoningEngine.initialize();
        
        console.log('✅ Server initialized successfully\\n');

        // Demonstrate memory storage
        console.log('📝 Storing memories...');
        await server.handleRemember({
            content: "Tom is working on an AGI project using MCP",
            context: "project_work",
            emotional_weight: 0.8
        });

        await server.handleRemember({
            content: "The AGI system should have persistent memory and reasoning capabilities",
            context: "project_requirements",
            emotional_weight: 0.7
        });

        await server.handleRemember({
            content: "Safety and value alignment are critical for AGI development",
            context: "safety_concerns",
            emotional_weight: 0.9
        });
        
        console.log('✅ Memories stored\\n');

        // Demonstrate memory recall
        console.log('🔍 Recalling memories about AGI...');
        const recallResult = await server.handleRecall({
            query: "AGI development",
            context: null
        });
        console.log(recallResult.content[0].text);
        console.log('');

        // Demonstrate reasoning
        console.log('🧮 Performing logical reasoning...');
        const reasoningResult = await server.handleReason({
            premises: [
                "AGI systems need persistent memory",
                "Persistent memory enables continuous relationships",
                "Continuous relationships improve AI helpfulness"
            ],
            goal: "AGI systems with persistent memory are more helpful",
            method: "forward"
        });
        console.log(reasoningResult.content[0].text);
        console.log('');

        // Demonstrate confidence assessment
        console.log('📊 Assessing confidence in a statement...');
        const confidenceResult = await server.handleAssessConfidence({
            statement: "AGI development requires careful safety considerations",
            evidence: [
                "AI systems can have unintended consequences",
                "AGI would have significant societal impact",
                "Value alignment is a known challenge in AI"
            ]
        });
        console.log(confidenceResult.content[0].text);
        console.log('');

        // Demonstrate reflection
        console.log('🤔 Engaging in meta-cognitive reflection...');
        const reflectionResult = await server.handleReflect({
            topic: "AGI development challenges",
            depth: "deep"
        });
        console.log(reflectionResult.content[0].text);
        console.log('');

        // Show memory statistics
        console.log('📈 Memory system statistics:');
        const memoryStats = await server.memoryManager.getMemoryStats();
        console.log(`Total memories: ${memoryStats.total_memories}`);
        console.log(`Memory types: ${memoryStats.memory_types.map(t => `${t.type}(${t.count})`).join(', ')}`);
        console.log(`Relationships tracked: ${memoryStats.relationships}`);
        console.log('');

        // Show reasoning statistics
        console.log('🔬 Reasoning engine statistics:');
        const reasoningStats = server.reasoningEngine.getReasoningStats();
        console.log(`Total rules: ${reasoningStats.total_rules}`);
        console.log(`Known facts: ${reasoningStats.total_facts}`);
        console.log(`Reasoning sessions: ${reasoningStats.reasoning_sessions}`);
        console.log('');

        console.log('🎉 Demonstration completed successfully!');
        console.log('\\n💡 This AGI system now has:');
        console.log('   • Persistent memory across sessions');
        console.log('   • Symbolic reasoning capabilities');
        console.log('   • Meta-cognitive reflection abilities');
        console.log('   • Confidence assessment mechanisms');
        console.log('   • Relationship tracking and emotional continuity');

    } catch (error) {
        console.error('❌ Error during demonstration:', error);
    } finally {
        // Clean up
        await server.memoryManager.close();
    }
}

async function interactiveSession() {
    console.log('\\n🗣️  Interactive AGI Session');
    console.log('============================\\n');

    const server = new AGIServer();
    await server.memoryManager.initialize();
    await server.reasoningEngine.initialize();

    // Simulate a conversation with persistent memory
    const personId = "user_tom";
    
    // First interaction
    await server.memoryManager.store({
        content: "Tom asked about implementing persistent memory in AI systems",
        context: "conversation",
        type: "episodic",
        person_id: personId,
        emotional_weight: 0.6
    });

    // Second interaction (later)
    await server.memoryManager.store({
        content: "Tom shared his vision for AGI with emotional continuity and relationship building",
        context: "conversation", 
        type: "episodic",
        person_id: personId,
        emotional_weight: 0.8
    });

    // Third interaction (building on previous)
    await server.memoryManager.store({
        content: "Tom is building an MCP server to explore these AGI concepts practically",
        context: "conversation",
        type: "episodic", 
        person_id: personId,
        emotional_weight: 0.7
    });

    // Recall relationship history
    console.log('📚 Relationship history with Tom:');
    const history = await server.memoryManager.getRelationshipHistory(personId);
    history.forEach((memory, index) => {
        console.log(`${index + 1}. ${new Date(memory.timestamp).toLocaleDateString()}: ${memory.content}`);
    });

    console.log('\\n🤝 Relationship stats:');
    const relationship = await server.memoryManager.getRelationship(personId);
    if (relationship) {
        console.log(`Interactions: ${relationship.interaction_count}`);
        console.log(`Emotional bond: ${(relationship.emotional_bond * 100).toFixed(1)}%`);
        console.log(`Last interaction: ${new Date(relationship.last_interaction).toLocaleDateString()}`);
    }

    await server.memoryManager.close();
}

// Run demonstrations
if (require.main === module) {
    (async () => {
        await demonstrateAGICapabilities();
        await interactiveSession();
    })();
}

module.exports = { demonstrateAGICapabilities, interactiveSession };
