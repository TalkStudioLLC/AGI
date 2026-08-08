#!/usr/bin/env node

/**
 * Test ES Module Compatibility
 * Quick test to see if the converted modules load correctly
 */

console.log('Testing ES module imports...');

try {
    // Test importing the main components
    const { MemoryManager } = await import('./src/memory/manager.js');
    console.log('✅ MemoryManager imported successfully');
    
    const { ReasoningEngine } = await import('./src/reasoning/engine.js');
    console.log('✅ ReasoningEngine imported successfully');
    
    const { IntegrationLayer } = await import('./src/integration/layer.js');
    console.log('✅ IntegrationLayer imported successfully');
    
    // Test basic instantiation
    const memoryManager = new MemoryManager();
    const reasoningEngine = new ReasoningEngine();
    const integrationLayer = new IntegrationLayer(memoryManager, reasoningEngine);
    
    console.log('✅ All components instantiated successfully');
    console.log('🎉 ES module conversion successful!');
    
} catch (error) {
    console.error('❌ Error during import test:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
}
