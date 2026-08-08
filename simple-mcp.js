#!/usr/bin/env node

/**
 * Minimal working MCP server for memory testing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple in-memory store (will persist to JSON file)
const MEMORY_FILE = path.join(__dirname, 'simple-memory.json');

let memory = {};
try {
  if (fs.existsSync(MEMORY_FILE)) {
    memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  }
} catch (e) {
  memory = {};
}

function saveMemory() {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

// MCP JSON-RPC handler
process.stdin.setEncoding('utf8');
process.stdin.on('data', (data) => {
  const lines = data.trim().split('\n');
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const message = JSON.parse(line);
      handleMessage(message);
    } catch (e) {
      sendResponse(null, null, { code: -32700, message: 'Parse error' });
    }
  }
});

function sendResponse(id, result, error = null) {
  const response = {
    jsonrpc: '2.0',
    id
  };
  
  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }
  
  console.log(JSON.stringify(response));
}

function handleMessage(message) {
  const { id, method, params } = message;
  
  switch (method) {
    case 'initialize':
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'simple-agi-memory',
          version: '1.0.0'
        }
      });
      break;
      
    case 'tools/list':
      sendResponse(id, {
        tools: [
          {
            name: 'remember',
            description: 'Store information in memory',
            inputSchema: {
              type: 'object',
              properties: {
                content: { type: 'string', description: 'Information to remember' },
                context: { type: 'string', description: 'Context/category' },
                importance: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' }
              },
              required: ['content']
            }
          },
          {
            name: 'recall',
            description: 'Retrieve information from memory',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'What to search for' },
                context: { type: 'string', description: 'Context/category to search in' }
              },
              required: ['query']
            }
          }
        ]
      });
      break;
      
    case 'tools/call':
      const { name, arguments: args } = params;
      
      if (name === 'remember') {
        const { content, context = 'general', importance = 'medium' } = args;
        const timestamp = new Date().toISOString();
        const id = Date.now().toString();
        
        if (!memory[context]) memory[context] = {};
        memory[context][id] = {
          content,
          importance,
          timestamp,
          id
        };
        
        saveMemory();
        
        sendResponse(message.id, {
          content: [{
            type: 'text',
            text: `Stored: ${content} (${importance} importance in ${context})`
          }]
        });
      } else if (name === 'recall') {
        const { query, context } = args;
        let results = [];
        
        const searchIn = context ? { [context]: memory[context] || {} } : memory;
        
        for (const [ctx, items] of Object.entries(searchIn)) {
          for (const [itemId, item] of Object.entries(items)) {
            if (item.content.toLowerCase().includes(query.toLowerCase()) || 
                ctx.toLowerCase().includes(query.toLowerCase())) {
              results.push(`[${ctx}] ${item.content} (${item.timestamp})`);
            }
          }
        }
        
        const responseText = results.length > 0 
          ? `Found ${results.length} memories:\n${results.join('\n')}`
          : `No memories found for: ${query}`;
          
        sendResponse(message.id, {
          content: [{
            type: 'text',
            text: responseText
          }]
        });
      } else {
        sendResponse(message.id, null, { 
          code: -32601, 
          message: `Unknown tool: ${name}` 
        });
      }
      break;
      
    default:
      sendResponse(id, null, { 
        code: -32601, 
        message: `Unknown method: ${method}` 
      });
  }
}

// Keep process alive
process.stdin.resume();