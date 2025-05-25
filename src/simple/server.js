/**
 * Simplified AGI Server
 * 
 * A simple HTTP/WebSocket server with MCP-like functionality
 * that bypasses complex MCP SDK issues
 */

const http = require('http');
const WebSocket = require('ws');
const { MemoryManager } = require('../memory/manager.js');
const { ReasoningEngine } = require('../reasoning/engine.js');
const { IntegrationLayer } = require('../integration/layer.js');
const { PortManager } = require('../utils/port_manager.js');

class SimpleAGIServer {
    constructor(port = null) {
        this.portManager = new PortManager();
        this.port = null;
        this.requestedPort = port;
        this.httpServer = null;
        this.wsServer = null;
        this.memoryManager = new MemoryManager();
        this.reasoningEngine = new ReasoningEngine();
        this.integrationLayer = new IntegrationLayer(this.memoryManager, this.reasoningEngine);
        
        // Available tools
        this.tools = {
            remember: this.handleRemember.bind(this),
            recall: this.handleRecall.bind(this),
            reflect: this.handleReflect.bind(this),
            reason: this.handleReason.bind(this),
            assess_confidence: this.handleAssessConfidence.bind(this)
        };
    }

    async initializePort() {
        if (!this.port) {
            this.port = await this.portManager.findAvailablePort(this.requestedPort);
        }
        return this.port;
    }

    async initialize() {
        await this.memoryManager.initialize();
        await this.reasoningEngine.initialize();
        await this.initializePort();
    }

    async start() {
        await this.initialize();
        
        return new Promise((resolve, reject) => {
            this.httpServer = http.createServer((req, res) => {
                this.handleHttpRequest(req, res);
            });

            // Set up WebSocket server
            this.wsServer = new WebSocket.Server({ 
                server: this.httpServer,
                path: '/mcp'
            });

            this.wsServer.on('connection', (ws) => {
                console.error(`🔌 New WebSocket connection`);
                
                ws.on('message', async (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        const response = await this.handleWebSocketMessage(message);
                        ws.send(JSON.stringify(response));
                    } catch (error) {
                        console.error('WebSocket error:', error);
                        ws.send(JSON.stringify({
                            jsonrpc: '2.0',
                            id: null,
                            error: { code: -32603, message: 'Internal error', data: error.message }
                        }));
                    }
                });

                ws.on('close', () => {
                    console.error('🔌 WebSocket connection closed');
                });
            });

            this.httpServer.listen(this.port, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.error(`🧠 Simple AGI Server running on port ${this.port}`);
                    console.error(`📍 Web interface: http://localhost:${this.port}`);
                    console.error(`🔌 WebSocket: ws://localhost:${this.port}/mcp`);
                    console.error(`💾 Memory: ${this.memoryManager.dbPath}`);
                    resolve();
                }
            });
        });
    }

    async handleHttpRequest(req, res) {
        const url = new URL(req.url, `http://localhost:${this.port}`);
        
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        try {
            if (url.pathname === '/health') {
                await this.handleHealthCheck(res);
            } else if (url.pathname === '/api/tools') {
                await this.handleToolsAPI(req, res);
            } else if (url.pathname === '/api/memory') {
                await this.handleMemoryAPI(req, res);
            } else {
                await this.handleWebInterface(res);
            }
        } catch (error) {
            console.error('HTTP error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    }

    async handleHealthCheck(res) {
        const stats = await this.memoryManager.getMemoryStats();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            server: 'simple-agi-server',
            version: '0.1.0',
            port: this.port,
            capabilities: ['memory', 'reasoning', 'reflection', 'confidence-assessment'],
            memory_stats: stats,
            uptime: process.uptime()
        }));
    }

    async handleToolsAPI(req, res) {
        if (req.method === 'GET') {
            // List available tools
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                tools: Object.keys(this.tools).map(name => ({
                    name,
                    description: this.getToolDescription(name)
                }))
            }));
        } else if (req.method === 'POST') {
            // Execute tool
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { tool, args } = JSON.parse(body);
                    
                    if (!this.tools[tool]) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: `Tool '${tool}' not found` }));
                        return;
                    }
                    
                    const result = await this.tools[tool](args);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ result }));
                } catch (error) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: error.message }));
                }
            });
        }
    }

    async handleMemoryAPI(req, res) {
        const url = new URL(req.url, `http://localhost:${this.port}`);
        const type = url.searchParams.get('type') || 'all';
        
        if (req.method === 'GET') {
            const memories = type === 'all' ? 
                await this.memoryManager.search('', null, 50) :
                await this.memoryManager.getMemoriesByType(type);
                
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ memories }));
        }
    }

    async handleWebInterface(res) {
        const stats = await this.memoryManager.getMemoryStats();
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>AGI Server - Simple Version</title>
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; color: #333; }
                    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
                    .header { background: rgba(255,255,255,0.95); padding: 30px; border-radius: 15px; margin-bottom: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); }
                    .card { background: rgba(255,255,255,0.9); padding: 25px; border-radius: 12px; margin: 15px 0; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
                    h1 { color: #4a5568; margin-bottom: 10px; font-size: 2.5em; }
                    .status { color: #38a169; font-weight: bold; font-size: 1.2em; }
                    .capability { margin: 8px 0; padding: 12px; background: #f7fafc; border-left: 4px solid #4299e1; border-radius: 4px; }
                    .endpoint { background: #2d3748; color: #e2e8f0; padding: 12px; margin: 8px 0; border-radius: 6px; font-family: 'Courier New', monospace; }
                    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
                    .stat-item { text-align: center; padding: 15px; background: #edf2f7; border-radius: 8px; }
                    .test-section { margin-top: 20px; }
                    .btn { background: #4299e1; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; margin: 5px; }
                    .btn:hover { background: #3182ce; }
                    #output { background: #1a202c; color: #e2e8f0; padding: 15px; border-radius: 6px; margin-top: 10px; font-family: monospace; max-height: 300px; overflow-y: auto; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🧠 AGI Server</h1>
                        <div class="status">✅ Running on port ${this.port}</div>
                        <p>Simple implementation with persistent memory, reasoning, and reflection capabilities</p>
                    </div>
                    
                    <div class="card">
                        <h2>🚀 Capabilities</h2>
                        <div class="capability">💾 <strong>Persistent Memory</strong> - Store and recall information across sessions</div>
                        <div class="capability">🧮 <strong>Symbolic Reasoning</strong> - Forward, backward, and abductive reasoning</div>
                        <div class="capability">🤔 <strong>Meta-Cognition</strong> - Self-reflection and bias detection</div>
                        <div class="capability">📊 <strong>Confidence Assessment</strong> - Multi-faceted confidence evaluation</div>
                        <div class="capability">💝 <strong>Emotional Continuity</strong> - Relationship tracking over time</div>
                    </div>
                    
                    <div class="card">
                        <h2>📊 System Stats</h2>
                        <div class="stats">
                            <div class="stat-item">
                                <div style="font-size: 2em; color: #4299e1;">${stats.total_memories}</div>
                                <div>Total Memories</div>
                            </div>
                            <div class="stat-item">
                                <div style="font-size: 2em; color: #38a169;">${stats.relationships}</div>
                                <div>Relationships</div>
                            </div>
                            <div class="stat-item">
                                <div style="font-size: 2em; color: #ed8936;">${Math.round(process.uptime())}</div>
                                <div>Uptime (seconds)</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="card">
                        <h2>🔌 API Endpoints</h2>
                        <div class="endpoint">GET /health - Server health and stats</div>
                        <div class="endpoint">GET /api/tools - List available tools</div>
                        <div class="endpoint">POST /api/tools - Execute tool</div>
                        <div class="endpoint">GET /api/memory - View memories</div>
                        <div class="endpoint">WS /mcp - WebSocket connection</div>
                    </div>
                    
                    <div class="card test-section">
                        <h2>🧪 Test Tools</h2>
                        <button class="btn" onclick="testRemember()">Test Remember</button>
                        <button class="btn" onclick="testRecall()">Test Recall</button>
                        <button class="btn" onclick="testReflect()">Test Reflect</button>
                        <button class="btn" onclick="testReason()">Test Reason</button>
                        <button class="btn" onclick="viewMemories()">View Memories</button>
                        <div id="output">Ready for testing...</div>
                    </div>
                </div>
                
                <script>
                    async function apiCall(endpoint, data = null) {
                        const options = {
                            method: data ? 'POST' : 'GET',
                            headers: { 'Content-Type': 'application/json' }
                        };
                        if (data) options.body = JSON.stringify(data);
                        
                        const response = await fetch(endpoint, options);
                        return await response.json();
                    }
                    
                    function log(message) {
                        const output = document.getElementById('output');
                        output.textContent = JSON.stringify(message, null, 2);
                    }
                    
                    async function testRemember() {
                        const result = await apiCall('/api/tools', {
                            tool: 'remember',
                            args: {
                                content: 'This is a test memory from the web interface',
                                context: 'web_test',
                                emotional_weight: 0.5
                            }
                        });
                        log(result);
                    }
                    
                    async function testRecall() {
                        const result = await apiCall('/api/tools', {
                            tool: 'recall',
                            args: { query: 'test memory' }
                        });
                        log(result);
                    }
                    
                    async function testReflect() {
                        const result = await apiCall('/api/tools', {
                            tool: 'reflect',
                            args: { topic: 'artificial intelligence', depth: 'surface' }
                        });
                        log(result);
                    }
                    
                    async function testReason() {
                        const result = await apiCall('/api/tools', {
                            tool: 'reason',
                            args: {
                                premises: ['All humans are mortal', 'Socrates is human'],
                                goal: 'Socrates is mortal',
                                method: 'forward'
                            }
                        });
                        log(result);
                    }
                    
                    async function viewMemories() {
                        const result = await apiCall('/api/memory');
                        log(result);
                    }
                </script>
            </body>
            </html>
        `);
    }

    async handleWebSocketMessage(message) {
        const { method, params, id } = message;
        
        try {
            let result;
            
            switch (method) {
                case 'tools/list':
                    result = {
                        tools: Object.keys(this.tools).map(name => ({
                            name,
                            description: this.getToolDescription(name)
                        }))
                    };
                    break;
                    
                case 'tools/call':
                    const { name, arguments: args } = params;
                    if (!this.tools[name]) {
                        throw new Error(`Tool '${name}' not found`);
                    }
                    result = await this.tools[name](args);
                    break;
                    
                default:
                    throw new Error(`Method '${method}' not supported`);
            }
            
            return {
                jsonrpc: '2.0',
                id,
                result
            };
        } catch (error) {
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32603,
                    message: error.message
                }
            };
        }
    }

    getToolDescription(name) {
        const descriptions = {
            remember: 'Store information in persistent memory',
            recall: 'Retrieve information from memory',
            reflect: 'Engage in meta-cognitive reflection',
            reason: 'Apply symbolic reasoning to problems',
            assess_confidence: 'Evaluate confidence in statements'
        };
        return descriptions[name] || 'No description available';
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
            success: true,
            message: `Stored memory with ID: ${memory.id}`,
            memory_id: memory.id
        };
    }

    async handleRecall(args) {
        const memories = await this.memoryManager.search(args.query, args.context);
        
        return {
            success: true,
            memories: memories.map(m => ({
                content: m.content,
                context: m.context,
                confidence: m.confidence,
                timestamp: m.timestamp
            }))
        };
    }

    async handleReflect(args) {
        const reflection = await this.integrationLayer.reflect(args.topic, args.depth || 'surface');
        
        return {
            success: true,
            reflection
        };
    }

    async handleReason(args) {
        const result = await this.reasoningEngine.reason({
            premises: args.premises,
            goal: args.goal,
            method: args.method || 'forward'
        });

        return {
            success: true,
            conclusion: result.conclusion,
            confidence: result.confidence,
            steps: result.steps,
            found: result.found
        };
    }

    async handleAssessConfidence(args) {
        const assessment = await this.integrationLayer.assessConfidence(
            args.statement, 
            args.evidence || []
        );

        return {
            success: true,
            confidence_level: assessment.level,
            confidence_score: assessment.score,
            factors: assessment.factors
        };
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

module.exports = { SimpleAGIServer };
