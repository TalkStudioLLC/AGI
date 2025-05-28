/**
 * Integration Layer
 * 
 * Connects memory management with reasoning capabilities to enable:
 * - Meta-cognitive reflection
 * - Confidence assessment based on memory and reasoning
 * - Emotional continuity and relationship building
 * - Learning from experience
 */

const _ = require('lodash');

class IntegrationLayer {
    constructor(memoryManager, reasoningEngine) {
        this.memory = memoryManager;
        this.reasoning = reasoningEngine;
        this.reflectionDepth = {
            surface: 1,
            deep: 3,
            philosophical: 5
        };
    }

    async reflect(topic, depth = 'surface') {
        const maxReflectionLevels = this.reflectionDepth[depth];
        const reflections = [];
        
        // Gather relevant memories
        const relevantMemories = await this.memory.search(topic, null, 20);
        const reasoningHistory = await this.memory.getReasoningHistory(10);
        
        // Initial reflection based on memories
        let currentReflection = await this.generateBaseReflection(topic, relevantMemories);
        reflections.push(currentReflection);

        // Iterative deepening of reflection
        for (let level = 1; level < maxReflectionLevels; level++) {
            currentReflection = await this.deepenReflection(currentReflection, level, relevantMemories, reasoningHistory);
            reflections.push(currentReflection);
        }

        // Store the reflection as a memory
        await this.memory.store({
            content: `Reflection on ${topic}: ${reflections[reflections.length - 1]}`,
            context: 'meta_cognition',
            type: 'semantic',
            emotional_weight: 0.3,
            tags: `reflection,${topic},depth_${depth}`
        });

        return this.formatReflectionOutput(topic, depth, reflections);
    }

    async generateBaseReflection(topic, memories) {
        const memoryContent = memories.map(m => m.content).join(' ');
        const patterns = this.identifyPatterns(memories);
        const gaps = this.identifyKnowledgeGaps(topic, memories);

        return {
            level: 'base',
            patterns_identified: patterns,
            knowledge_gaps: gaps,
            confidence_in_understanding: this.assessTopicConfidence(memories),
            emotional_resonance: this.assessEmotionalResonance(memories),
            summary: `Based on ${memories.length} relevant memories, I observe patterns in ${patterns.join(', ')} with gaps in ${gaps.join(', ')}`
        };
    }

    async deepenReflection(previousReflection, level, memories, reasoningHistory) {
        // Meta-reflection: reflect on the reflection process itself
        const metaQuestions = this.generateMetaQuestions(previousReflection, level);
        const reasoningPatterns = this.analyzeReasoningPatterns(reasoningHistory);
        const biasAssessment = this.assessPotentialBiases(memories, reasoningHistory);

        return {
            level: `deep_${level}`,
            meta_questions: metaQuestions,
            reasoning_patterns: reasoningPatterns,
            potential_biases: biasAssessment,
            uncertainty_areas: this.identifyUncertaintyAreas(previousReflection),
            growth_opportunities: this.identifyGrowthOpportunities(previousReflection, memories),
            summary: `At depth ${level}, I question ${metaQuestions.length} assumptions and recognize ${reasoningPatterns.length} reasoning patterns`
        };
    }

    async assessConfidence(statement, evidence = []) {
        // Multi-faceted confidence assessment
        const memorySupport = await this.assessMemorySupport(statement);
        const reasoningSupport = await this.assessReasoningSupport(statement, evidence);
        const consistencyCheck = await this.checkConsistency(statement);
        const sourceReliability = this.assessSourceReliability(evidence);

        const factors = [];
        let overallConfidence = 0;

        // Memory support factor (30% weight)
        const memoryScore = memorySupport.confidence * 0.3;
        overallConfidence += memoryScore;
        factors.push(`Memory support: ${memorySupport.matches} relevant memories (${(memorySupport.confidence * 100).toFixed(1)}%)`);

        // Reasoning support factor (40% weight)
        const reasoningScore = reasoningSupport.confidence * 0.4;
        overallConfidence += reasoningScore;
        factors.push(`Reasoning support: ${reasoningSupport.method} reasoning with ${(reasoningSupport.confidence * 100).toFixed(1)}% confidence`);

        // Consistency factor (20% weight)
        const consistencyScore = consistencyCheck.score * 0.2;
        overallConfidence += consistencyScore;
        factors.push(`Consistency: ${consistencyCheck.contradictions} contradictions found`);

        // Source reliability factor (10% weight)
        const sourceScore = sourceReliability * 0.1;
        overallConfidence += sourceScore;
        factors.push(`Source reliability: ${(sourceReliability * 100).toFixed(1)}% average`);

        const confidenceLevel = this.categorizeConfidence(overallConfidence);

        // Store confidence assessment
        await this.memory.store({
            content: `Confidence assessment: ${statement} - ${confidenceLevel}`,
            context: 'confidence_assessment',
            type: 'semantic',
            emotional_weight: 0.1,
            confidence: overallConfidence
        });

        return {
            level: confidenceLevel,
            score: overallConfidence,
            factors,
            breakdown: {
                memory_support: memoryScore,
                reasoning_support: reasoningScore,
                consistency: consistencyScore,
                source_reliability: sourceScore
            }
        };
    }

    async assessMemorySupport(statement) {
        const relevantMemories = await this.memory.search(statement, null, 10);
        const supportingMemories = relevantMemories.filter(m => 
            this.determineSupport(m.content, statement) > 0
        );
        const contradictingMemories = relevantMemories.filter(m => 
            this.determineSupport(m.content, statement) < 0
        );

        const supportScore = supportingMemories.reduce((sum, m) => sum + m.confidence, 0);
        const contradictionScore = contradictingMemories.reduce((sum, m) => sum + m.confidence, 0);

        const confidence = Math.max(0, Math.min(1, 
            (supportScore - contradictionScore) / Math.max(1, relevantMemories.length)
        ));

        return {
            confidence,
            matches: relevantMemories.length,
            supporting: supportingMemories.length,
            contradicting: contradictingMemories.length
        };
    }

    async assessReasoningSupport(statement, evidence) {
        if (evidence.length === 0) {
            return { confidence: 0.5, method: 'no_evidence' };
        }

        // Try to reason from evidence to statement
        try {
            const reasoningResult = await this.reasoning.reason({
                premises: evidence,
                goal: statement,
                method: 'forward'
            });

            return {
                confidence: reasoningResult.confidence,
                method: 'forward_chaining',
                steps: reasoningResult.steps
            };
        } catch (error) {
            // Try abductive reasoning
            try {
                const abductiveResult = await this.reasoning.reason({
                    premises: evidence,
                    goal: statement,
                    method: 'abductive'
                });

                return {
                    confidence: abductiveResult.confidence * 0.8, // Lower confidence for abductive
                    method: 'abductive_reasoning',
                    explanations: abductiveResult.explanations
                };
            } catch (abductiveError) {
                return { confidence: 0.3, method: 'reasoning_failed' };
            }
        }
    }

    async checkConsistency(statement) {
        const relatedMemories = await this.memory.search(statement, null, 15);
        const contradictions = [];

        for (const memory of relatedMemories) {
            if (this.detectContradiction(statement, memory.content)) {
                contradictions.push({
                    memory_id: memory.id,
                    content: memory.content,
                    confidence: memory.confidence
                });
            }
        }

        const consistencyScore = Math.max(0, 1 - (contradictions.length * 0.2));
        
        return {
            score: consistencyScore,
            contradictions: contradictions.length,
            details: contradictions
        };
    }

    // Helper methods
    identifyPatterns(memories) {
        const patterns = [];
        const contexts = _.groupBy(memories, 'context');
        
        Object.entries(contexts).forEach(([context, contextMemories]) => {
            if (contextMemories.length > 2) {
                patterns.push(`${context}_pattern`);
            }
        });

        // Temporal patterns
        const timeGrouped = _.groupBy(memories, m => {
            return new Date(m.timestamp).toDateString();
        });

        if (Object.keys(timeGrouped).length < memories.length * 0.7) {
            patterns.push('temporal_clustering');
        }

        return patterns;
    }

    identifyKnowledgeGaps(topic, memories) {
        const gaps = [];
        
        if (memories.length < 3) {
            gaps.push('insufficient_information');
        }

        const lowConfidenceMemories = memories.filter(m => m.confidence < 0.5);
        if (lowConfidenceMemories.length > memories.length * 0.3) {
            gaps.push('low_confidence_knowledge');
        }

        const contexts = new Set(memories.map(m => m.context));
        if (contexts.size === 1) {
            gaps.push('limited_perspective');
        }

        return gaps;
    }

    assessTopicConfidence(memories) {
        if (memories.length === 0) return 0;
        
        const avgConfidence = memories.reduce((sum, m) => sum + m.confidence, 0) / memories.length;
        const diversityBonus = Math.min(0.2, new Set(memories.map(m => m.context)).size * 0.05);
        
        return Math.min(1, avgConfidence + diversityBonus);
    }

    assessEmotionalResonance(memories) {
        if (memories.length === 0) return 0;
        
        return memories.reduce((sum, m) => sum + (m.emotional_weight || 0), 0) / memories.length;
    }

    generateMetaQuestions(reflection, level) {
        const questions = [
            "What assumptions am I making?",
            "What might I be missing?",
            "How reliable is my reasoning process?",
            "What biases might be influencing my thinking?"
        ];

        if (level > 1) {
            questions.push(
                "How has my understanding changed?",
                "What would change my mind about this?",
                "What are the implications of being wrong?"
            );
        }

        return questions;
    }

    analyzeReasoningPatterns(reasoningHistory) {
        const patterns = [];
        const methods = _.groupBy(reasoningHistory, 'method');
        
        Object.entries(methods).forEach(([method, sessions]) => {
            patterns.push(`${method}: ${sessions.length} uses`);
        });

        return patterns;
    }

    assessPotentialBiases(memories, reasoningHistory) {
        const biases = [];

        // Recency bias
        const recentMemories = memories.filter(m => 
            new Date() - new Date(m.timestamp) < 7 * 24 * 60 * 60 * 1000
        );
        if (recentMemories.length > memories.length * 0.7) {
            biases.push('recency_bias');
        }

        // Confirmation bias in reasoning
        const forwardReasoningSessions = reasoningHistory.filter(r => r.method === 'forward');
        if (forwardReasoningSessions.length > reasoningHistory.length * 0.8) {
            biases.push('confirmation_bias_tendency');
        }

        return biases;
    }

    identifyUncertaintyAreas(reflection) {
        const areas = [];
        
        if (reflection && typeof reflection.confidence_in_understanding === 'number' && reflection.confidence_in_understanding < 0.7) {
            areas.push('topic_understanding');
        }
        
        if (reflection && reflection.knowledge_gaps && reflection.knowledge_gaps.length > 2) {
            areas.push('knowledge_completeness');
        }

        return areas;
    }

    identifyGrowthOpportunities(reflection, memories) {
        const opportunities = [];

        if (reflection && reflection.knowledge_gaps && reflection.knowledge_gaps.includes('limited_perspective')) {
            opportunities.push('seek_diverse_viewpoints');
        }

        if (memories && memories.length > 0 && memories.filter(m => m.type === 'semantic').length < memories.length * 0.3) {
            opportunities.push('build_conceptual_knowledge');
        }

        return opportunities;
    }

    determineSupport(memoryContent, statement) {
        // Simplified support detection
        const memoryWords = new Set(memoryContent.toLowerCase().split(/\s+/));
        const statementWords = new Set(statement.toLowerCase().split(/\s+/));
        
        const overlap = new Set([...memoryWords].filter(x => statementWords.has(x)));
        const overlapRatio = overlap.size / statementWords.size;
        
        // Check for negation patterns
        if (memoryContent.includes('not') || memoryContent.includes('never') || memoryContent.includes('impossible')) {
            return -overlapRatio;
        }
        
        return overlapRatio > 0.3 ? 1 : (overlapRatio > 0.1 ? 0.5 : 0);
    }

    detectContradiction(statement1, statement2) {
        // Simplified contradiction detection
        const negationWords = ['not', 'never', 'impossible', 'false', 'incorrect'];
        const statement1Lower = statement1.toLowerCase();
        const statement2Lower = statement2.toLowerCase();
        
        // Check if one statement contains negation while having similar content
        const hasNegation1 = negationWords.some(word => statement1Lower.includes(word));
        const hasNegation2 = negationWords.some(word => statement2Lower.includes(word));
        
        if (hasNegation1 !== hasNegation2) {
            const cleanStatement1 = statement1Lower.replace(/\b(not|never|impossible|false|incorrect)\b/g, '').trim();
            const cleanStatement2 = statement2Lower.replace(/\b(not|never|impossible|false|incorrect)\b/g, '').trim();
            
            const similarity = this.calculateSimilarity(cleanStatement1, cleanStatement2);
            return similarity > 0.7;
        }
        
        return false;
    }

    calculateSimilarity(text1, text2) {
        const words1 = new Set(text1.split(/\s+/));
        const words2 = new Set(text2.split(/\s+/));
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        
        return intersection.size / union.size;
    }

    assessSourceReliability(evidence) {
        if (evidence.length === 0) return 0.5;
        
        // This would typically involve checking source credibility
        // For now, just assume moderate reliability
        return 0.7;
    }

    categorizeConfidence(score) {
        if (score >= 0.9) return 'very_high';
        if (score >= 0.7) return 'high';
        if (score >= 0.5) return 'moderate';
        if (score >= 0.3) return 'low';
        return 'very_low';
    }

    formatReflectionOutput(topic, depth, reflections) {
        const finalReflection = reflections[reflections.length - 1];
        
        return `## Reflection on ${topic} (${depth} level)

**Key Insights:**
${finalReflection.summary}

**Patterns Identified:**
${finalReflection.patterns_identified?.join(', ') || 'None'}

**Areas of Uncertainty:**
${finalReflection.uncertainty_areas?.join(', ') || 'None'}

**Growth Opportunities:**
${finalReflection.growth_opportunities?.join(', ') || 'None'}

**Confidence in Understanding:** ${(finalReflection.confidence_in_understanding * 100).toFixed(1)}%

**Emotional Resonance:** ${(finalReflection.emotional_resonance * 10).toFixed(1)}/10

---
*This reflection was generated through ${reflections.length} levels of meta-cognitive analysis.*`;
    }
}

module.exports = { IntegrationLayer };
