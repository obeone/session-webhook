/**
 * Session.js Webhook Server
 * 
 * This server exposes webhook endpoints for Session.js operations and forwards
 * all Session events to an external webhook URL.
 * 
 * Features:
 * - POST /sendMessage - Send text messages via Session
 * - POST /sendAttachment - Send attachments via Session  
 * - POST /deleteMessage - Delete a message via Session
 * - POST /setDisplayName - Set the display name for the Session profile
 * - POST /setAvatar - Set the avatar for the Session profile
 * - POST /notifyScreenshot - Notify that a screenshot was taken
 * - POST /notifyMediaSaved - Notify that media was saved
 * - POST /addReaction - Add a reaction to a message
 * - POST /removeReaction - Remove a reaction from a message
 * - GET /status - Health check endpoint
 * - Forwards all Session events to external webhook
 * - Bearer token authentication via Authorization header
 */

import express from 'express';
import { Session, Poller, ready } from '@session.js/client';
import { FileKeyvalStorage } from '@session.js/file-keyval-storage';
import type { Request, Response, NextFunction } from 'express';
import winston from 'winston';

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Load environment variables
const config = {
  port: parseInt(process.env.PORT || '8080'),
  bearerToken: process.env.BEARER_TOKEN || 'your-secure-bearer-token-here',
  webhookUrl: process.env.WEBHOOK_URL || 'https://example.com/signal',
  sessionMnemonic: process.env.SESSION_MNEMONIC || '',
  sessionDisplayName: process.env.SESSION_DISPLAY_NAME || 'Session Webhook Bot',
  storageFile: process.env.STORAGE_FILE || './session-storage.db'
};

// Validate required configuration
if (!config.sessionMnemonic) {
  logger.error('FATAL: SESSION_MNEMONIC environment variable is required');
  process.exit(1);
}

// Initialize Express app
const app = express();
app.use(express.json({ limit: '50mb' })); // Increase limit for attachments

// Session instance (will be initialized after ready)
let session: Session;

/**
 * Middleware to verify Bearer token.
 * Checks the Authorization header for a valid Bearer token.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next middleware function
 */
function verifyBearerToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Bearer token is missing or malformed'
    });
    return;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  if (token !== config.bearerToken) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid Bearer token'
    });
    return;
  }

  next();
}

/**
 * Forward an event to the external webhook.
 * 
 * @param eventName - Name of the Session event
 * @param payload - Event data payload
 */
async function forwardToWebhook(eventName: string, payload: any): Promise<void> {
  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Session-Webhook-Server/1.0'
      },
      body: JSON.stringify({
        event: eventName,
        payload: payload,
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      logger.error(`Webhook forward failed with status ${response.status}: ${response.statusText}`);
    } else {
      logger.info(`Event '${eventName}' forwarded to webhook successfully`);
    }
  } catch (error) {
    logger.error(`Error forwarding event '${eventName}' to webhook: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Initialize Session.js instance and set up event listeners.
 */
async function initializeSession(): Promise<void> {
  await ready;
  
  // Create Session instance with file-based storage
  session = new Session({
    storage: new FileKeyvalStorage({
      filePath: config.storageFile
    })
  });
  
  // Set mnemonic and display name
  session.setMnemonic(config.sessionMnemonic, config.sessionDisplayName);
  
  // Add a poller to fetch messages every 3 seconds
  const poller = new Poller();
  session.addPoller(poller);

  logger.info(`Session initialized with ID: ${session.getSessionID()}`);
  logger.info('Poller added to fetch messages periodically.');

  // Set up event listeners for non-message events
  const events = [
    'syncDisplayName',
    'syncAvatar',
    'messageDeleted',
    'messageRead',
    'messageTypingIndicator',
    'screenshotTaken',
    'mediaSaved',
    'messageRequestApproved',
    'call',
    'reactionAdded',
    'reactionRemoved'
  ];
  
  // Register listeners for each event
  events.forEach(eventName => {
    session.on(eventName as any, async (data: any) => {
      logger.debug(`Received event '${eventName}' with payload:`, data);
      await forwardToWebhook(eventName, data);
    });
  });
  
  // The 'message' and 'syncMessage' events are handled by the poller,
  // which will also forward them to the webhook.
  session.on('message', (msg) => forwardToWebhook('message', msg));
  session.on('syncMessage', (msg) => forwardToWebhook('syncMessage', msg));

  logger.info(`Event listeners registered for: ${events.join(', ')}`);
}

// Routes

/**
 * GET /status
 * Health check endpoint.
 */
app.get('/status', (req: Request, res: Response) => {
  res.json({ 
    ok: true,
    sessionId: session ? session.getSessionID() : 'not initialized',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /sendMessage
 * Send a text message via Session.
 * 
 * Request body:
 * {
 *   "to": "recipient_session_id",
 *   "text": "message content"
 * }
 */
app.post('/sendMessage', verifyBearerToken, async (req: Request, res: Response) => {
  try {
    const { to, text } = req.body;
    
    // Validate input
    if (!to || !text) {
      res.status(400).json({ 
        error: 'Bad Request',
        message: 'Both "to" and "text" fields are required' 
      });
      return;
    }
    
    // Send message
    const result = await session.sendMessage({
      to,
      text
    });
    
    res.json({
      success: true,
      messageHash: result.messageHash,
      syncMessageHash: result.syncMessageHash,
      timestamp: result.timestamp
    });
    
  } catch (error) {
    logger.error(`Error sending message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to send message'
    });
  }
});

/**
 * POST /sendAttachment
 * Send an attachment via Session.
 * 
 * Request body:
 * {
 *   "to": "recipient_session_id",
 *   "filename": "file.jpg",
 *   "mimeType": "image/jpeg",
 *   "data": "base64_encoded_file_data"
 * }
 */
app.post('/sendAttachment', verifyBearerToken, async (req: Request, res: Response) => {
  try {
    const { to, filename, mimeType, data } = req.body;
    
    // Validate input
    if (!to || !filename || !mimeType || !data) {
      res.status(400).json({ 
        error: 'Bad Request',
        message: 'All fields (to, filename, mimeType, data) are required' 
      });
      return;
    }
    
    // Convert base64 to Buffer
    const buffer = Buffer.from(data, 'base64');
    
    // Create File object
    const file = new File([buffer], filename, { type: mimeType });
    
    // Send attachment
    const result = await session.sendMessage({
      to,
      attachments: [file]
    });
    
    res.json({
      success: true,
      messageHash: result.messageHash,
      syncMessageHash: result.syncMessageHash,
      timestamp: result.timestamp
    });
    
  } catch (error) {
    logger.error(`Error sending attachment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to send attachment'
    });
  }
});

/**
 * POST /deleteMessage
 * Delete a message.
 *
 * Request body:
 * {
 *   "to": "recipient_session_id",
 *   "timestamp": 1234567890,
 *   "hash": "message_hash"
 * }
 */
app.post('/deleteMessage', verifyBearerToken, async (req: Request, res: Response) => {
  try {
    const { to, timestamp, hash } = req.body;

    if (!to || !timestamp || !hash) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '"to", "timestamp", and "hash" fields are required',
      });
    }

    await session.deleteMessage({ to, timestamp, hash });

    res.json({ success: true, message: 'Message deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to delete message',
    });
  }
});

/**
 * POST /markAsRead
 * Mark a message as read.
 *
 * Request body:
 * {
 *   "to": "recipient_session_id",
 *   "timestamp": 1234567890
 * }
 */
/*
app.post('/markAsRead', verifyApiKey, async (req: Request, res: Response) => {
  try {
    const { to, timestamp } = req.body;

    if (!to || !timestamp) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '"to" and "timestamp" fields are required',
      });
    }

    await session.markAsRead({ to, timestamp });

    res.json({ success: true, message: 'Message marked as read' });
  } catch (error) {
    logger.error(`Error marking message as read: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to mark message as read',
    });
  }
});
*/

/**
 * POST /setDisplayName
 * Set the display name for the Session profile.
 *
 * Request body:
 * {
 *   "displayName": "New Display Name"
 * }
 */
app.post('/setDisplayName', verifyBearerToken, async (req: Request, res: Response) => {
  try {
    const { displayName } = req.body;

    if (!displayName) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '"displayName" field is required',
      });
    }

    await session.setDisplayName(displayName);

    res.json({ success: true, message: 'Display name updated successfully' });
  } catch (error) {
    logger.error(`Error setting display name: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to set display name',
    });
  }
});

/**
 * POST /setAvatar
 * Set the avatar for the Session profile.
 *
 * Request body:
 * {
 *   "avatar": "base64_encoded_image_data"
 * }
 */
app.post('/setAvatar', verifyBearerToken, async (req: Request, res: Response) => {
  try {
    const { avatar } = req.body;

    if (!avatar) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '"avatar" field is required',
      });
    }

    const buffer = Buffer.from(avatar, 'base64');
    const arrayBuffer = new Uint8Array(buffer).buffer;
    await session.setAvatar(arrayBuffer);

    res.json({ success: true, message: 'Avatar updated successfully' });
  } catch (error) {
    logger.error(`Error setting avatar: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to set avatar',
    });
  }
});

/**
 * POST /showTyping
 * Show typing indicator to a recipient.
 *
 * Request body:
 * {
 *   "to": "recipient_session_id"
 * }
 */
/*
app.post('/showTyping', verifyApiKey, async (req: Request, res: Response) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '"to" field is required',
      });
    }

    await session.showTyping(to);

    res.json({ success: true, message: 'Typing indicator shown' });
  } catch (error) {
    logger.error(`Error showing typing indicator: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to show typing indicator',
    });
  }
});
*/

/**
 * POST /hideTyping
 * Hide typing indicator from a recipient.
 *
 * Request body:
 * {
 *   "to": "recipient_session_id"
 * }
 */
/*
app.post('/hideTyping', verifyApiKey, async (req: Request, res: Response) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '"to" field is required',
      });
    }

    await session.hideTyping(to);

    res.json({ success: true, message: 'Typing indicator hidden' });
  } catch (error) {
    logger.error(`Error hiding typing indicator: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to hide typing indicator',
    });
  }
});
*/

/**
 * POST /acceptRequest
 * Accept a conversation request.
 *
 * Request body:
 * {
 *   "to": "recipient_session_id"
 * }
 */
/*
app.post('/acceptRequest', verifyApiKey, async (req: Request, res: Response) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '"to" field is required',
      });
    }

    await session.acceptRequest(to);

    res.json({ success: true, message: 'Conversation request accepted' });
  } catch (error) {
    logger.error(`Error accepting request: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to accept request',
    });
  }
});
*/

/**
 * POST /notifyScreenshot
 * Notify that a screenshot was taken.
 *
 * Request body:
 * {
 *   "to": "recipient_session_id",
 *   "timestamp": 1234567890
 * }
 */
app.post('/notifyScreenshot', verifyBearerToken, async (req: Request, res: Response) => {
  try {
    const { to, timestamp } = req.body;

    if (!to) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '"to" field is required',
      });
    }

    await session.notifyScreenshotTaken({ conversation: to });

    res.json({ success: true, message: 'Screenshot notification sent' });
  } catch (error) {
    logger.error(`Error sending screenshot notification: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to send screenshot notification',
    });
  }
});

/**
 * POST /notifyMediaSaved
 * Notify that media was saved.
 *
 * Request body:
 * {
 *   "to": "recipient_session_id",
 *   "timestamp": 1234567890
 * }
 */
app.post('/notifyMediaSaved', verifyBearerToken, async (req: Request, res: Response) => {
  try {
    const { to, timestamp } = req.body;

    if (!to || !timestamp) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '"to" and "timestamp" fields are required',
      });
    }

    await session.notifyMediaSaved({ conversation: to, savedMessageTimestamp: timestamp });

    res.json({ success: true, message: 'Media saved notification sent' });
  } catch (error) {
    logger.error(`Error sending media saved notification: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to send media saved notification',
    });
  }
});

/**
 * POST /addReaction
 * Add a reaction to a message.
 *
 * Request body:
 * {
 *   "to": "recipient_session_id",
 *   "timestamp": 1234567890,
 *   "emoji": "👍",
 *   "author": "author_session_id"
 * }
 */
app.post('/addReaction', verifyBearerToken, async (req: Request, res: Response) => {
  try {
    const { to, timestamp, emoji, author } = req.body;

    if (!to || !timestamp || !emoji || !author) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '"to", "timestamp", "emoji", and "author" fields are required',
      });
    }

    await session.addReaction({ messageTimestamp: timestamp, emoji, messageAuthor: author });

    res.json({ success: true, message: 'Reaction added' });
  } catch (error) {
    logger.error(`Error adding reaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to add reaction',
    });
  }
});

/**
 * POST /removeReaction
 * Remove a reaction from a message.
 *
 * Request body:
 * {
 *   "to": "recipient_session_id",
 *   "timestamp": 1234567890,
 *   "emoji": "👍",
 *   "author": "author_session_id"
 * }
 */
app.post('/removeReaction', verifyBearerToken, async (req: Request, res: Response) => {
  try {
    const { to, timestamp, emoji, author } = req.body;

    if (!to || !timestamp || !emoji || !author) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '"to", "timestamp", "emoji", and "author" fields are required',
      });
    }

    await session.removeReaction({ messageTimestamp: timestamp, emoji, messageAuthor: author });

    res.json({ success: true, message: 'Reaction removed' });
  } catch (error) {
    logger.error(`Error removing reaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to remove reaction',
    });
  }
});

// 404 handler for undefined routes
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error(`Unhandled error on ${req.method} ${req.path}: ${err.stack || err.message}`);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred' 
  });
});

/**
 * Start the server.
 */
async function startServer(): Promise<void> {
  try {
    // Initialize Session first
    await initializeSession();
    
    // Start Express server
    app.listen(config.port, () => {
      logger.info(`Server listening on port ${config.port}`);
      logger.info(`Forwarding Session events to: ${config.webhookUrl}`);
      logger.info('Available endpoints:');
      logger.info('  GET  /status');
      logger.info('  POST /sendMessage');
      logger.info('  POST /sendAttachment');
      logger.info('  POST /deleteMessage');
      logger.info('  POST /setDisplayName');
      logger.info('  POST /setAvatar');
      logger.info('  POST /notifyScreenshot');
      logger.info('  POST /notifyMediaSaved');
      logger.info('  POST /addReaction');
      logger.info('  POST /removeReaction');
    });
    
  } catch (error) {
    logger.error(`Failed to start server: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

// Start the server
startServer();
