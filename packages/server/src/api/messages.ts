import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { queryOne, queryAll, runWrite, getDb } from '../database/db';
import { authMiddleware } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { broadcastMessageCreate, broadcastMessageUpdate, broadcastMessageDelete } from '../gateway/socket';
import { config } from '../config';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

interface MessageRow {
  id: string;
  channel_id: string;
  author_id: number;
  content: string;
  attachments: string;
  created_at: number;
  edited_at: number | null;
  author_username: string | null;
  author_avatar_color: string | null;
}

/** Shapes a raw joined SQL row into the nested-author message shape the client expects. */
function serializeMessage(row: MessageRow) {
  return {
    id: row.id,
    channelId: row.channel_id,
    authorId: row.author_id,
    author: {
      id: row.author_id,
      username: row.author_username,
      avatarColor: row.author_avatar_color,
    },
    content: row.content,
    attachments: JSON.parse(row.attachments || '[]'),
    createdAt: row.created_at,
    editedAt: row.edited_at,
  };
}

/**
 * Helper to get messages with author info.
 */
function getMessagesWithAuthors(channelId: string, limit = 50) {
  const rows = queryAll<MessageRow>(`
    SELECT m.*, 
           u.username as author_username, 
           u.avatar_color as author_avatar_color
    FROM messages m
    LEFT JOIN users u ON m.author_id = u.id
    WHERE m.channel_id = ?
    ORDER BY m.created_at DESC
    LIMIT ?
  `, [channelId, limit]).reverse(); // Return in chronological order
  return rows.map(serializeMessage);
}

const ALLOWED_ATTACHMENT_MIME_PREFIXES = ['image/', 'video/'];

const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: config.maxFileSize },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_ATTACHMENT_MIME_PREFIXES.some((prefix) => file.mimetype.startsWith(prefix))) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'));
    }
  },
});

/**
 * GET /channels/:channelId/messages
 * List last 50 messages.
 */
router.get('/:channelId/messages', (req: Request, res: Response): void => {
  try {
    const { channelId } = req.params;
    const messages = getMessagesWithAuthors(String(channelId));
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /channels/:channelId/messages
 * Create a new message and broadcast it.
 */
router.post('/:channelId/messages', (req: Request, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const { channelId } = req.params;
    const { content, attachments } = req.body;

    if (!content && (!Array.isArray(attachments) || attachments.length === 0)) {
      res.status(400).json({ error: 'Message content or an attachment is required' });
      return;
    }

    // Validate channel and get guild_id
    const channel = queryOne<{ guild_id: string }>('SELECT guild_id FROM channels WHERE id = ?', [channelId]);
    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    const messageId = uuidv4();
    const attachmentsStr = attachments ? JSON.stringify(attachments) : '[]';

    runWrite(`
      INSERT INTO messages (id, channel_id, author_id, content, attachments)
      VALUES (?, ?, ?, ?, ?)
    `, [messageId, channelId, userId, content || '', attachmentsStr]);

    // Fetch full message with author info to broadcast
    const row = queryOne<MessageRow>(`
      SELECT m.*, u.username as author_username, u.avatar_color as author_avatar_color
      FROM messages m
      LEFT JOIN users u ON m.author_id = u.id
      WHERE m.id = ?
    `, [messageId]);

    if (!row) {
      res.status(500).json({ error: 'Failed to load created message' });
      return;
    }

    const message = serializeMessage(row);
    broadcastMessageCreate(channel.guild_id, message);

    res.status(201).json(message);
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /channels/:channelId/messages/:messageId
 * Edit own message.
 */
router.put('/:channelId/messages/:messageId', (req: Request, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const { channelId, messageId } = req.params;
    const { content } = req.body;

    const msg = queryOne<{ author_id: number }>('SELECT author_id FROM messages WHERE id = ?', [messageId]);
    
    if (!msg) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    if (msg.author_id !== userId) {
      res.status(403).json({ error: 'Can only edit own messages' });
      return;
    }

    runWrite(`
      UPDATE messages 
      SET content = ?, edited_at = (unixepoch())
      WHERE id = ?
    `, [content, messageId]);

    const updatedRow = queryOne<MessageRow>(`
      SELECT m.*, u.username as author_username, u.avatar_color as author_avatar_color
      FROM messages m
      LEFT JOIN users u ON m.author_id = u.id
      WHERE m.id = ?
    `, [messageId]);

    if (!updatedRow) {
      res.status(500).json({ error: 'Failed to load updated message' });
      return;
    }

    const message = serializeMessage(updatedRow);
    const channel = queryOne<{ guild_id: string }>('SELECT guild_id FROM channels WHERE id = ?', [channelId]);
    if (channel) {
      broadcastMessageUpdate(channel.guild_id, message);
    }

    res.json(message);
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /channels/:channelId/messages/:messageId
 * Delete own message. (Manage messages permission not fully implemented here yet).
 */
router.delete('/:channelId/messages/:messageId', (req: Request, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const { channelId, messageId } = req.params;

    const msg = queryOne<{ author_id: number }>('SELECT author_id FROM messages WHERE id = ?', [messageId]);
    
    if (!msg) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    // Simplified auth check: only author can delete for now
    if (msg.author_id !== userId) {
      res.status(403).json({ error: 'Unauthorized to delete this message' });
      return;
    }

    runWrite('DELETE FROM messages WHERE id = ?', [messageId]);

    const channel = queryOne<{ guild_id: string }>('SELECT guild_id FROM channels WHERE id = ?', [channelId]);
    if (channel) {
      broadcastMessageDelete(channel.guild_id, String(channelId), String(messageId));
    }

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /channels/:channelId/upload
 * Uploads a single image/video attachment (max config.maxFileSize, default 20MB).
 * Returns the public URL to include in a message's `attachments` array.
 */
router.post('/:channelId/upload', (req: Request, res: Response): void => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `File exceeds the ${Math.round(config.maxFileSize / (1024 * 1024))}MB limit`
        : err.message || 'Upload failed';
      res.status(400).json({ error: message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });
  });
});

export default router;
