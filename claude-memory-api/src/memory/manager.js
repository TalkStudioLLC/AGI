// src/memory/manager.js
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

class MemoryManager {
  constructor(dbPath = '/app/data/memory.db') {
    this.dbPath = dbPath;
    this.db = null;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Database connection error:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    const schemas = [
      `CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        context TEXT,
        emotional_weight REAL DEFAULT 0.5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT,
        session_id TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS reflections (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        depth TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_memories_context ON memories(context)`,
      `CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at)`
    ];

    for (const schema of schemas) {
      await this.runQuery(schema);
    }
  }

  runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async remember(content, context = null, emotionalWeight = 0.5, userId = null, sessionId = null) {
    const id = uuidv4();
    const sql = `INSERT INTO memories 
      (id, content, context, emotional_weight, user_id, session_id) 
      VALUES (?, ?, ?, ?, ?, ?)`;
    
    await this.runQuery(sql, [id, content, context, emotionalWeight, userId, sessionId]);
    return { id, content, context, emotional_weight: emotionalWeight };
  }

  async recall(query, context = null, userId = null, limit = 10) {
    let sql = `SELECT * FROM memories WHERE 1=1`;
    let params = [];

    if (query) {
      sql += ` AND (content LIKE ? OR context LIKE ?)`;
      params.push(`%${query}%`, `%${query}%`);
    }

    if (context) {
      sql += ` AND context = ?`;
      params.push(context);
    }

    if (userId) {
      sql += ` AND user_id = ?`;
      params.push(userId);
    }

    sql += ` ORDER BY emotional_weight DESC, created_at DESC LIMIT ?`;
    params.push(limit);

    return await this.allQuery(sql, params);
  }

  async reflect(topic, depth = 'surface', userId = null) {
    // Gather related memories
    const memories = await this.recall(topic, null, userId, 5);
    
    let reflection = '';
    switch (depth) {
      case 'surface':
        reflection = `Surface reflection on ${topic}: Found ${memories.length} related memories.`;
        break;
      case 'deep':
        reflection = `Deep reflection on ${topic}: Analyzing patterns across ${memories.length} memories and their interconnections.`;
        break;
      case 'philosophical':
        reflection = `Philosophical reflection on ${topic}: Contemplating the deeper meaning and implications of ${memories.length} related experiences.`;
        break;
    }

    // Store the reflection
    const id = uuidv4();
    await this.runQuery(
      `INSERT INTO reflections (id, topic, depth, content, user_id) VALUES (?, ?, ?, ?, ?)`,
      [id, topic, depth, reflection, userId]
    );

    return { id, topic, depth, content: reflection, memories };
  }

  async getMemoryStats(userId = null) {
    let sql = `SELECT 
      COUNT(*) as total_memories,
      AVG(emotional_weight) as avg_emotional_weight,
      COUNT(DISTINCT context) as unique_contexts
      FROM memories`;
    let params = [];

    if (userId) {
      sql += ` WHERE user_id = ?`;
      params.push(userId);
    }

    return await this.getQuery(sql, params);
  }

  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) console.error('Error closing database:', err);
          else console.log('Database connection closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = { MemoryManager };