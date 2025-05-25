/**
 * Memory Manager
 * 
 * Handles persistent storage and retrieval of memories across different types:
 * - Episodic: Personal experiences and interactions
 * - Semantic: General knowledge and concepts  
 * - Emotional: Relationship context and emotional experiences
 */

const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');

class MemoryManager {
    constructor(dbPath = './memory.db') {
        this.dbPath = dbPath;
        this.db = null;
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createTables() {
        const queries = [
            `CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                context TEXT,
                type TEXT DEFAULT 'episodic',
                emotional_weight REAL DEFAULT 0,
                confidence REAL DEFAULT 1.0,
                timestamp TEXT NOT NULL,
                person_id TEXT,
                tags TEXT,
                parent_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS relationships (
                id TEXT PRIMARY KEY,
                person_id TEXT UNIQUE NOT NULL,
                name TEXT,
                relationship_type TEXT,
                emotional_bond REAL DEFAULT 0,
                interaction_count INTEGER DEFAULT 0,
                last_interaction TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS reasoning_history (
                id TEXT PRIMARY KEY,
                premises TEXT NOT NULL,
                conclusion TEXT NOT NULL,
                method TEXT NOT NULL,
                confidence REAL NOT NULL,
                timestamp TEXT NOT NULL,
                memory_id TEXT,
                FOREIGN KEY(memory_id) REFERENCES memories(id)
            )`,
            `CREATE INDEX IF NOT EXISTS idx_memories_context ON memories(context)`,
            `CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)`,
            `CREATE INDEX IF NOT EXISTS idx_memories_person ON memories(person_id)`,
            `CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp)`
        ];

        for (const query of queries) {
            await this.runQuery(query);
        }
    }

    async runQuery(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(query, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    async getQuery(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(query, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async allQuery(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async store(memoryData) {
        const id = uuidv4();
        const {
            content,
            context = 'general',
            type = 'episodic',
            emotional_weight = 0,
            confidence = 1.0,
            timestamp = new Date().toISOString(),
            person_id = null,
            tags = null,
            parent_id = null
        } = memoryData;

        await this.runQuery(
            `INSERT INTO memories (id, content, context, type, emotional_weight, confidence, timestamp, person_id, tags, parent_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, content, context, type, emotional_weight, confidence, timestamp, person_id, tags, parent_id]
        );

        // Update relationship if person_id provided
        if (person_id) {
            await this.updateRelationship(person_id, timestamp);
        }

        return { id, ...memoryData };
    }

    async search(query, context = null, limit = 10) {
        let sql = `
            SELECT *, 
                   CASE 
                       WHEN content LIKE ? THEN 1.0
                       WHEN content LIKE ? THEN 0.8
                       WHEN context LIKE ? THEN 0.6
                       WHEN tags LIKE ? THEN 0.5
                       ELSE 0.3
                   END as relevance_score
            FROM memories 
            WHERE content LIKE ? OR context LIKE ? OR tags LIKE ?
        `;
        
        const searchPattern = `%${query}%`;
        const exactPattern = `%${query}%`;
        const params = [
            exactPattern, searchPattern, searchPattern, searchPattern,
            searchPattern, searchPattern, searchPattern
        ];

        if (context) {
            sql += ` AND context = ?`;
            params.push(context);
        }

        sql += ` ORDER BY relevance_score DESC, emotional_weight DESC, timestamp DESC LIMIT ?`;
        params.push(limit);

        const results = await this.allQuery(sql, params);
        
        return results.map(row => ({
            ...row,
            confidence: row.relevance_score * row.confidence
        }));
    }

    async getMemoriesByType(type, limit = 50) {
        return await this.allQuery(
            `SELECT * FROM memories WHERE type = ? ORDER BY timestamp DESC LIMIT ?`,
            [type, limit]
        );
    }

    async getRelationshipHistory(personId, limit = 20) {
        return await this.allQuery(
            `SELECT * FROM memories WHERE person_id = ? ORDER BY timestamp DESC LIMIT ?`,
            [personId, limit]
        );
    }

    async updateRelationship(personId, lastInteraction) {
        // Check if relationship exists
        const existing = await this.getQuery(
            `SELECT * FROM relationships WHERE person_id = ?`,
            [personId]
        );

        if (existing) {
            await this.runQuery(
                `UPDATE relationships SET 
                 interaction_count = interaction_count + 1,
                 last_interaction = ?,
                 emotional_bond = CASE 
                     WHEN emotional_bond < 1.0 THEN emotional_bond + 0.01
                     ELSE emotional_bond
                 END
                 WHERE person_id = ?`,
                [lastInteraction, personId]
            );
        } else {
            await this.runQuery(
                `INSERT INTO relationships (id, person_id, interaction_count, last_interaction, emotional_bond)
                 VALUES (?, ?, 1, ?, 0.1)`,
                [uuidv4(), personId, lastInteraction]
            );
        }
    }

    async getRelationship(personId) {
        return await this.getQuery(
            `SELECT * FROM relationships WHERE person_id = ?`,
            [personId]
        );
    }

    async getAllRelationships() {
        return await this.allQuery(
            `SELECT * FROM relationships ORDER BY emotional_bond DESC, interaction_count DESC`
        );
    }

    async storeReasoningHistory(reasoning) {
        const id = uuidv4();
        const { premises, conclusion, method, confidence, memory_id = null } = reasoning;

        await this.runQuery(
            `INSERT INTO reasoning_history (id, premises, conclusion, method, confidence, timestamp, memory_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, JSON.stringify(premises), conclusion, method, confidence, new Date().toISOString(), memory_id]
        );

        return { id, ...reasoning };
    }

    async getReasoningHistory(limit = 10) {
        const results = await this.allQuery(
            `SELECT * FROM reasoning_history ORDER BY timestamp DESC LIMIT ?`,
            [limit]
        );

        return results.map(row => ({
            ...row,
            premises: JSON.parse(row.premises)
        }));
    }

    async getMemoryStats() {
        const totalMemories = await this.getQuery(`SELECT COUNT(*) as count FROM memories`);
        const memoryTypes = await this.allQuery(`SELECT type, COUNT(*) as count FROM memories GROUP BY type`);
        const relationshipCount = await this.getQuery(`SELECT COUNT(*) as count FROM relationships`);
        const reasoningCount = await this.getQuery(`SELECT COUNT(*) as count FROM reasoning_history`);

        return {
            total_memories: totalMemories.count,
            memory_types: memoryTypes,
            relationships: relationshipCount.count,
            reasoning_sessions: reasoningCount.count
        };
    }

    async close() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err);
                    }
                    resolve();
                });
            });
        }
    }
}

module.exports = { MemoryManager };
