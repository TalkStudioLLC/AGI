/**
 * Memory Manager — F3IL v3
 *
 * Handles persistent storage and retrieval of memories across different types:
 * - Episodic: Personal experiences and interactions
 * - Semantic: General knowledge and concepts
 * - Emotional: Relationship context and emotional experiences
 *
 * v3: recall is hybrid — local vector embeddings (meaning-based) merged with
 * multi-term keyword matching. Embeddings are computed on this machine (see
 * ./embeddings.js), stored as a JSON column in the same single memory.db
 * file, and used only as an index; the human-readable text stays canonical.
 * If the embedding model is unavailable, recall degrades gracefully to
 * keyword-only (v2 behavior, minus its single-substring blind spot).
 */

import sqlite3Pkg from 'sqlite3';
const sqlite3 = sqlite3Pkg.verbose();
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { embedText, cosineSim } from './embeddings.js';

// Below this cosine similarity, a memory is not considered semantically
// related to the query (tuned for all-MiniLM-L6-v2 normalized embeddings).
const SEMANTIC_THRESHOLD = 0.35;

class MemoryManager {
    constructor(dbPath = './memory.db') {
        this.dbPath = dbPath;
        this.db = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) {
            console.error('💾 MemoryManager already initialized');
            return;
        }

        return new Promise((resolve, reject) => {
            console.error(`🗃️  Initializing database at: ${this.dbPath}`);

            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ Database connection failed:', err);
                    reject(err);
                } else {
                    console.error('✅ Database connected successfully');
                    this.createTables().then(async () => {
                        await this.migrateSchema();
                        this.isInitialized = true;
                        this.logMemoryStats();
                        // Backfill embeddings for pre-v3 memories in the
                        // background; storage/recall never wait on this.
                        this.backfillEmbeddings().catch(() => {});
                        resolve();
                    }).catch(reject);
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

    /** v3 migration: add the embedding column to databases created by v1/v2. */
    async migrateSchema() {
        const columns = await this.allQuery(`PRAGMA table_info(memories)`);
        const hasEmbedding = columns.some(c => c.name === 'embedding');
        if (!hasEmbedding) {
            console.error('🔧 Migrating memories table: adding embedding column (v3)');
            await this.runQuery(`ALTER TABLE memories ADD COLUMN embedding TEXT`);
        }
    }

    /**
     * Embed any memories that don't have vectors yet (pre-v3 rows, or rows
     * stored while the model was unavailable). Runs in the background.
     */
    async backfillEmbeddings(batchSize = 100) {
        const rows = await this.allQuery(
            `SELECT id, content FROM memories WHERE embedding IS NULL LIMIT ?`,
            [batchSize]
        );
        if (rows.length === 0) return 0;

        let done = 0;
        for (const row of rows) {
            const emb = await embedText(row.content);
            if (emb === null) break; // model unavailable — try again next launch
            await this.runQuery(
                `UPDATE memories SET embedding = ? WHERE id = ?`,
                [JSON.stringify(emb), row.id]
            );
            done++;
        }
        if (done > 0) {
            console.error(`🧭 Backfilled embeddings for ${done} existing memories`);
        }
        return done;
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
        if (!this.isInitialized) {
            await this.initialize();
        }

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

        // Embed at store time so recall is instant. If the model isn't
        // available, store anyway (embedding backfills on a later launch).
        const embedding = await embedText(content);

        try {
            await this.runQuery(
                `INSERT INTO memories (id, content, context, type, emotional_weight, confidence, timestamp, person_id, tags, parent_id, embedding)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, content, context, type, emotional_weight, confidence, timestamp, person_id, tags, parent_id,
                 embedding ? JSON.stringify(embedding) : null]
            );

            console.error(`💾 Stored memory: ${id} - "${content.substring(0, 50)}..."` +
                (embedding ? ' [embedded]' : ' [no embedding — will backfill]'));

            // Update relationship if person_id provided
            if (person_id) {
                await this.updateRelationship(person_id, timestamp);
            }

            return { id, content, context, type, emotional_weight, confidence, timestamp, person_id, tags, parent_id };
        } catch (error) {
            console.error('❌ Failed to store memory:', error);
            throw error;
        }
    }

    /**
     * v3 hybrid recall.
     *
     * Two channels, merged:
     *  1. Semantic — embed the query locally, cosine-rank against stored
     *     memory vectors. Finds meaning matches with zero shared words.
     *  2. Keyword — every individual query term matched against
     *     content/context/tags (v2 matched only the whole query as one
     *     substring, so multi-word queries like "sr-lab docker" found
     *     nothing; per-term matching fixes that).
     *
     * A memory qualifies if either channel finds it. Ranking blends both
     * signals, weighted by the memory's own stored confidence.
     */
    async search(query, context = null, limit = 10) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        console.error(`🔍 Searching for: "${query}" in context: ${context || 'all'}`);

        // ---- Channel 1: semantic ----
        const queryEmbedding = await embedText(query);
        const semanticScores = new Map(); // id -> cosine

        if (queryEmbedding) {
            const candidates = await this.allQuery(
                context
                    ? `SELECT id, embedding FROM memories WHERE embedding IS NOT NULL AND context = ?`
                    : `SELECT id, embedding FROM memories WHERE embedding IS NOT NULL`,
                context ? [context] : []
            );
            for (const row of candidates) {
                try {
                    const sim = cosineSim(queryEmbedding, JSON.parse(row.embedding));
                    if (sim >= SEMANTIC_THRESHOLD) {
                        semanticScores.set(row.id, sim);
                    }
                } catch { /* unparseable embedding — skip */ }
            }
            console.error(`🧭 Semantic channel: ${semanticScores.size} memories above threshold`);
        } else {
            console.error('🧭 Semantic channel unavailable — keyword-only recall');
        }

        // ---- Channel 2: per-term keyword ----
        const terms = [...new Set(
            query.toLowerCase().split(/\s+/).filter(t => t.length > 1)
        )];
        if (terms.length === 0) terms.push(query.toLowerCase());

        const likeClauses = [];
        const likeParams = [];
        for (const term of terms) {
            likeClauses.push(`(lower(content) LIKE ? OR lower(context) LIKE ? OR lower(tags) LIKE ?)`);
            const p = `%${term}%`;
            likeParams.push(p, p, p);
        }
        let keywordSql = `SELECT * FROM memories WHERE (${likeClauses.join(' OR ')})`;
        if (context) {
            keywordSql += ` AND context = ?`;
            likeParams.push(context);
        }

        let keywordRows = [];
        try {
            keywordRows = await this.allQuery(keywordSql, likeParams);
        } catch (error) {
            console.error('❌ Keyword search failed:', error);
        }

        const keywordScores = new Map(); // id -> fraction of terms matched (+ phrase bonus)
        for (const row of keywordRows) {
            const haystack = `${row.content} ${row.context || ''} ${row.tags || ''}`.toLowerCase();
            const matched = terms.filter(t => haystack.includes(t)).length;
            let score = matched / terms.length;
            if (haystack.includes(query.toLowerCase())) score = Math.min(1.0, score + 0.25); // whole-phrase bonus
            keywordScores.set(row.id, score);
        }
        console.error(`🔤 Keyword channel: ${keywordScores.size} memories matched (${terms.length} terms)`);

        // ---- Merge, fetch full rows, rank ----
        const allIds = [...new Set([...semanticScores.keys(), ...keywordScores.keys()])];
        if (allIds.length === 0) {
            console.error(`📊 Found 0 memories matching "${query}"`);
            return [];
        }

        const placeholders = allIds.map(() => '?').join(',');
        const fullRows = await this.allQuery(
            `SELECT * FROM memories WHERE id IN (${placeholders})`, allIds
        );

        const scored = fullRows.map(row => {
            const sem = semanticScores.get(row.id) || 0;
            const kw = keywordScores.get(row.id) || 0;
            // Semantic dominates when available; keyword keeps exact matches strong.
            const blended = queryEmbedding ? (0.65 * sem + 0.35 * kw) : kw;
            const { embedding, ...rest } = row; // don't return raw vectors to callers
            return {
                ...rest,
                confidence: Math.min(1.0, blended) * (row.confidence ?? 1.0),
                _semantic: sem,
                _keyword: kw
            };
        });

        scored.sort((a, b) =>
            b.confidence - a.confidence ||
            (b.emotional_weight ?? 0) - (a.emotional_weight ?? 0) ||
            (a.timestamp < b.timestamp ? 1 : -1)
        );

        const results = scored.slice(0, limit);
        console.error(`📊 Found ${results.length} memories matching "${query}"`);
        if (results.length > 0) {
            console.error(`📝 Sample results: ${results.slice(0, 2).map(r =>
                `"${r.content.substring(0, 40)}..." (score: ${r.confidence.toFixed(2)}, sem: ${r._semantic.toFixed(2)}, kw: ${r._keyword.toFixed(2)})`
            ).join(', ')}`);
        }
        return results;
    }

    async getMemoriesByType(type, limit = 50) {
        return await this.allQuery(
            `SELECT id, content, context, type, emotional_weight, confidence, timestamp, person_id, tags, parent_id, created_at
             FROM memories WHERE type = ? ORDER BY timestamp DESC LIMIT ?`,
            [type, limit]
        );
    }

    async getRelationshipHistory(personId, limit = 20) {
        return await this.allQuery(
            `SELECT id, content, context, type, emotional_weight, confidence, timestamp, person_id, tags, parent_id, created_at
             FROM memories WHERE person_id = ? ORDER BY timestamp DESC LIMIT ?`,
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
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            const totalMemories = await this.getQuery(`SELECT COUNT(*) as count FROM memories`);
            const memoryTypes = await this.allQuery(`SELECT type, COUNT(*) as count FROM memories GROUP BY type`);
            const relationshipCount = await this.getQuery(`SELECT COUNT(*) as count FROM relationships`);
            const reasoningCount = await this.getQuery(`SELECT COUNT(*) as count FROM reasoning_history`);
            const embeddedCount = await this.getQuery(`SELECT COUNT(*) as count FROM memories WHERE embedding IS NOT NULL`);

            return {
                total_memories: totalMemories.count,
                embedded_memories: embeddedCount.count,
                memory_types: memoryTypes,
                relationships: relationshipCount.count,
                reasoning_sessions: reasoningCount.count
            };
        } catch (error) {
            console.error('❌ Failed to get memory stats:', error);
            return {
                total_memories: 0,
                embedded_memories: 0,
                memory_types: [],
                relationships: 0,
                reasoning_sessions: 0
            };
        }
    }

    async logMemoryStats() {
        try {
            const stats = await this.getMemoryStats();
            console.error(`📊 Memory Database Status:`);
            console.error(`   Total memories: ${stats.total_memories} (${stats.embedded_memories} embedded)`);
            console.error(`   Relationships: ${stats.relationships}`);
            console.error(`   Reasoning sessions: ${stats.reasoning_sessions}`);

            if (stats.memory_types.length > 0) {
                console.error(`   Memory types: ${stats.memory_types.map(t => `${t.type}(${t.count})`).join(', ')}`);
            }

            // Show recent memories
            const recentMemories = await this.allQuery(
                `SELECT content, context, timestamp FROM memories ORDER BY timestamp DESC LIMIT 3`
            );

            if (recentMemories.length > 0) {
                console.error(`   Recent memories:`);
                recentMemories.forEach(m => {
                    const date = new Date(m.timestamp).toLocaleString();
                    console.error(`     - [${m.context}] ${m.content.substring(0, 40)}... (${date})`);
                });
            }
        } catch (error) {
            console.error('❌ Failed to log memory stats:', error);
        }
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

export { MemoryManager };
