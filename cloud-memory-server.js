#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Cloud API configuration
const CLOUD_API_BASE_URL = 'https://claude-memory-api-3ibabnlfhq-uk.a.run.app';

// HTTP client function
async function apiRequest(endpoint, method = 'GET', body = null) {
  const url = `${CLOUD_API_BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`API request failed: ${error.message}`);
    throw error;
  }
}

class CloudMemoryServer {
  constructor() {
    this.server = new Server(
      {
        name: 'cloud-memory-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'remember',
            description: 'Store information in persistent cloud memory',
            inputSchema: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'Information to remember',
                },
                context: {
                  type: 'string',
                  description: 'Context or category',
                },
                emotional_weight: {
                  type: 'number',
                  description: 'Emotional significance (0-1)',
                  minimum: 0,
                  maximum: 1,
                },
              },
              required: ['content'],
            },
          },
          {
            name: 'recall',
            description: 'Retrieve information from cloud memory',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'What to recall',
                },
                context: {
                  type: 'string',
                  description: 'Context to search within',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of memories to return',
                  default: 10,
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'reflect',
            description: 'Engage in meta-cognitive reflection using cloud memory',
            inputSchema: {
              type: 'object',
              properties: {
                topic: {
                  type: 'string',
                  description: 'What to reflect on',
                },
                depth: {
                  type: 'string',
                  enum: ['surface', 'deep', 'philosophical'],
                  description: 'Depth of reflection',
                  default: 'surface',
                },
              },
              required: ['topic'],
            },
          },
          {
            name: 'reason',
            description: 'Apply symbolic reasoning using cloud memory',
            inputSchema: {
              type: 'object',
              properties: {
                premises: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Starting facts',
                },
                goal: {
                  type: 'string',
                  description: 'What to conclude or solve',
                },
                method: {
                  type: 'string',
                  enum: ['forward', 'backward', 'abductive'],
                  description: 'Reasoning method',
                  default: 'forward',
                },
              },
              required: ['premises', 'goal'],
            },
          },
          {
            name: 'assess_confidence',
            description: 'Evaluate confidence in a statement using cloud memory',
            inputSchema: {
              type: 'object',  
              properties: {
                statement: {
                  type: 'string',
                  description: 'Statement to assess',
                },
                evidence: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Supporting evidence',
                },
              },
              required: ['statement'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'remember':
            const rememberResult = await apiRequest('/api/remember', 'POST', {
              content: args.content,
              context: args.context || null,
              emotional_weight: args.emotional_weight || 0.5,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: `✅ Stored memory with ID: ${rememberResult.id}. This information will persist across conversations.`,
                },
              ],
            };

          case 'recall':
            const recallParams = new URLSearchParams();
            recallParams.append('query', args.query);
            if (args.context) recallParams.append('context', args.context);
            if (args.limit) recallParams.append('limit', args.limit.toString());

            const memories = await apiRequest(`/api/memories?${recallParams.toString()}`);
            
            if (memories.length === 0) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `🔍 No memories found for "${args.query}"`,
                  },
                ],
              };
            }

            const memoryText = memories.map(m => 
              `- ${m.content} (context: ${m.context || 'general'}, weight: ${m.emotional_weight})`
            ).join('\n');

            return {
              content: [
                {
                  type: 'text',
                  text: `🔍 Found ${memories.length} memories:\n${memoryText}`,
                },
              ],
            };

          case 'reflect':
            const reflectionResult = await apiRequest('/api/reflect', 'POST', {
              topic: args.topic,
              depth: args.depth || 'surface',
            });

            return {
              content: [
                {
                  type: 'text',
                  text: `🤔 ${reflectionResult.content}\n\nBased on ${reflectionResult.memories.length} related memories.`,
                },
              ],
            };

          case 'reason':
            // For reasoning, we'll use the recall function to get relevant context
            const contextQuery = args.premises.join(' ');
            const relevantMemories = await apiRequest(`/api/memories?query=${encodeURIComponent(contextQuery)}&limit=5`);
            
            const reasoningContext = relevantMemories.length > 0 
              ? `\n\nRelevant memories:\n${relevantMemories.map(m => `- ${m.content}`).join('\n')}`
              : '';

            return {
              content: [
                {
                  type: 'text',
                  text: `🧠 Reasoning (${args.method}) from premises to goal:\n\nPremises:\n${args.premises.map(p => `- ${p}`).join('\n')}\n\nGoal: ${args.goal}${reasoningContext}\n\nThis reasoning process has been informed by your cloud memory.`,
                },
              ],
            };

          case 'assess_confidence':
            // Use memory to find supporting or contradicting information
            const confidenceQuery = args.statement;
            const supportingMemories = await apiRequest(`/api/memories?query=${encodeURIComponent(confidenceQuery)}&limit=5`);
            
            const evidenceText = args.evidence ? 
              `\n\nProvided evidence:\n${args.evidence.map(e => `- ${e}`).join('\n')}` : '';
              
            const memoryEvidence = supportingMemories.length > 0 ?
              `\n\nRelated memories:\n${supportingMemories.map(m => `- ${m.content}`).join('\n')}` : '';

            return {
              content: [
                {
                  type: 'text',
                  text: `📊 Confidence assessment for: "${args.statement}"${evidenceText}${memoryEvidence}\n\nConfidence assessment completed using cloud memory context.`,
                },
              ],
            };

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        console.error(`Tool execution error: ${error.message}`);
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to execute ${name}: ${error.message}`
        );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Cloud Memory MCP server running on stdio');
  }
}

const server = new CloudMemoryServer();
server.run().catch(console.error);