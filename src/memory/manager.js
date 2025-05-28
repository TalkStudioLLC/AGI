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
                    this.createTables().then(() => {
                        this.isInitialized = true;
                        this.logMemoryStats();
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

        try {
            await this.runQuery(
                `INSERT INTO memories (id, content, context, type, emotional_weight, confidence, timestamp, person_id, tags, parent_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, content, context, type, emotional_weight, confidence, timestamp, person_id, tags, parent_id]
            );

            console.error(`💾 Stored memory: ${id} - "${content.substring(0, 50)}..."`);  
            
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

    async search(query, context = null, limit = 10) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        console.error(`🔍 Searching for: "${query}" in context: ${context || 'all'}`);
        
        // Expand the search query with related terms
        const expandedTerms = this.expandSearchTerms(query);
        console.error(`🔍 Expanded search terms: ${expandedTerms.join(', ')}`);
        
        let sql = `
            SELECT *, 
                   CASE 
                       WHEN content LIKE ? THEN 1.0
                       WHEN content LIKE ? THEN 0.8
                       WHEN context LIKE ? THEN 0.6
                       WHEN tags LIKE ? THEN 0.5
                       ELSE 0.3
                   END as base_relevance_score
            FROM memories 
            WHERE content LIKE ? OR context LIKE ? OR tags LIKE ?
        `;
        
        const searchPattern = `%${query}%`;
        const exactPattern = `%${query}%`;
        let params = [
            exactPattern, searchPattern, searchPattern, searchPattern,
            searchPattern, searchPattern, searchPattern
        ];

        // Add expanded term searches
        const expandedConditions = [];
        expandedTerms.forEach(term => {
            if (term !== query) {
                expandedConditions.push('content LIKE ? OR context LIKE ? OR tags LIKE ?');
                params.push(`%${term}%`, `%${term}%`, `%${term}%`);
            }
        });
        
        if (expandedConditions.length > 0) {
            sql += ` OR (${expandedConditions.join(' OR ')})`;
        }

        if (context) {
            sql += ` AND context = ?`;
            params.push(context);
        }

        sql += ` ORDER BY base_relevance_score DESC, emotional_weight DESC, timestamp DESC LIMIT ?`;
        params.push(limit);

        try {
            const results = await this.allQuery(sql, params);
            
            // Calculate semantic relevance scores
            const scoredResults = results.map(row => {
                const semanticScore = this.calculateSemanticRelevance(query, row.content, expandedTerms);
                return {
                    ...row,
                    confidence: (row.base_relevance_score * 0.6 + semanticScore * 0.4) * row.confidence
                };
            });
            
            // Re-sort by combined score
            scoredResults.sort((a, b) => b.confidence - a.confidence);
            
            console.error(`📊 Found ${scoredResults.length} memories matching "${query}"`);
            
            if (scoredResults.length > 0) {
                console.error(`📝 Sample results: ${scoredResults.slice(0, 2).map(r => `"${r.content.substring(0, 40)}..." (score: ${r.confidence.toFixed(2)})`).join(', ')}`);
            }
            
            return scoredResults;
        } catch (error) {
            console.error('❌ Search failed:', error);
            return [];
        }
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
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        try {
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
        } catch (error) {
            console.error('❌ Failed to get memory stats:', error);
            return {
                total_memories: 0,
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
            console.error(`   Total memories: ${stats.total_memories}`);
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

    expandSearchTerms(query) {
        const terms = new Set([query]);
        const lowercaseQuery = query.toLowerCase();
        
        // Drink/beverage related expansions
        if (lowercaseQuery.includes('drink') || lowercaseQuery.includes('beverage')) {
            terms.add('coffee');
            terms.add('tea');
            terms.add('water');
            terms.add('soda');
            terms.add('juice');
            terms.add('beer');
            terms.add('wine');
            terms.add('cocktail');
            terms.add('likes');
        }
        
        // Preference related expansions
        if (lowercaseQuery.includes('prefer') || lowercaseQuery.includes('like')) {
            terms.add('favorite');
            terms.add('enjoy');
            terms.add('love');
        }
        
        // User/person related expansions
        if (lowercaseQuery.includes('user') || lowercaseQuery.includes('i ') || lowercaseQuery.includes('my ')) {
            terms.add('User');
            terms.add('I');
            terms.add('my');
        }
        
        // Food related expansions
        if (lowercaseQuery.includes('food') || lowercaseQuery.includes('eat')) {
            terms.add('pizza');
            terms.add('pasta');
            terms.add('salad');
            terms.add('sandwich');
        }
        
        // Technical/project related expansions
        if (lowercaseQuery.includes('project') || lowercaseQuery.includes('code')) {
            terms.add('AGI');
            terms.add('MCP');
            terms.add('server');
            terms.add('development');
        }
        
        return Array.from(terms);
    }
    
    calculateSemanticRelevance(originalQuery, content, expandedTerms) {
        const queryWords = originalQuery.toLowerCase().split(/\s+/);
        const contentWords = content.toLowerCase().split(/\s+/);
        
        let score = 0;
        
        // Direct word matches
        queryWords.forEach(queryWord => {
            if (contentWords.some(contentWord => contentWord.includes(queryWord))) {
                score += 0.3;
            }
        });
        
        // Expanded term matches
        expandedTerms.forEach(term => {
            if (content.toLowerCase().includes(term.toLowerCase())) {
                score += 0.2;
            }
        });
        
        // Concept matching bonuses
        const queryLower = originalQuery.toLowerCase();
        const contentLower = content.toLowerCase();
        
        // Drink preference concept
        if ((queryLower.includes('drink') || queryLower.includes('beverage')) && 
            (contentLower.includes('coffee') || contentLower.includes('tea') || contentLower.includes('water'))) {
            score += 0.5;
        }
        
        // Preference concept
        if ((queryLower.includes('like') || queryLower.includes('prefer')) && 
            (contentLower.includes('likes') || contentLower.includes('love') || contentLower.includes('enjoy'))) {
            score += 0.3;
        }
        
        return Math.min(1.0, score);
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
