// src/claude/client.js
const Anthropic = require('@anthropic-ai/sdk');

class ClaudeClient {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }
    this.client = new Anthropic({ apiKey });
  }

  async chat(messages, memoryContext = []) {
    try {
      // Prepare system message with memory context
      let systemMessage = 'You are Claude, an AI assistant with access to persistent memory.';
      
      if (memoryContext.length > 0) {
        systemMessage += '\n\nRelevant memories:\n';
        memoryContext.forEach(memory => {
          systemMessage += `- ${memory.content} (context: ${memory.context || 'general'})\n`;
        });
      }

      const response = await this.client.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 4000,
        system: systemMessage,
        messages: messages
      });

      return response.content[0].text;
    } catch (error) {
      console.error('Claude API error:', error);
      throw error;
    }
  }

  async summarize(text, maxLength = 100) {
    try {
      const response = await this.client.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Please summarize the following text in ${maxLength} words or less:\n\n${text}`
        }]
      });

      return response.content[0].text;
    } catch (error) {
      console.error('Claude summarization error:', error);
      throw error;
    }
  }
}

module.exports = { ClaudeClient };