# Installation and Setup Guide

## Prerequisites

- Node.js (version 16 or higher)
- npm or yarn package manager
- SQLite (for persistent memory storage)

## Quick Start

1. **Clone and install dependencies:**
   ```bash
   cd C:\Users\Tom\Documents\GitHub\AGI
   npm install
   ```

2. **Run the basic tests:**
   ```bash
   npm test
   ```

3. **Try the usage example:**
   ```bash
   npm run example
   ```

4. **Start the MCP server:**
   ```bash
   npm start                    # Auto-select port, auto-detect mode
   npm run start:port           # Use port 3050
   npm run start:stdio          # Use stdio mode for MCP clients
   ```

5. **Check server status:**
   ```bash
   npm run status               # Comprehensive status
   npm run ports:status         # Port availability
   npm run health               # Health check
   ```

## Detailed Setup

### 1. Install Dependencies

```bash
npm install @modelcontextprotocol/sdk sqlite3 uuid lodash
npm install --save-dev nodemon jest eslint
```

### 2. Database Setup

The system will automatically create an SQLite database file (`agi_memory.db`) on first run. The database stores:
- Episodic, semantic, and emotional memories
- Relationship histories
- Reasoning session logs
- Confidence assessments

### 3. Configuration

Edit `config.json` to customize:
- Memory retention settings
- Reasoning parameters
- Reflection depth levels
- Safety constraints
- Logging preferences

### 4. Port Management

The server automatically manages ports in the range 3050-3060:

```bash
# Port management commands
npm run ports:status         # Show port availability
npm run ports:list           # List active servers
npm run ports:find           # Find available port
npm run stop 3055            # Stop server on port 3055
```

### 5. MCP Integration

To use this server with Claude or other MCP clients:

**Stdio Mode (Recommended for MCP clients):**
```json
{
  "mcpServers": {
    "agi-server": {
      "command": "node",
      "args": ["C:/Users/Tom/Documents/GitHub/AGI/launcher.js", "start", "null", "stdio"],
      "env": {}
    }
  }
}
```

**HTTP/WebSocket Mode (For web clients):**
- Web interface: `http://localhost:3050`
- WebSocket MCP: `ws://localhost:3050/mcp`
- Health check: `http://localhost:3050/health`

## Usage Examples

### Basic Memory Operations

```javascript
// Store a memory
await server.handleRemember({
    content: "Important information to remember",
    context: "work",
    emotional_weight: 0.7
});

// Recall memories
const memories = await server.handleRecall({
    query: "important information",
    context: "work"
});
```

### Reasoning Operations

```javascript
// Perform logical reasoning
const result = await server.handleReason({
    premises: ["All birds can fly", "Penguins are birds"],
    goal: "Penguins can fly",
    method: "forward"
});
```

### Meta-Cognitive Reflection

```javascript
// Engage in reflection
const reflection = await server.handleReflect({
    topic: "artificial intelligence",
    depth: "deep"
});
```

### Confidence Assessment

```javascript
// Assess confidence in a statement
const confidence = await server.handleAssessConfidence({
    statement: "AI will transform society",
    evidence: ["Historical precedent", "Current trends", "Expert opinions"]
});
```

## Architecture Overview

```
AGI MCP Server
├── Memory Manager
│   ├── SQLite Database
│   ├── Episodic Memory
│   ├── Semantic Memory
│   └── Relationship Tracking
├── Reasoning Engine
│   ├── Forward Chaining
│   ├── Backward Chaining
│   ├── Abductive Reasoning
│   └── Uncertainty Handling
└── Integration Layer
    ├── Meta-Cognition
    ├── Confidence Assessment
    ├── Reflection Capabilities
    └── Bias Detection
```

## Key Features

### Persistent Memory
- **Episodic**: Personal experiences and interactions
- **Semantic**: General knowledge and concepts
- **Emotional**: Relationship context and emotional experiences
- **Procedural**: Skills and learned processes

### Advanced Reasoning
- **Symbolic Logic**: Rule-based inference and deduction
- **Uncertainty Propagation**: Confidence tracking through reasoning chains
- **Multiple Methods**: Forward, backward, and abductive reasoning
- **Learning**: Rules improve based on success rates

### Meta-Cognition
- **Self-Reflection**: Analysis of own reasoning processes
- **Bias Detection**: Identification of potential cognitive biases
- **Confidence Assessment**: Multi-faceted confidence evaluation
- **Growth Identification**: Recognition of learning opportunities

### Safety Features
- **Transparent Reasoning**: All decisions are explainable
- **Value Alignment**: Continuous checking against core values
- **Graceful Degradation**: Safe failure modes
- **Human Oversight**: Critical decisions require approval

## Testing

Run the test suite to verify all components:

```bash
npm test
```

Test individual components:

```bash
node tests/basic_tests.js
```

## Development

### Project Structure
```
src/
├── mcp/           # MCP server implementation
├── memory/        # Persistent memory system
├── reasoning/     # Symbolic reasoning engine
└── integration/   # Component integration layer
```

### Adding New Capabilities

1. **New Memory Types**: Extend the memory schema in `src/memory/manager.js`
2. **New Reasoning Rules**: Add rules in `src/reasoning/engine.js`
3. **New Reflection Methods**: Extend `src/integration/layer.js`
4. **New MCP Tools**: Add tool handlers in `src/mcp/server.js`

## Troubleshooting

### Common Issues

1. **Database locked**: Ensure only one server instance is running
2. **Memory not persisting**: Check database file permissions
3. **Reasoning fails**: Verify rule syntax and premises format
4. **MCP connection issues**: Check server startup logs

### Debug Mode

Enable detailed logging by setting the log level in `config.json`:

```json
{
  "logging": {
    "level": "debug"
  }
}
```

## Roadmap

### Phase 1 (Current)
- ✅ Basic memory persistence
- ✅ Simple reasoning engine
- ✅ MCP server framework
- ✅ Meta-cognitive reflection

### Phase 2 (Next)
- [ ] Neural-symbolic integration
- [ ] Advanced emotional modeling
- [ ] Long-term goal tracking
- [ ] Enhanced safety mechanisms

### Phase 3 (Future)
- [ ] Multi-modal reasoning
- [ ] Creative synthesis capabilities
- [ ] Advanced relationship modeling
- [ ] Autonomous learning systems

## Contributing

This is an experimental research project. Contributions are welcome, especially in:

- Safety mechanism improvements
- Reasoning algorithm enhancements
- Memory organization strategies
- Integration with other AI systems

## License

MIT License - See LICENSE file for details.
