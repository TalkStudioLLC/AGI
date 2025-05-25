#!/usr/bin/env node

/**
 * Claude Conversation Ingestion Tool
 * 
 * Processes exported Claude conversations and stores key information
 * in the AGI persistent memory system
 */

const fs = require('fs').promises;
const path = require('path');
const { MemoryManager } = require('./src/memory/manager.js');

class ConversationIngester {
    constructor() {
        this.memoryManager = new MemoryManager();
        
        // Categories for different types of information
        this.categories = {
            personal: { weight: 0.9, context: 'personal_info' },
            family: { weight: 0.8, context: 'family_relationships' },
            projects: { weight: 0.7, context: 'work_projects' },
            preferences: { weight: 0.6, context: 'preferences' },
            technical: { weight: 0.5, context: 'technical_discussion' },
            emotional: { weight: 0.8, context: 'emotional_moments' },
            goals: { weight: 0.7, context: 'goals_aspirations' },
            experiences: { weight: 0.6, context: 'life_experiences' }
        };
        
        // Keywords to identify different types of content
        this.keywordPatterns = {
            personal: [
                /\b(?:my|i am|i'm|i have|i work|i live|i study)\b/i,
                /\b(?:my name|my age|my job|my role|my background)\b/i
            ],
            family: [
                /\b(?:my (?:dad|father|mom|mother|parent|wife|husband|son|daughter|child|brother|sister|family))\b/i,
                /\b(?:dad|father|mom|mother)\b.*\b(?:is|was|does|did|said|told|thinks|believes)\b/i
            ],
            projects: [
                /\b(?:project|working on|building|developing|creating)\b/i,
                /\b(?:AGI|AI|programming|coding|software|application|system)\b/i
            ],
            preferences: [
                /\bi (?:like|love|prefer|enjoy|hate|dislike)\b/i,
                /\b(?:favorite|favourite|best|worst)\b/i
            ],
            emotional: [
                /\b(?:feel|feeling|felt|emotion|emotional|happy|sad|excited|worried|anxious|proud|frustrated)\b/i,
                /\b(?:love|care|important|meaningful|significant)\b/i
            ],
            goals: [
                /\b(?:want to|hope to|plan to|goal|aspiration|dream|aim|objective)\b/i,
                /\b(?:future|eventually|someday|planning)\b/i
            ],
            experiences: [
                /\b(?:remember|recalled|experience|happened|occurred|time when)\b/i,
                /\b(?:story|anecdote|incident|event)\b/i
            ]
        };
    }
    
    async initialize() {
        await this.memoryManager.initialize();
        console.log('🧠 Conversation Ingester initialized');
    }
    
    async ingestConversationFile(filePath) {
        console.log(`📖 Reading conversation file: ${filePath}`);
        
        try {
            const content = await fs.readFile(filePath, 'utf8');
            
            // Try to parse as JSON first (Claude export format)
            let conversations;
            try {
                const jsonData = JSON.parse(content);
                conversations = this.parseClaudeExport(jsonData);
            } catch (e) {
                // If not JSON, treat as plain text
                conversations = this.parseTextConversation(content);
            }
            
            console.log(`📝 Found ${conversations.length} conversation segments`);
            
            // Process each conversation segment
            let totalMemories = 0;
            for (const conv of conversations) {
                const memories = await this.processConversationSegment(conv);
                totalMemories += memories;
            }
            
            console.log(`✅ Ingested ${totalMemories} memories from conversation`);
            return totalMemories;
            
        } catch (error) {
            console.error(`❌ Error ingesting conversation: ${error.message}`);
            throw error;
        }
    }
    
    parseClaudeExport(jsonData) {\n        const conversations = [];\n        \n        // Handle different possible JSON structures\n        if (Array.isArray(jsonData)) {\n            // Array of conversations\n            for (const conv of jsonData) {\n                conversations.push(...this.extractMessagesFromConversation(conv));\n            }\n        } else if (jsonData.conversations) {\n            // Object with conversations array\n            for (const conv of jsonData.conversations) {\n                conversations.push(...this.extractMessagesFromConversation(conv));\n            }\n        } else if (jsonData.messages) {\n            // Single conversation with messages\n            conversations.push(...this.extractMessagesFromConversation(jsonData));\n        } else {\n            // Try to find any message-like structures\n            conversations.push(this.extractTextFromObject(jsonData));\n        }\n        \n        return conversations;\n    }\n    \n    extractMessagesFromConversation(conversation) {\n        const segments = [];\n        \n        if (conversation.messages && Array.isArray(conversation.messages)) {\n            for (const message of conversation.messages) {\n                if (message.content && message.role === 'user') {\n                    // Focus on user messages as they contain personal information\n                    segments.push({\n                        text: message.content,\n                        timestamp: message.timestamp || new Date().toISOString(),\n                        type: 'user_message'\n                    });\n                }\n            }\n        }\n        \n        return segments;\n    }\n    \n    parseTextConversation(content) {\n        // Split by common conversation delimiters\n        const segments = content\n            .split(/\\n\\n+/)\n            .filter(segment => segment.trim().length > 50) // Only meaningful segments\n            .map(text => ({\n                text: text.trim(),\n                timestamp: new Date().toISOString(),\n                type: 'text_segment'\n            }));\n            \n        return segments;\n    }\n    \n    extractTextFromObject(obj) {\n        // Recursively extract text from any object structure\n        let text = '';\n        \n        const extract = (item) => {\n            if (typeof item === 'string') {\n                text += item + ' ';\n            } else if (Array.isArray(item)) {\n                item.forEach(extract);\n            } else if (typeof item === 'object' && item !== null) {\n                Object.values(item).forEach(extract);\n            }\n        };\n        \n        extract(obj);\n        \n        return {\n            text: text.trim(),\n            timestamp: new Date().toISOString(),\n            type: 'extracted_text'\n        };\n    }\n    \n    async processConversationSegment(segment) {\n        const { text, timestamp, type } = segment;\n        const sentences = this.splitIntoSentences(text);\n        \n        let memoriesCreated = 0;\n        \n        for (const sentence of sentences) {\n            const analysis = this.analyzeSentence(sentence);\n            \n            if (analysis.shouldStore) {\n                await this.storeMemory({\n                    content: sentence,\n                    category: analysis.category,\n                    emotional_weight: analysis.emotional_weight,\n                    context: analysis.context,\n                    source_timestamp: timestamp,\n                    source_type: type\n                });\n                memoriesCreated++;\n            }\n        }\n        \n        return memoriesCreated;\n    }\n    \n    splitIntoSentences(text) {\n        // Smart sentence splitting that preserves context\n        return text\n            .split(/[.!?]+\\s+/)\n            .map(s => s.trim())\n            .filter(s => s.length > 20 && this.isInterestingSentence(s));\n    }\n    \n    isInterestingSentence(sentence) {\n        // Filter out generic conversational fluff\n        const genericPatterns = [\n            /^(?:yes|no|ok|okay|sure|thanks|thank you)$/i,\n            /^(?:that's|that is)\\s+(?:good|great|nice|cool|interesting)$/i,\n            /^(?:i see|i understand|makes sense)$/i\n        ];\n        \n        return !genericPatterns.some(pattern => pattern.test(sentence.trim()));\n    }\n    \n    analyzeSentence(sentence) {\n        const analysis = {\n            shouldStore: false,\n            category: 'general',\n            emotional_weight: 0.3,\n            context: 'conversation',\n            confidence: 0.5\n        };\n        \n        // Check against keyword patterns\n        for (const [category, patterns] of Object.entries(this.keywordPatterns)) {\n            if (patterns.some(pattern => pattern.test(sentence))) {\n                analysis.shouldStore = true;\n                analysis.category = category;\n                analysis.emotional_weight = this.categories[category].weight;\n                analysis.context = this.categories[category].context;\n                analysis.confidence = 0.8;\n                break;\n            }\n        }\n        \n        // Additional heuristics\n        if (!analysis.shouldStore) {\n            // Store sentences with personal pronouns and meaningful content\n            if (/\\b(?:my|i|me)\\b/i.test(sentence) && sentence.length > 30) {\n                analysis.shouldStore = true;\n                analysis.category = 'personal';\n                analysis.emotional_weight = 0.5;\n                analysis.context = 'personal_mention';\n            }\n        }\n        \n        return analysis;\n    }\n    \n    async storeMemory(memoryData) {\n        const { content, category, emotional_weight, context, source_timestamp, source_type } = memoryData;\n        \n        await this.memoryManager.store({\n            content,\n            context,\n            type: 'episodic', // Conversations are episodic memories\n            emotional_weight,\n            timestamp: new Date().toISOString(),\n            tags: `conversation,${category},${source_type}`,\n            confidence: 0.9 // High confidence in imported conversation data\n        });\n        \n        console.log(`💾 Stored: ${content.substring(0, 60)}... [${category}]`);\n    }\n    \n    async generateIngestionSummary() {\n        const stats = await this.memoryManager.getMemoryStats();\n        const recentMemories = await this.memoryManager.search('', null, 20);\n        \n        console.log('\\n📊 Ingestion Summary:');\n        console.log(`   Total memories: ${stats.total_memories}`);\n        console.log(`   Memory types: ${stats.memory_types.map(t => `${t.type}(${t.count})`).join(', ')}`);\n        console.log(`   Relationships: ${stats.relationships}`);\n        \n        console.log('\\n🔍 Recent memories:');\n        recentMemories.slice(0, 5).forEach((mem, i) => {\n            console.log(`   ${i + 1}. ${mem.content.substring(0, 80)}... [${mem.context}]`);\n        });\n    }\n    \n    async close() {\n        await this.memoryManager.close();\n    }\n}\n\n// CLI Usage\nif (require.main === module) {\n    const conversationFile = process.argv[2];\n    \n    if (!conversationFile) {\n        console.log(`\n🧠 Claude Conversation Ingestion Tool\n\nUsage:\n  node ingest-conversation.js <conversation-file>\n\nSupported formats:\n  - JSON (Claude export format)\n  - Plain text conversations\n  - Any structured text file\n\nExample:\n  node ingest-conversation.js ./claude-export.json\n  node ingest-conversation.js ./conversation.txt\n`);\n        process.exit(1);\n    }\n    \n    (async () => {\n        const ingester = new ConversationIngester();\n        \n        try {\n            await ingester.initialize();\n            await ingester.ingestConversationFile(conversationFile);\n            await ingester.generateIngestionSummary();\n            console.log('\\n✅ Ingestion completed successfully!');\n        } catch (error) {\n            console.error('❌ Ingestion failed:', error.message);\n            process.exit(1);\n        } finally {\n            await ingester.close();\n        }\n    })();\n}\n\nmodule.exports = { ConversationIngester };