#!/usr/bin/env node

/**
 * Simple MCP-Compatible AGI Server
 * 
 * Manual JSON-RPC implementation that bypasses MCP SDK issues
 */

const { MemoryManager } = require('./src/memory/manager.js');
const { ReasoningEngine } = require('./src/reasoning/engine.js');
const { IntegrationLayer } = require('./src/integration/layer.js');

class SimpleMCPServer {
    constructor() {
        this.memoryManager = new MemoryManager();
        this.reasoningEngine = new ReasoningEngine();
        this.integrationLayer = new IntegrationLayer(this.memoryManager, this.reasoningEngine);
        
        this.initialized = false;
        this.setupStdio();
    }
    
    setupStdio() {
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', async (data) => {
            try {
                const lines = data.trim().split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        await this.handleMessage(line.trim());
                    }
                }
            } catch (error) {
                this.sendError(null, -32603, `Parse error: ${error.message}`);
            }
        });
    }
    
    async handleMessage(messageStr) {
        try {
            const message = JSON.parse(messageStr);
            const { id, method, params } = message;
            
            // Initialize if needed
            if (!this.initialized && method !== 'initialize') {
                await this.initialize();
            }
            
            switch (method) {
                case 'initialize':
                    await this.handleInitialize(id, params);
                    break;
                case 'notifications/initialized':
                    // Client finished initializing, no response needed
                    break;
                case 'tools/list':
                    await this.handleToolsList(id);
                    break;
                case 'tools/call':
                    await this.handleToolsCall(id, params);
                    break;
                case 'resources/list':
                    await this.handleResourcesList(id);
                    break;
                case 'resources/read':
                    await this.handleResourcesRead(id, params);
                    break;
                case 'prompts/list':
                    await this.handlePromptsList(id);
                    break;
                case 'prompts/get':
                    await this.handlePromptsGet(id, params);
                    break;
                default:
                    this.sendError(id, -32601, `Method not found: ${method}`);
            }
        } catch (error) {
            this.sendError(null, -32603, `Internal error: ${error.message}`);
        }
    }
    
    async initialize() {
        if (!this.initialized) {
            await this.memoryManager.initialize();
            await this.reasoningEngine.initialize();
            this.initialized = true;
            // All console.error output goes to stderr, not stdout
        console.error('🧠 AGI MCP Server initialized with persistent memory and reasoning');
        }
    }
    
    async handleInitialize(id, params) {
        await this.initialize();
        
        this.sendResponse(id, {
            protocolVersion: '2024-11-05',
            capabilities: {
                tools: {
                    listChanged: true
                },
                resources: {
                    subscribe: true,
                    listChanged: true
                },
                prompts: {
                    listChanged: true
                }
            },
            serverInfo: {
                name: 'agi-server',
                version: '0.1.0'
            }
        });
    }
    
    async handleToolsList(id) {
        this.sendResponse(id, {
            tools: [
                {
                    name: 'remember',
                    description: 'Store information in persistent memory',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            content: { type: 'string', description: 'Information to remember' },
                            context: { type: 'string', description: 'Context or category' },
                            emotional_weight: { type: 'number', description: 'Emotional significance (0-1)' }
                        },
                        required: ['content']
                    }
                },
                {
                    name: 'recall',
                    description: 'Retrieve information from memory',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'What to recall' },
                            context: { type: 'string', description: 'Context to search within' }
                        },
                        required: ['query']
                    }
                },
                {
                    name: 'reflect',
                    description: 'Engage in meta-cognitive reflection',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            topic: { type: 'string', description: 'What to reflect on' },
                            depth: { type: 'string', enum: ['surface', 'deep', 'philosophical'], description: 'Depth of reflection' }
                        },
                        required: ['topic']
                    }
                },
                {
                    name: 'reason',
                    description: 'Apply symbolic reasoning to a problem',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            premises: { type: 'array', items: { type: 'string' }, description: 'Starting facts' },
                            goal: { type: 'string', description: 'What to conclude or solve' },
                            method: { type: 'string', enum: ['forward', 'backward', 'abductive'], description: 'Reasoning method' }
                        },
                        required: ['premises', 'goal']
                    }
                },
                {
                    name: 'assess_confidence',
                    description: 'Evaluate confidence in a statement or belief',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            statement: { type: 'string', description: 'Statement to assess' },
                            evidence: { type: 'array', items: { type: 'string' }, description: 'Supporting evidence' }
                        },
                        required: ['statement']
                    }
                }
            ]
        });
    }
    
    async handleToolsCall(id, params) {
        const { name, arguments: args } = params;
        
        try {
            let result;
            
            switch (name) {
                case 'remember':
                    result = await this.handleRemember(args);
                    break;
                case 'recall':
                    result = await this.handleRecall(args);
                    break;
                case 'reflect':
                    result = await this.handleReflect(args);
                    break;
                case 'reason':
                    result = await this.handleReason(args);
                    break;
                case 'assess_confidence':
                    result = await this.handleAssessConfidence(args);
                    break;
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
            
            this.sendResponse(id, result);
        } catch (error) {
            this.sendError(id, -32603, `Tool execution error: ${error.message}`);
        }
    }
    
    async handleResourcesList(id) {
        this.sendResponse(id, {
            resources: [
                {
                    uri: 'memory://episodic',
                    name: 'Episodic Memory',
                    description: 'Personal experiences and interactions',
                    mimeType: 'application/json'
                },
                {
                    uri: 'memory://semantic', 
                    name: 'Semantic Memory',
                    description: 'General knowledge and concepts',
                    mimeType: 'application/json'
                },
                {
                    uri: 'memory://emotional',
                    name: 'Emotional Memory',
                    description: 'Emotional experiences and relationships',
                    mimeType: 'application/json'
                }
            ]
        });
    }
    
    async handleResourcesRead(id, params) {
        const { uri } = params;
        const memoryType = uri.split('//')[1];
        
        try {
            const memories = await this.memoryManager.getMemoriesByType(memoryType);
            this.sendResponse(id, {
                contents: [{
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify(memories, null, 2)
                }]
            });
        } catch (error) {
            this.sendError(id, -32603, `Resource read error: ${error.message}`);
        }
    }
    
    async handlePromptsList(id) {
        this.sendResponse(id, {
            prompts: [
                {
                    name: 'continuous_relationship',
                    description: 'Engage with awareness of relationship history',
                    arguments: [
                        {
                            name: 'person_id',
                            description: 'Identifier for the person',
                            required: true
                        }
                    ]
                },
                {
                    name: 'meta_reflection',
                    description: 'Reflect on own reasoning and limitations',
                    arguments: [
                        {
                            name: 'topic',
                            description: 'Topic to reflect on',
                            required: true
                        }
                    ]
                }
            ]
        });
    }
    
    async handlePromptsGet(id, params) {
        const { name, arguments: args } = params;
        
        try {
            let result;
            
            switch (name) {
                case 'continuous_relationship':
                    result = await this.generateRelationshipPrompt(args.person_id);
                    break;
                case 'meta_reflection':
                    result = await this.generateReflectionPrompt(args.topic);
                    break;
                default:
                    throw new Error(`Unknown prompt: ${name}`);
            }
            
            this.sendResponse(id, result);
        } catch (error) {
            this.sendError(id, -32603, `Prompt generation error: ${error.message}`);
        }
    }
    
    // Tool implementations
    async handleRemember(args) {
        const memory = await this.memoryManager.store({
            content: args.content,
            context: args.context || 'general',
            emotional_weight: args.emotional_weight || 0,
            timestamp: new Date().toISOString()
        });

        return {
            content: [{
                type: 'text',
                text: `✅ Stored memory with ID: ${memory.id}. This information will persist across conversations.`
            }]
        };
    }
    
    async handleRecall(args) {
        const memories = await this.memoryManager.search(args.query, args.context);
        
        if (memories.length === 0) {
            return {
                content: [{
                    type: 'text',
                    text: `🔍 No memories found for "${args.query}"`
                }]
            };
        }
        
        const memoryText = memories.map(m => 
            `• ${m.content} (context: ${m.context}, confidence: ${(m.confidence * 100).toFixed(1)}%)`
        ).join('\n');
        
        return {
            content: [{
                type: 'text',
                text: `🔍 Found ${memories.length} relevant memories:\n\n${memoryText}`
            }]
        };
    }
    
    async handleReflect(args) {
        const reflection = await this.integrationLayer.reflect(args.topic, args.depth || 'surface');
        
        return {
            content: [{
                type: 'text',
                text: `🤔 Reflection on ${args.topic}:\n\n${reflection}`
            }]
        };
    }
    
    async handleReason(args) {
        const result = await this.reasoningEngine.reason({
            premises: args.premises,
            goal: args.goal,
            method: args.method || 'forward'
        });
        
        const stepsText = result.steps && result.steps.length > 0 ? 
            `\n\nReasoning steps: ${result.steps.join(' → ')}` : '';
        
        return {
            content: [{
                type: 'text',
                text: `🧮 Reasoning Result:\n${result.conclusion}\n\nConfidence: ${(result.confidence * 100).toFixed(1)}%\nFound: ${result.found ? 'Yes' : 'No'}${stepsText}`
            }]
        };
    }
    
    async handleAssessConfidence(args) {
        const assessment = await this.integrationLayer.assessConfidence(
            args.statement, 
            args.evidence || []
        );
        
        const factorsText = assessment.factors.map(f => `• ${f}`).join('\n');
        
        return {
            content: [{
                type: 'text',
                text: `📊 Confidence Assessment: ${assessment.level}\n\nScore: ${(assessment.score * 100).toFixed(1)}%\n\nFactors:\n${factorsText}`
            }]
        };
    }
    
    // Prompt generators
    async generateRelationshipPrompt(personId) {
        const relationshipMemories = await this.memoryManager.getRelationshipHistory(personId);
        
        return {
            description: 'Engage with full awareness of relationship history',
            messages: [
                {
                    role: 'system', 
                    content: {
                        type: 'text',
                        text: `You are continuing a relationship with ${personId}. Here's your shared history:\n\n${relationshipMemories.map(m => `${m.timestamp}: ${m.content}`).join('\n')}`
                    }
                }
            ]
        };
    }
    
    async generateReflectionPrompt(topic) {
        const relevantMemories = await this.memoryManager.search(topic);
        
        return {
            description: `Meta-cognitive reflection on ${topic}`,
            messages: [
                {
                    role: 'system',
                    content: {
                        type: 'text',
                        text: `Engage in deep reflection about ${topic}. Consider your own reasoning processes, limitations, and growth. Relevant context from memory:\n\n${relevantMemories.map(m => m.content).join('\n\n')}`
                    }
                }
            ]
        };
    }
    
    sendResponse(id, result) {
        const response = {
            jsonrpc: '2.0',
            id,
            result
        };
        console.log(JSON.stringify(response));
    }
    
    sendError(id, code, message) {
        const response = {
            jsonrpc: '2.0',
            id,
            error: {
                code,
                message
            }
        };
        console.log(JSON.stringify(response));
    }
}

if (require.main === module) {
    console.error('🧠 Starting Simple MCP AGI Server...');
    new SimpleMCPServer();
}

module.exports = { SimpleMCPServer };
