#!/usr/bin/env node

/**
 * Fast Conversation Ingestion Tool
 * 
 * High-performance batch processing for large Claude exports
 * Uses streaming, chunking, and intelligent summarization
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { MemoryManager } = require('./src/memory/manager.js');

class FastIngester {
    constructor() {
        this.memoryManager = new MemoryManager();
        this.batchSize = 100; // Process in batches to avoid memory issues
        this.chunkSize = 5000; // Characters per processing chunk
        
        // High-impact patterns - focus on the most important information
        this.extractionPatterns = {
            // Personal identity & background
            identity: {
                patterns: [
                    /(?:my name is|i'm|i am|i work as|i'm a)\s+([^.!?]+)/gi,
                    /(?:i live in|i'm from|i studied|i graduated)\s+([^.!?]+)/gi
                ],
                weight: 0.9,
                context: 'identity'
            },
            
            // Family relationships - your main interest
            family: {
                patterns: [
                    /(?:my\s+(?:dad|father|mom|mother|parent|wife|husband|son|daughter|child|brother|sister))[^.!?]*[.!?]/gi,
                    /(?:dad|father|mom|mother)\s+(?:is|was|has|had|does|did|said|told|thinks|works|worked)[^.!?]*[.!?]/gi
                ],
                weight: 0.9,
                context: 'family'
            },
            
            // Current projects & work
            projects: {
                patterns: [
                    /(?:working on|building|developing|creating|project)\s+[^.!?]*(?:AGI|AI|system|application|server)[^.!?]*[.!?]/gi,
                    /(?:AGI|MCP|server|memory|reasoning)[^.!?]*(?:project|system|building|working)[^.!?]*[.!?]/gi
                ],
                weight: 0.8,
                context: 'projects'
            },
            
            // Goals & aspirations
            goals: {
                patterns: [
                    /(?:want to|hope to|plan to|goal|trying to|aiming to)[^.!?]*[.!?]/gi,
                    /(?:future|eventually|someday)[^.!?]*[.!?]/gi
                ],
                weight: 0.7,
                context: 'goals'
            },
            
            // Strong emotional content
            emotional: {
                patterns: [
                    /(?:love|care deeply|important to me|means a lot|proud|excited|worried)[^.!?]*[.!?]/gi,
                    /(?:feel|feeling)[^.!?]*(?:happy|sad|excited|worried|proud|frustrated|meaningful)[^.!?]*[.!?]/gi
                ],
                weight: 0.8,
                context: 'emotional'
            }
        };
    }
    
    async initialize() {
        await this.memoryManager.initialize();
        console.log('⚡ Fast Ingester initialized');
    }
    
    async ingestLargeFile(filePath) {
        console.log(`🚀 Processing large file: ${path.basename(filePath)}`);
        console.log('📊 Using high-performance streaming approach...');
        
        const startTime = Date.now();
        let totalSize = 0;
        let extractedMemories = [];
        
        try {
            const stats = await fs.promises.stat(filePath);
            totalSize = stats.size;
            console.log(`📁 File size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
            
            if (filePath.endsWith('.json')) {
                extractedMemories = await this.processJSONStreaming(filePath);
            } else {
                extractedMemories = await this.processTextStreaming(filePath);
            }
            
            // Batch insert for performance
            await this.batchStoreMemories(extractedMemories);
            
            const duration = (Date.now() - startTime) / 1000;
            console.log(`⚡ Completed in ${duration.toFixed(2)} seconds`);
            console.log(`💾 Stored ${extractedMemories.length} high-value memories`);
            
            await this.generateSummary();
            
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            throw error;
        }
    }
    
    async processJSONStreaming(filePath) {\n        const memories = [];\n        const stream = fs.createReadStream(filePath, { encoding: 'utf8' });\n        \n        let buffer = '';\n        let inString = false;\n        let braceCount = 0;\n        let currentObject = '';\n        \n        return new Promise((resolve, reject) => {\n            stream.on('data', (chunk) => {\n                buffer += chunk;\n                \n                // Process complete JSON objects as they're found\n                for (let i = 0; i < buffer.length; i++) {\n                    const char = buffer[i];\n                    currentObject += char;\n                    \n                    if (char === '\"' && buffer[i-1] !== '\\\\') {\n                        inString = !inString;\n                    }\n                    \n                    if (!inString) {\n                        if (char === '{') braceCount++;\n                        if (char === '}') braceCount--;\n                        \n                        // Complete object found\n                        if (braceCount === 0 && currentObject.trim().startsWith('{')) {\n                            try {\n                                const obj = JSON.parse(currentObject);\n                                const extracted = this.extractFromObject(obj);\n                                memories.push(...extracted);\n                                \n                                if (memories.length % 50 === 0) {\n                                    console.log(`🔄 Processed ${memories.length} memories...`);\n                                }\n                            } catch (e) {\n                                // Skip malformed objects\n                            }\n                            currentObject = '';\n                        }\n                    }\n                }\n                \n                // Keep last partial object in buffer\n                if (braceCount === 0) {\n                    buffer = currentObject;\n                    currentObject = '';\n                } else {\n                    buffer = '';\n                }\n            });\n            \n            stream.on('end', () => {\n                resolve(memories);\n            });\n            \n            stream.on('error', reject);\n        });\n    }\n    \n    async processTextStreaming(filePath) {\n        const memories = [];\n        const fileStream = fs.createReadStream(filePath);\n        const rl = readline.createInterface({\n            input: fileStream,\n            crlfDelay: Infinity\n        });\n        \n        let chunk = '';\n        let lineCount = 0;\n        \n        for await (const line of rl) {\n            chunk += line + ' ';\n            lineCount++;\n            \n            // Process in chunks to maintain performance\n            if (chunk.length > this.chunkSize || lineCount % 100 === 0) {\n                const extracted = this.fastExtract(chunk);\n                memories.push(...extracted);\n                \n                if (memories.length % 25 === 0 && memories.length > 0) {\n                    console.log(`🔄 Extracted ${memories.length} memories from ${lineCount} lines...`);\n                }\n                \n                chunk = '';\n            }\n        }\n        \n        // Process final chunk\n        if (chunk.trim()) {\n            const extracted = this.fastExtract(chunk);\n            memories.push(...extracted);\n        }\n        \n        return memories;\n    }\n    \n    extractFromObject(obj) {\n        const memories = [];\n        const text = this.extractTextFromObject(obj);\n        \n        if (text && text.length > 100) {\n            memories.push(...this.fastExtract(text));\n        }\n        \n        return memories;\n    }\n    \n    extractTextFromObject(obj) {\n        if (typeof obj === 'string') return obj;\n        if (!obj || typeof obj !== 'object') return '';\n        \n        let text = '';\n        \n        // Look for common message fields first (performance optimization)\n        const messageFields = ['content', 'text', 'message', 'body'];\n        for (const field of messageFields) {\n            if (obj[field] && typeof obj[field] === 'string') {\n                text += obj[field] + ' ';\n            }\n        }\n        \n        // If no standard fields found, recurse (but limit depth)\n        if (!text && typeof obj === 'object') {\n            for (const value of Object.values(obj)) {\n                if (typeof value === 'string' && value.length > 20) {\n                    text += value + ' ';\n                } else if (typeof value === 'object' && value !== null) {\n                    text += this.extractTextFromObject(value) + ' ';\n                }\n            }\n        }\n        \n        return text.trim();\n    }\n    \n    fastExtract(text) {\n        const memories = [];\n        \n        // Use regex to quickly find high-value content\n        for (const [category, config] of Object.entries(this.extractionPatterns)) {\n            for (const pattern of config.patterns) {\n                const matches = text.match(pattern);\n                if (matches) {\n                    for (const match of matches) {\n                        const cleaned = match.trim().replace(/\\s+/g, ' ');\n                        if (cleaned.length > 20 && cleaned.length < 500) {\n                            memories.push({\n                                content: cleaned,\n                                context: config.context,\n                                emotional_weight: config.weight,\n                                category: category\n                            });\n                        }\n                    }\n                }\n            }\n        }\n        \n        return memories;\n    }\n    \n    async batchStoreMemories(memories) {\n        console.log(`💾 Batch storing ${memories.length} memories...`);\n        \n        // Deduplicate similar memories\n        const unique = this.deduplicateMemories(memories);\n        console.log(`🔄 Deduplicated to ${unique.length} unique memories`);\n        \n        // Store in batches for performance\n        for (let i = 0; i < unique.length; i += this.batchSize) {\n            const batch = unique.slice(i, i + this.batchSize);\n            \n            await Promise.all(batch.map(async (memory) => {\n                await this.memoryManager.store({\n                    content: memory.content,\n                    context: memory.context,\n                    type: 'episodic',\n                    emotional_weight: memory.emotional_weight,\n                    timestamp: new Date().toISOString(),\n                    tags: `conversation,${memory.category},imported`,\n                    confidence: 0.8\n                });\n            }));\n            \n            console.log(`✅ Stored batch ${Math.floor(i/this.batchSize) + 1}/${Math.ceil(unique.length/this.batchSize)}`);\n        }\n    }\n    \n    deduplicateMemories(memories) {\n        const seen = new Set();\n        const unique = [];\n        \n        for (const memory of memories) {\n            // Create a normalized key for deduplication\n            const key = memory.content.toLowerCase()\n                .replace(/[^a-z0-9\\s]/g, '')\n                .replace(/\\s+/g, ' ')\n                .trim();\n            \n            if (!seen.has(key) && key.length > 20) {\n                seen.add(key);\n                unique.push(memory);\n            }\n        }\n        \n        return unique;\n    }\n    \n    async generateSummary() {\n        const stats = await this.memoryManager.getMemoryStats();\n        \n        console.log('\\n📊 Ingestion Summary:');\n        console.log(`   💾 Total memories: ${stats.total_memories}`);\n        console.log(`   🏷️  Memory types: ${stats.memory_types.map(t => `${t.type}(${t.count})`).join(', ')}`);\n        \n        // Show recent memories by category\n        const categories = ['family', 'identity', 'projects', 'goals', 'emotional'];\n        \n        for (const category of categories) {\n            const categoryMemories = await this.memoryManager.search('', category, 3);\n            if (categoryMemories.length > 0) {\n                console.log(`\\n🏷️  ${category.toUpperCase()} memories:`);\n                categoryMemories.forEach((mem, i) => {\n                    console.log(`   ${i + 1}. ${mem.content.substring(0, 80)}...`);\n                });\n            }\n        }\n    }\n    \n    async close() {\n        await this.memoryManager.close();\n    }\n}\n\n// CLI Usage\nif (require.main === module) {\n    const conversationFile = process.argv[2];\n    \n    if (!conversationFile) {\n        console.log(`\n⚡ Fast Claude Conversation Ingestion\n\nUsage:\n  node fast-ingest.js <conversation-file>\n\nOptimized for:\n  ✅ Large files (100MB+)\n  ✅ Streaming processing\n  ✅ High-value content extraction\n  ✅ Memory efficiency\n\nExample:\n  node fast-ingest.js ./claude-export.json\n`);\n        process.exit(1);\n    }\n    \n    (async () => {\n        const ingester = new FastIngester();\n        \n        try {\n            await ingester.initialize();\n            await ingester.ingestLargeFile(conversationFile);\n            console.log('\\n🚀 Fast ingestion completed!');\n        } catch (error) {\n            console.error('❌ Ingestion failed:', error.message);\n            process.exit(1);\n        } finally {\n            await ingester.close();\n        }\n    })();\n}\n\nmodule.exports = { FastIngester };