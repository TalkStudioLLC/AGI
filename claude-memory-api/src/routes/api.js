// src/routes/api.js
const express = require('express');
const router = express.Router();

// POST /api/chat - Chat with memory persistence
router.post('/chat', async (req, res) => {
  try {
    const { messages, userId = null, sessionId = null, rememberResponse = true } = req.body;
    const { memoryManager, claudeClient } = req.app.locals;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Get relevant memories for context
    const lastMessage = messages[messages.length - 1];
    const memories = await memoryManager.recall(lastMessage.content, null, userId, 5);

    // Get Claude's response
    const response = await claudeClient.chat(messages, memories);

    // Store the conversation in memory if requested
    if (rememberResponse) {
      await memoryManager.remember(
        `User: ${lastMessage.content}`,
        'conversation',
        0.6,
        userId,
        sessionId
      );
      
      await memoryManager.remember(
        `Assistant: ${response}`,
        'conversation',
        0.6,
        userId,
        sessionId
      );
    }

    res.json({ 
      response,
      memories_used: memories.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/memories - List stored memories
router.get('/memories', async (req, res) => {
  try {
    const { query, context, userId, limit = 10 } = req.query;
    const { memoryManager } = req.app.locals;

    const memories = await memoryManager.recall(query, context, userId, parseInt(limit));
    
    res.json(memories);
  } catch (error) {
    console.error('Memories retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/remember - Store specific memory
router.post('/remember', async (req, res) => {
  try {
    const { content, context, emotional_weight = 0.5, userId, sessionId } = req.body;
    const { memoryManager } = req.app.locals;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const memory = await memoryManager.remember(
      content,
      context,
      emotional_weight,
      userId,
      sessionId
    );

    res.json(memory);
  } catch (error) {
    console.error('Remember error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/reflect - Perform reflection
router.post('/reflect', async (req, res) => {
  try {
    const { topic, depth = 'surface', userId } = req.body;
    const { memoryManager } = req.app.locals;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    const reflection = await memoryManager.reflect(topic, depth, userId);
    
    res.json(reflection);
  } catch (error) {
    console.error('Reflection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/stats - Get memory statistics
router.get('/stats', async (req, res) => {
  try {
    const { userId } = req.query;
    const { memoryManager } = req.app.locals;

    const stats = await memoryManager.getMemoryStats(userId);
    
    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;