const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { CloudMemoryManager } = require('./src/memory/cloud-manager');
const { ClaudeClient } = require('./src/claude/client');
const apiRoutes = require('./src/routes/api');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize services
const memoryManager = new CloudMemoryManager('talkstudio-fb-memory-data');
const claudeClient = new ClaudeClient(process.env.ANTHROPIC_API_KEY);

// Make services available to routes
app.locals.memoryManager = memoryManager;
app.locals.claudeClient = claudeClient;

// Routes
app.use('/api', apiRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Initialize and start
async function start() {
  await memoryManager.initialize();
  app.listen(PORT, () => {
    console.log(`🚀 Claude Memory API running on port ${PORT}`);
  });
}

start().catch(console.error);