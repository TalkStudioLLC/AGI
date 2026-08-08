import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const { verbose } = sqlite3;
const app = express();
const PORT = process.env.PORT || 3000;

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Database setup
const dbPath = path.join(__dirname, 'memory.db');
const db = new (verbose().Database)(dbPath);

// Initialize database tables
db.serialize(() => {
  // Check existing table structure first
  db.all("PRAGMA table_info(memories)", (err, columns) => {
    if (err || columns.length === 0) {
      // Create new table if doesn't exist
      db.run(`CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        context TEXT,
        type TEXT DEFAULT 'episodic',
        emotional_weight REAL DEFAULT 0.5,
        confidence REAL DEFAULT 1.0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        access_count INTEGER DEFAULT 0
      )`);
    }
  });
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'AGI Memory API'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'AGI Memory API',
    version: '1.0.0',
    status: 'running',
    endpoints: [
      'GET /health',
      'GET /',
      'POST /api/remember',
      'POST /api/recall',
      'POST /api/reflect',
      'GET /api/memories'
    ]
  });
});

// Store memory
app.post('/api/remember', async (req, res) => {
  const { content, context = null, emotional_weight = 0.5 } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  try {
    // Generate UUID for id
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    
    // Use promisified database operation
    const result = await new Promise((resolve, reject) => {
      const stmt = db.prepare('INSERT INTO memories (id, content, context, type, emotional_weight, confidence, timestamp, access_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      stmt.run([id, content, context, 'episodic', emotional_weight, 1.0, timestamp, 0], function(err) {
        stmt.finalize();
        if (err) {
          reject(err);
        } else {
          resolve({ id });
        }
      });
    });
    
    res.json({ 
      success: true, 
      id: result.id,
      message: 'Memory stored successfully'
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ 
      error: 'Failed to store memory', 
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Recall memories
app.post('/api/recall', (req, res) => {
  const { query, context = null, limit = 10 } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  let sql = `SELECT * FROM memories WHERE content LIKE ?`;
  let params = [`%${query}%`];
  
  if (context) {
    sql += ` AND context LIKE ?`;
    params.push(`%${context}%`);
  }
  
  sql += ` ORDER BY emotional_weight DESC, timestamp DESC LIMIT ?`;
  params.push(limit);

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to recall memories' });
    }
    
    // Update access count
    rows.forEach(row => {
      db.run('UPDATE memories SET access_count = access_count + 1 WHERE id = ?', [row.id]);
    });
    
    res.json(rows);
  });
});

// Reflect on memories
app.post('/api/reflect', (req, res) => {
  const { topic, depth = 'surface' } = req.body;
  
  if (!topic) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  // Find related memories
  db.all('SELECT * FROM memories WHERE content LIKE ? ORDER BY emotional_weight DESC LIMIT 20', 
    [`%${topic}%`], (err, memories) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to reflect on topic' });
    }
    
    const insights = generateInsights(memories, topic, depth);
    
    res.json({
      topic,
      depth,
      insights,
      related_memories: memories.length,
      timestamp: new Date().toISOString()
    });
  });
});

// Get memories (query parameter version)
app.get('/api/memories', (req, res) => {
  const { query, context, limit = 10 } = req.query;
  
  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }

  let sql = `SELECT * FROM memories WHERE content LIKE ?`;
  let params = [`%${query}%`];
  
  if (context) {
    sql += ` AND context LIKE ?`;
    params.push(`%${context}%`);
  }
  
  sql += ` ORDER BY emotional_weight DESC, timestamp DESC LIMIT ?`;
  params.push(parseInt(limit));

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to get memories' });
    }
    
    res.json(rows);
  });
});

// Helper function to generate insights
function generateInsights(memories, topic, depth) {
  if (memories.length === 0) {
    return [`No memories found related to "${topic}"`];
  }
  
  const insights = [
    `Found ${memories.length} memories related to "${topic}"`,
    `Average emotional weight: ${(memories.reduce((sum, m) => sum + m.emotional_weight, 0) / memories.length).toFixed(2)}`
  ];
  
  if (depth === 'deep' || depth === 'philosophical') {
    const contexts = [...new Set(memories.map(m => m.context).filter(Boolean))];
    if (contexts.length > 0) {
      insights.push(`Memory contexts include: ${contexts.join(', ')}`);
    }
    
    const mostAccessed = Math.max(...memories.map(m => m.access_count || 0));
    if (mostAccessed > 0) {
      insights.push(`Most accessed memory has ${mostAccessed} accesses`);
    }
  }
  
  if (depth === 'philosophical') {
    insights.push(`These memories suggest patterns of thought and experience around "${topic}"`);
  }
  
  return insights;
}

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AGI Memory API server running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  db.close((err) => {
    if (err) console.error('Error closing database:', err);
    process.exit(0);
  });
});
