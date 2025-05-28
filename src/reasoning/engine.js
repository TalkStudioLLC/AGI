/**
 * Reasoning Engine
 * 
 * Implements symbolic reasoning capabilities including:
 * - Forward chaining (from facts to conclusions)
 * - Backward chaining (from goals to required conditions)
 * - Abductive reasoning (best explanation for observations)
 * - Uncertainty propagation and confidence assessment
 */

const _ = require('lodash');

class ReasoningEngine {
    constructor() {
        this.rules = new Map();
        this.facts = new Set();
        this.uncertainties = new Map();
        this.reasoning_history = [];
    }

    async initialize() {
        // Load basic reasoning rules
        this.loadBasicRules();
        console.error('🧮 Reasoning Engine initialized with', this.rules.size, 'rules');
    }

    loadBasicRules() {
        // Basic logical rules
        this.addRule('modus_ponens', {
            pattern: ['?P → ?Q', '?P'],
            conclusion: '?Q',
            confidence: 0.95
        });

        this.addRule('modus_tollens', {
            pattern: ['?P → ?Q', '¬?Q'],
            conclusion: '¬?P',
            confidence: 0.95
        });

        this.addRule('hypothetical_syllogism', {
            pattern: ['?P → ?Q', '?Q → ?R'],
            conclusion: '?P → ?R',
            confidence: 0.9
        });

        // Uncertainty rules
        this.addRule('uncertainty_propagation', {
            pattern: ['?P', 'confidence(?P) = ?C1', '?P → ?Q', 'confidence(?P → ?Q) = ?C2'],
            conclusion: '?Q',
            confidence_calculation: (c1, c2) => c1 * c2
        });

        // Causal reasoning
        this.addRule('causal_inference', {
            pattern: ['cause(?X, ?Y)', 'observed(?X)'],
            conclusion: 'likely(?Y)',
            confidence: 0.7
        });
    }

    addRule(name, rule) {
        this.rules.set(name, {
            ...rule,
            name,
            usage_count: 0,
            success_rate: 1.0
        });
    }

    addFact(fact, confidence = 1.0) {
        this.facts.add(fact);
        this.uncertainties.set(fact, confidence);
    }

    async reason(request) {
        const { premises, goal, method = 'forward' } = request;
        
        // Add premises as facts
        premises.forEach(premise => this.addFact(premise));

        let result;
        switch (method) {
            case 'forward':
                result = await this.forwardChain(goal);
                break;
            case 'backward':
                result = await this.backwardChain(goal);
                break;
            case 'abductive':
                result = await this.abductiveReason(goal);
                break;
            default:
                throw new Error(`Unknown reasoning method: ${method}`);
        }

        // Store reasoning session
        this.reasoning_history.push({
            premises,
            goal,
            method,
            result,
            timestamp: new Date().toISOString()
        });

        return result;
    }

    async forwardChain(goal) {
        const derivedFacts = new Set([...this.facts]);
        const steps = [];
        const appliedRules = [];
        let iterations = 0;
        const maxIterations = 100;

        while (iterations < maxIterations) {
            let newFactsAdded = false;
            iterations++;

            for (const [ruleName, rule] of this.rules) {
                const matches = this.matchRule(rule, derivedFacts);
                
                for (const match of matches) {
                    const conclusion = this.instantiateConclusion(rule.conclusion, match.bindings);
                    
                    if (!derivedFacts.has(conclusion)) {
                        derivedFacts.add(conclusion);
                        
                        // Calculate confidence
                        const confidence = this.calculateConfidence(rule, match, derivedFacts);
                        this.uncertainties.set(conclusion, confidence);
                        
                        steps.push(`Applied ${ruleName}: ${conclusion} (confidence: ${confidence.toFixed(2)})`);
                        appliedRules.push(ruleName);
                        newFactsAdded = true;

                        // Update rule usage statistics
                        rule.usage_count++;
                        
                        if (conclusion === goal || this.entails(conclusion, goal)) {
                            return {
                                conclusion: goal,
                                found: true,
                                confidence: this.uncertainties.get(conclusion) || confidence,
                                steps,
                                appliedRules,
                                iterations
                            };
                        }
                    }
                }
            }

            if (!newFactsAdded) break;
        }

        return {
            conclusion: goal,
            found: derivedFacts.has(goal),
            confidence: this.uncertainties.get(goal) || 0,
            steps,
            appliedRules,
            iterations
        };
    }

    async backwardChain(goal) {
        const steps = [];
        const visited = new Set();
        
        const search = (currentGoal, depth = 0) => {
            if (depth > 10) return { found: false, confidence: 0 }; // Prevent infinite recursion
            if (visited.has(currentGoal)) return { found: false, confidence: 0 };
            visited.add(currentGoal);

            // Check if goal is already a known fact
            if (this.facts.has(currentGoal)) {
                steps.push(`Found fact: ${currentGoal}`);
                return { 
                    found: true, 
                    confidence: this.uncertainties.get(currentGoal) || 1.0 
                };
            }

            // Try to find rules that conclude this goal
            for (const [ruleName, rule] of this.rules) {
                if (this.matchesConclusion(rule.conclusion, currentGoal)) {
                    steps.push(`Trying rule ${ruleName} for ${currentGoal}`);
                    
                    // Find what premises are needed
                    const requiredPremises = rule.pattern;
                    let allPremisesSatisfied = true;
                    let minConfidence = 1.0;

                    for (const premise of requiredPremises) {
                        const subResult = search(premise, depth + 1);
                        if (!subResult.found) {
                            allPremisesSatisfied = false;
                            break;
                        }
                        minConfidence = Math.min(minConfidence, subResult.confidence);
                    }

                    if (allPremisesSatisfied) {
                        const confidence = minConfidence * (rule.confidence || 1.0);
                        steps.push(`Satisfied ${ruleName}: ${currentGoal} (confidence: ${confidence.toFixed(2)})`);
                        return { found: true, confidence };
                    }
                }
            }

            return { found: false, confidence: 0 };
        };

        const result = search(goal);
        
        return {
            conclusion: goal,
            found: result.found,
            confidence: result.confidence,
            steps,
            method: 'backward_chaining'
        };
    }

    async abductiveReason(observation) {
        // Find best explanations for the observation
        const explanations = [];
        const steps = [`Finding explanations for: ${observation}`];

        // Look for rules where the observation could be a conclusion
        for (const [ruleName, rule] of this.rules) {
            if (this.matchesConclusion(rule.conclusion, observation)) {
                // The premises of this rule could explain the observation
                const explanation = {
                    rule: ruleName,
                    premises: rule.pattern,
                    confidence: rule.confidence || 1.0,
                    plausibility: this.assessPlausibility(rule.pattern)
                };
                
                explanations.push(explanation);
                steps.push(`Possible explanation via ${ruleName}: ${rule.pattern.join(', ')}`);
            }
        }

        // Also look for causal relationships
        const causalExplanations = this.findCausalExplanations(observation);
        explanations.push(...causalExplanations);

        // Rank explanations by plausibility and confidence
        explanations.sort((a, b) => (b.confidence * b.plausibility) - (a.confidence * a.plausibility));

        const bestExplanation = explanations[0];
        
        return {
            conclusion: bestExplanation ? `Best explanation: ${bestExplanation.premises.join(' & ')}` : 'No explanation found',
            found: explanations.length > 0,
            confidence: bestExplanation ? bestExplanation.confidence * bestExplanation.plausibility : 0,
            steps,
            explanations,
            method: 'abductive_reasoning'
        };
    }

    matchRule(rule, facts) {
        const matches = [];
        const pattern = rule.pattern;
        
        // Simple pattern matching - would need more sophisticated implementation
        // For now, just check if all pattern elements exist in facts
        for (const fact of facts) {
            const bindings = this.unify(pattern[0], fact);
            if (bindings && this.allPremisesSatisfied(pattern, facts, bindings)) {
                matches.push({ bindings, fact });
            }
        }
        
        return matches;
    }

    unify(pattern, fact) {
        // Simplified unification - real implementation would be more complex
        if (pattern === fact) return {};
        
        // Handle variables (start with ?)
        if (pattern.startsWith('?')) {
            const variable = pattern;
            return { [variable]: fact };
        }
        
        return null;
    }

    allPremisesSatisfied(pattern, facts, bindings) {
        // Check if all premises in the pattern are satisfied
        return pattern.every(premise => {
            const instantiated = this.instantiateConclusion(premise, bindings);
            return facts.has(instantiated) || facts.has(premise);
        });
    }

    instantiateConclusion(conclusion, bindings) {
        let result = conclusion;
        for (const [variable, value] of Object.entries(bindings)) {
            result = result.replace(variable, value);
        }
        return result;
    }

    calculateConfidence(rule, match, facts) {
        let baseConfidence = rule.confidence || 1.0;
        
        // Factor in confidence of premises
        if (rule.pattern) {
            const premiseConfidences = rule.pattern.map(p => {
                const instantiated = this.instantiateConclusion(p, match.bindings);
                return this.uncertainties.get(instantiated) || this.uncertainties.get(p) || 0.5;
            });
            
            // Use minimum confidence of premises
            const minPremiseConfidence = Math.min(...premiseConfidences);
            baseConfidence *= minPremiseConfidence;
        }
        
        // Adjust based on rule success rate
        baseConfidence *= rule.success_rate;
        
        return Math.max(0, Math.min(1, baseConfidence));
    }

    matchesConclusion(pattern, goal) {
        return pattern === goal || this.unify(pattern, goal) !== null;
    }

    entails(conclusion, goal) {
        // Simple entailment check - could be more sophisticated
        return conclusion === goal;
    }

    assessPlausibility(premises) {
        // Assess how plausible the premises are given current knowledge
        let plausibility = 1.0;
        
        for (const premise of premises) {
            if (this.facts.has(premise)) {
                plausibility *= 1.0; // Known fact
            } else if (this.facts.has(`¬${premise}`)) {
                plausibility *= 0.1; // Contradicted
            } else {
                plausibility *= 0.5; // Unknown
            }
        }
        
        return plausibility;
    }

    findCausalExplanations(observation) {
        // Look for potential causal relationships
        const explanations = [];
        
        // This would typically involve domain knowledge or learned causal models
        // For now, just basic pattern recognition
        if (observation.includes('effect')) {
            const cause = observation.replace('effect', 'cause');
            explanations.push({
                rule: 'causal_inference',
                premises: [cause],
                confidence: 0.6,
                plausibility: 0.7
            });
        }
        
        return explanations;
    }

    getReasoningStats() {
        const ruleStats = Array.from(this.rules.entries()).map(([name, rule]) => ({
            name,
            usage_count: rule.usage_count,
            success_rate: rule.success_rate,
            confidence: rule.confidence
        }));

        return {
            total_rules: this.rules.size,
            total_facts: this.facts.size,
            reasoning_sessions: this.reasoning_history.length,
            rule_statistics: ruleStats
        };
    }

    clear() {
        this.facts.clear();
        this.uncertainties.clear();
    }
}

module.exports = { ReasoningEngine };
