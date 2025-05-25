/**
 * AGI MCP Server
 * 
 * A Model Context Protocol server that implements advanced AI capabilities
 * including persistent memory, symbolic reasoning, and emotional continuity.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const http = require('http');
const WebSocket = require('ws');
const { MemoryManager } = require('../memory/manager.js');
const { ReasoningEngine } = require('../reasoning/engine.js');
const { IntegrationLayer } = require('../integration/layer.js');
const { PortManager } = require('../utils/port_manager.js');

class AGIServer {
    constructor(port = null) {
        this.server = new Server(
            {
                name: 'agi-server',
                version: '0.1.0',
            },
            {
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
                    },
                },
            }
        );

        this.portManager = new PortManager();
        this.port = null;
        this.requestedPort = port;
        this.httpServer = null;
        this.wsServer = null;
        this.memoryManager = new MemoryManager();
        this.reasoningEngine = new ReasoningEngine();
        this.integrationLayer = new IntegrationLayer(this.memoryManager, this.reasoningEngine);

        this.setupMCPHandlers();
    }

    async initializePort() {
        if (!this.port) {
            this.port = await this.portManager.findAvailablePort(this.requestedPort);
        }
        return this.port;
    }

    setupMCPHandlers() {
        // Override the server's built-in handlers
        const originalCreateMessage = this.server.createMessage.bind(this.server);
        
        this.server.createMessage = (request) => {
            return this.handleMCPRequest(request);
        };
        
        // Setup message routing
        this.setupMessageRouting();
    }

    setupMessageRouting() {
        // We'll handle routing in handleMCPRequest instead of using setRequestHandler
        this.requestHandlers = new Map([
            ['tools/list', this.handleToolsList.bind(this)],
            ['tools/call', this.handleToolsCall.bind(this)],
            ['resources/list', this.handleResourcesList.bind(this)],
            ['resources/read', this.handleResourcesRead.bind(this)],
            ['prompts/list', this.handlePromptsList.bind(this)],
            ['prompts/get', this.handlePromptsGet.bind(this)]
        ]);
    }

    async handleMCPRequest(request) {
        const { method, params, id } = request;
        
        try {
            const handler = this.requestHandlers.get(method);
            if (handler) {
                const result = await handler({ params });
                return {
                    jsonrpc: '2.0',
                    id,
                    result
                };
            } else {
                return {
                    jsonrpc: '2.0',
                    id,
                    error: {
                        code: -32601,
                        message: `Method not found: ${method}`
                    }
                };
            }
        } catch (error) {
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32603,
                    message: error.message,
                    data: error.stack
                }
            };
        }
    }

    // MCP Handler Methods
    async handleToolsList() {
        return {
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
                            depth: { type: 'string', enum: ['surface', 'deep', 'philosophical'] }
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
                            premises: { type: 'array', items: { type: 'string' } },
                            goal: { type: 'string', description: 'What to conclude or solve' },
                            method: { type: 'string', enum: ['forward', 'backward', 'abductive'] }
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
                            evidence: { type: 'array', items: { type: 'string' } }
                        },
                        required: ['statement']
                    }
                }
            ]
        };
    }

    async handleToolsCall(request) {
        const { name, arguments: args } = request.params;

        switch (name) {
            case 'remember':
                return await this.handleRemember(args);
            case 'recall':
                return await this.handleRecall(args);
            case 'reflect':
                return await this.handleReflect(args);
            case 'reason':
                return await this.handleReason(args);
            case 'assess_confidence':
                return await this.handleAssessConfidence(args);
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    async handleResourcesList() {
        return {
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
        };
    }

    async handleResourcesRead(request) {
        const { uri } = request.params;
        const memoryType = uri.split('//')[1];
        
        const memories = await this.memoryManager.getMemoriesByType(memoryType);
        return {
            contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(memories, null, 2)
            }]
        };
    }

    async handlePromptsList() {
        return {
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
        };
    }

    async handlePromptsGet(request) {
        const { name, arguments: args } = request.params;

        switch (name) {
            case 'continuous_relationship':
                return await this.generateRelationshipPrompt(args.person_id);
            case 'meta_reflection':
                return await this.generateReflectionPrompt(args.topic);
            default:
                throw new Error(`Unknown prompt: ${name}`);
        }
    }
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
                text: `Stored memory with ID: ${memory.id}. This information will persist across conversations.`
            }]
        };
    }

    async handleRecall(args) {
        const memories = await this.memoryManager.search(args.query, args.context);
        
        return {
            content: [{
                type: 'text',
                text: `Found ${memories.length} relevant memories:\\n\\n${memories.map(m => 
                    `• ${m.content} (confidence: ${m.confidence})`
                ).join('\\n')}`
            }]
        };
    }

    async handleReflect(args) {
        const reflection = await this.integrationLayer.reflect(args.topic, args.depth || 'surface');
        
        return {
            content: [{
                type: 'text',
                text: reflection
            }]
        };
    }

    async handleReason(args) {
        const result = await this.reasoningEngine.reason({
            premises: args.premises,
            goal: args.goal,
            method: args.method || 'forward'
        });

        return {
            content: [{
                type: 'text',
                text: `Reasoning Result:\\n${result.conclusion}\\n\\nConfidence: ${result.confidence}\\nSteps: ${result.steps.join(' → ')}`
            }]
        };
    }

    async handleAssessConfidence(args) {
        const assessment = await this.integrationLayer.assessConfidence(
            args.statement, 
            args.evidence || []
        );

        return {
            content: [{
                type: 'text',
                text: `Confidence Assessment: ${assessment.level}\\n\\nFactors:\\n${assessment.factors.map(f => `• ${f}`).join('\\n')}`
            }]
        };
    }

    // Prompt Generators
    async generateRelationshipPrompt(personId) {
        const relationshipMemories = await this.memoryManager.getRelationshipHistory(personId);
        
        return {
            description: 'Engage with full awareness of relationship history',
            messages: [
                {
                    role: 'system',
                    content: {
                        type: 'text',
                        text: `You are continuing a relationship with ${personId}. Here's your shared history:\\n\\n${relationshipMemories.map(m => `${m.timestamp}: ${m.content}`).join('\\n')}`
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
                        text: `Engage in deep reflection about ${topic}. Consider your own reasoning processes, limitations, and growth. Relevant context from memory:\\n\\n${relevantMemories.map(m => m.content).join('\\n\\n')}`
                    }
                }
            ]
        };
    }

    async run(mode = 'auto') {
        await this.memoryManager.initialize();
        await this.reasoningEngine.initialize();
        
        if (mode === 'stdio' || (mode === 'auto' && process.stdin.isTTY === false)) {
            // Run in stdio mode for MCP clients
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            console.error('AGI MCP Server running in stdio mode with persistent memory and reasoning capabilities');
        } else {
            // Run in HTTP/WebSocket mode for web clients
            await this.startHttpServer();
        }
    }

    async startHttpServer() {
        await this.initializePort();
        
        return new Promise((resolve, reject) => {
            this.httpServer = http.createServer((req, res) => {
                // Handle HTTP health check
                if (req.url === '/health') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        status: 'healthy', 
                        server: 'agi-mcp-server',
                        version: '0.1.0',
                        port: this.port,
                        capabilities: ['memory', 'reasoning', 'reflection', 'confidence-assessment']
                    }));
                    return;
                }

                // Handle MCP info endpoint
                if (req.url === '/mcp/info') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        name: 'agi-server',
                        version: '0.1.0',
                        description: 'AGI exploration with persistent memory and advanced reasoning',
                        capabilities: {
                            tools: {
                                remember: 'Store information in persistent memory',
                                recall: 'Retrieve information from memory',
                                reflect: 'Engage in meta-cognitive reflection',
                                reason: 'Apply symbolic reasoning to problems',
                                assess_confidence: 'Evaluate confidence in statements'
                            },
                            resources: {
                                'memory://episodic': 'Personal experiences and interactions',
                                'memory://semantic': 'General knowledge and concepts',
                                'memory://emotional': 'Emotional experiences and relationships'
                            }
                        }
                    }));
                    return;
                }

                // Default response
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>AGI MCP Server</title>
                        <style>
                            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                            .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                            h1 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
                            .status { background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 20px 0; }
                            .endpoint { background: #f0f0f0; padding: 10px; margin: 10px 0; border-radius: 3px; font-family: monospace; }
                            .capability { margin: 5px 0; padding: 5px; background: #f9f9f9; border-left: 3px solid #4CAF50; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1>🧠 AGI MCP Server</h1>
                            <div class="status">
                                <strong>Status:</strong> Running on port ${this.port}<br>
                                <strong>Version:</strong> 0.1.0<br>
                                <strong>Mode:</strong> HTTP/WebSocket
                            </div>
                            
                            <h2>Capabilities</h2>
                            <div class="capability">💾 <strong>Persistent Memory</strong> - Remembers across sessions</div>
                            <div class="capability">🧮 <strong>Symbolic Reasoning</strong> - Forward, backward, and abductive reasoning</div>
                            <div class="capability">🤔 <strong>Meta-Cognition</strong> - Self-reflection and bias detection</div>
                            <div class="capability">📊 <strong>Confidence Assessment</strong> - Multi-faceted confidence evaluation</div>
                            <div class="capability">💝 <strong>Emotional Continuity</strong> - Relationship tracking over time</div>
                            
                            <h2>API Endpoints</h2>
                            <div class="endpoint">GET /health - Server health check</div>
                            <div class="endpoint">GET /mcp/info - MCP server information</div>
                            <div class="endpoint">WS /mcp - WebSocket MCP connection</div>
                            
                            <h2>Connection</h2>
                            <p>This server implements the Model Context Protocol (MCP) and can be connected to via:</p>
                            <ul>
                                <li><strong>Stdio:</strong> For Claude and other MCP clients</li>
                                <li><strong>WebSocket:</strong> ws://localhost:${this.port}/mcp</li>
                                <li><strong>HTTP:</strong> http://localhost:${this.port}</li>
                            </ul>
                        </div>
                    </body>
                    </html>
                `);
            });

            // Set up WebSocket server for MCP connections
            this.wsServer = new WebSocket.Server({ 
                server: this.httpServer,
                path: '/mcp'
            });

            this.wsServer.on('connection', (ws) => {
                console.error(`New WebSocket MCP connection from ${ws._socket.remoteAddress}`);
                
                // Handle WebSocket MCP protocol
                ws.on('message', async (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        const response = await this.handleMCPMessage(message);
                        ws.send(JSON.stringify(response));
                    } catch (error) {
                        console.error('WebSocket message error:', error);
                        ws.send(JSON.stringify({
                            error: { code: -32603, message: 'Internal error', data: error.message }
                        }));
                    }
                });

                ws.on('close', () => {
                    console.error('WebSocket MCP connection closed');
                });

                ws.on('error', (error) => {
                    console.error('WebSocket error:', error);
                });
            });

            this.httpServer.listen(this.port, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.error(`🧠 AGI MCP Server running on port ${this.port}`);
                    console.error(`📍 Web interface: http://localhost:${this.port}`);
                    console.error(`🔌 WebSocket MCP: ws://localhost:${this.port}/mcp`);
                    console.error(`💾 Memory: ${this.memoryManager.dbPath}`);
                    resolve();
                }
            });
        });
    }

    async handleMCPMessage(message) {
        // Handle MCP protocol messages over WebSocket
        const { method, params, id } = message;
        
        try {
            let result;
            
            // Create a properly formatted request object
            const request = { method, params, id };
            
            switch (method) {
                case 'tools/list':
                    result = await this.getToolsList();
                    break;
                case 'tools/call':
                    result = await this.handleToolCall(params);
                    break;
                case 'resources/list':
                    result = await this.getResourcesList();
                    break;
                case 'resources/read':
                    result = await this.handleResourceRead(params);
                    break;
                case 'prompts/list':
                    result = await this.getPromptsList();
                    break;
                case 'prompts/get':
                    result = await this.handlePromptGet(params);
                    break;
                default:
                    throw new Error(`Unknown method: ${method}`);
            }
            
            return { id, result };
        } catch (error) {
            return {
                id,
                error: {
                    code: -32603,
                    message: error.message,
                    data: error.stack
                }
            };
        }
    }

    // Helper methods for WebSocket MCP handling
    async getToolsList() {
        return {
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
                            depth: { type: 'string', enum: ['surface', 'deep', 'philosophical'] }
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
                            premises: { type: 'array', items: { type: 'string' } },
                            goal: { type: 'string', description: 'What to conclude or solve' },
                            method: { type: 'string', enum: ['forward', 'backward', 'abductive'] }
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
                            evidence: { type: 'array', items: { type: 'string' } }
                        },
                        required: ['statement']
                    }
                }
            ]
        };
    }

    async handleToolCall(params) {
        const { name, arguments: args } = params;

        switch (name) {
            case 'remember':
                return await this.handleRemember(args);
            case 'recall':
                return await this.handleRecall(args);
            case 'reflect':
                return await this.handleReflect(args);
            case 'reason':
                return await this.handleReason(args);
            case 'assess_confidence':
                return await this.handleAssessConfidence(args);
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    async getResourcesList() {
        return {
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
        };
    }

    async handleResourceRead(params) {
        const { uri } = params;
        const memoryType = uri.split('//')[1];
        
        const memories = await this.memoryManager.getMemoriesByType(memoryType);
        return {
            contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(memories, null, 2)
            }]
        };
    }

    async getPromptsList() {
        return {
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
        };
    }

    async handlePromptGet(params) {
        const { name, arguments: args } = params;

        switch (name) {
            case 'continuous_relationship':
                return await this.generateRelationshipPrompt(args.person_id);
            case 'meta_reflection':
                return await this.generateReflectionPrompt(args.topic);
            default:
                throw new Error(`Unknown prompt: ${name}`);
        }
    }

    async stop() {
        if (this.httpServer) {
            this.httpServer.close();
        }
        if (this.wsServer) {
            this.wsServer.close();
        }
        if (this.memoryManager) {
            await this.memoryManager.close();
        }
    }
}

// Start the server
if (require.main === module) {
    const port = process.env.PORT || process.argv[2] || null;
    const mode = process.env.MODE || process.argv[3] || 'auto';
    
    const server = new AGIServer(port);
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.error('\n🛑 Shutting down AGI MCP Server...');
        await server.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
        console.error('\n🛑 Shutting down AGI MCP Server...');
        await server.stop();
        process.exit(0);
    });
    
    server.run(mode).catch(console.error);
}

module.exports = { AGIServer };
