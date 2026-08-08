import { Router, Request, Response } from 'express';
import { getDb, Permission, queryOne, queryAll, runWrite } from '../database/db';
import { authMiddleware } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

/**
 * Utility function to check if user has MANAGE_CHANNELS permission in guild.
 * A complete implementation would resolve role permissions. This is a simplified check.
 */
function hasManageChannels(userId: number, guildId: string): boolean {
  const guild = queryOne<{ owner_id: number }>('SELECT owner_id FROM guilds WHERE id = ?', [guildId]);
  if (guild && guild.owner_id === userId) return true;
  // TODO: Add complex role-based permission resolution here if required
  return false;
}

/**
 * GET /guilds/:guildId/channels
 * List all channels in the guild.
 */
router.get('/', (req: Request, res: Response): void => {
  try {
    const { guildId } = req.params;
    const channels = queryAll('SELECT * FROM channels WHERE guild_id = ? ORDER BY position', [guildId]);
    res.json(channels);
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /guilds/:guildId/channels
 * Create a channel in the guild.
 */
router.post('/', (req: Request, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const { guildId } = req.params;
    const { name, type, categoryId, topic } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Channel name is required' });
      return;
    }

    if (!hasManageChannels(userId, String(guildId))) {
      res.status(403).json({ error: 'Missing MANAGE_CHANNELS permission' });
      return;
    }

    const channelId = uuidv4();
    
    // Get max position
    const maxPosRes = queryOne<{ maxPos: number | null }>('SELECT MAX(position) as maxPos FROM channels WHERE guild_id = ?', [guildId]);
    const position = (maxPosRes?.maxPos || 0) + 1;

    runWrite(`
      INSERT INTO channels (id, guild_id, category_id, name, type, topic, position)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [channelId, guildId, categoryId || null, name, type || 'TEXT', topic || null, position]);

    const newChannel = queryOne('SELECT * FROM channels WHERE id = ?', [channelId]);
    res.status(201).json(newChannel);
  } catch (error) {
    console.error('Error creating channel:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /guilds/:guildId/channels/:channelId
 * Update a channel.
 */
router.put('/:channelId', (req: Request, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const { guildId, channelId } = req.params;
    const { name, topic, position, categoryId } = req.body;

    if (!hasManageChannels(userId, String(guildId))) {
      res.status(403).json({ error: 'Missing MANAGE_CHANNELS permission' });
      return;
    }

    runWrite(`
      UPDATE channels
      SET name = COALESCE(?, name),
          topic = COALESCE(?, topic),
          position = COALESCE(?, position),
          category_id = COALESCE(?, category_id)
      WHERE id = ? AND guild_id = ?
    `, [name, topic, position, categoryId, channelId, guildId]);

    const updatedChannel = queryOne('SELECT * FROM channels WHERE id = ?', [channelId]);
    res.json(updatedChannel);
  } catch (error) {
    console.error('Error updating channel:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /guilds/:guildId/channels/:channelId
 * Delete a channel.
 */
router.delete('/:channelId', (req: Request, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const { guildId, channelId } = req.params;

    if (!hasManageChannels(userId, String(guildId))) {
      res.status(403).json({ error: 'Missing MANAGE_CHANNELS permission' });
      return;
    }

    runWrite('DELETE FROM channels WHERE id = ? AND guild_id = ?', [channelId, guildId]);
    res.json({ message: 'Channel deleted successfully' });
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
