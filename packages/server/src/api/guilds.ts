import { Router, Request, Response } from 'express';
import { getDb, Permission, queryOne, queryAll, runWrite } from '../database/db';
import { authMiddleware } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
router.use(authMiddleware);

/**
 * GET /guilds
 * List guilds the authenticated user is a member of.
 */
router.get('/', (req: Request, res: Response): void => {
  try {
    const userId = req.user!.userId;
    
    const guilds = queryAll(`
      SELECT g.id, g.name, g.icon_color, g.owner_id, gm.joined_at
      FROM guilds g
      JOIN guild_members gm ON g.id = gm.guild_id
      WHERE gm.user_id = ?
    `, [userId]);

    res.json(guilds);
  } catch (error) {
    console.error('Error fetching guilds:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /guilds
 * Create a new guild. Auto-joins owner, creates @everyone role and default channels.
 */
router.post('/', (req: Request, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const { name, icon_color } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Guild name is required' });
      return;
    }

    const guildId = uuidv4();
    const inviteCode = uuidv4().slice(0, 8); // Simple 8-char invite code
    const roleId = uuidv4();
    const categoryId = uuidv4();
    const channelId = uuidv4();
    
    const db = getDb();
    
    console.log(`[Guild Create] Starting creation for user ${userId}, guild name: ${name}`);
    
    // Create Guild
    console.log(`[Guild Create] 1/5 - Inserting into guilds...`);
    runWrite(`
      INSERT INTO guilds (id, name, icon_color, owner_id, invite_code)
      VALUES (?, ?, ?, ?, ?)
    `, [guildId, name, icon_color || '#5865F2', userId, inviteCode]);

    // Join Owner
    console.log(`[Guild Create] 2/5 - Inserting into guild_members...`);
    runWrite(`
      INSERT INTO guild_members (guild_id, user_id)
      VALUES (?, ?)
    `, [guildId, userId]);

    // Create @everyone role
    console.log(`[Guild Create] 3/5 - Inserting into roles...`);
    const basePermissions = Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES | Permission.CONNECT_VOICE | Permission.SPEAK;
    runWrite(`
      INSERT INTO roles (id, guild_id, name, color, position, permissions)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [roleId, guildId, '@everyone', '#99AAB5', 0, Number(basePermissions)]);

    // Create a default category
    console.log(`[Guild Create] 4/5 - Inserting into categories...`);
    runWrite(`
      INSERT INTO categories (id, guild_id, name, position)
      VALUES (?, ?, ?, ?)
    `, [categoryId, guildId, 'Text Channels', 0]);

    // Create a default text channel
    console.log(`[Guild Create] 5/5 - Inserting into channels...`);
    runWrite(`
      INSERT INTO channels (id, guild_id, category_id, name, type, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [channelId, guildId, categoryId, 'general', 'TEXT', 0]);

    console.log(`[Guild Create] Finished SQL inserts. Fetching new guild...`);
    const newGuild = queryOne('SELECT * FROM guilds WHERE id = ?', [guildId]);
    
    // Fetch newly created nested data
    const categories = queryAll('SELECT * FROM categories WHERE guild_id = ? ORDER BY position', [guildId]);
    const channels = queryAll('SELECT * FROM channels WHERE guild_id = ? ORDER BY position', [guildId]);
    const roles = queryAll('SELECT * FROM roles WHERE guild_id = ? ORDER BY position', [guildId]);
    const members = queryAll(`
      SELECT m.user_id as userId, u.username, u.avatar_color as avatarColor, u.status 
      FROM guild_members m JOIN users u ON m.user_id = u.id WHERE m.guild_id = ?
    `, [guildId]);

    const formattedCategories = categories.map(c => ({
      ...c,
      channels: channels.filter(ch => ch.category_id === c.id)
    }));

    res.status(201).json({
      ...newGuild,
      categories: formattedCategories,
      channels: channels.filter(ch => !ch.category_id),
      roles,
      members
    });
  } catch (error: any) {
    console.error(`[Guild Create] FAILED WITH ERROR:`, error.message, error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /guilds/:guildId
 * Get full guild info (categories, channels, roles, members).
 */
router.get('/:guildId', (req: Request, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const { guildId } = req.params;

    // Verify membership
    const membership = queryOne('SELECT 1 FROM guild_members WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this guild' });
      return;
    }

    const guild = queryOne('SELECT * FROM guilds WHERE id = ?', [guildId]);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }

    const categories = queryAll('SELECT * FROM categories WHERE guild_id = ? ORDER BY position', [guildId]);
    const channels = queryAll('SELECT * FROM channels WHERE guild_id = ? ORDER BY position', [guildId]);
    const roles = queryAll('SELECT * FROM roles WHERE guild_id = ? ORDER BY position DESC', [guildId]);
    const members = queryAll(`
      SELECT u.id, u.username, u.avatar_color, u.status, gm.joined_at
      FROM users u
      JOIN guild_members gm ON u.id = gm.user_id
      WHERE gm.guild_id = ?
    `, [guildId]);

    res.json({
      ...guild,
      categories,
      channels,
      roles,
      members
    });
  } catch (error) {
    console.error('Error fetching guild:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /guilds/join
 * Join a guild by invite code (no need to already know the guild's id).
 */
router.post('/join', (req: Request, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const { inviteCode } = req.body;

    if (!inviteCode) {
      res.status(400).json({ error: 'inviteCode is required' });
      return;
    }

    const guild = queryOne<{ id: string }>('SELECT id FROM guilds WHERE invite_code = ?', [inviteCode]);
    if (!guild) {
      res.status(404).json({ error: 'Invalid invite code' });
      return;
    }

    const existing = queryOne('SELECT 1 FROM guild_members WHERE guild_id = ? AND user_id = ?', [guild.id, userId]);
    if (!existing) {
      runWrite('INSERT INTO guild_members (guild_id, user_id) VALUES (?, ?)', [guild.id, userId]);
    }

    const newGuild = queryOne('SELECT * FROM guilds WHERE id = ?', [guild.id]);
    const categories = queryAll('SELECT * FROM categories WHERE guild_id = ? ORDER BY position', [guild.id]);
    const channels = queryAll<{ category_id: string | null }>('SELECT * FROM channels WHERE guild_id = ? ORDER BY position', [guild.id]);
    const roles = queryAll('SELECT * FROM roles WHERE guild_id = ? ORDER BY position DESC', [guild.id]);
    const members = queryAll(`
      SELECT m.user_id as userId, u.username, u.avatar_color as avatarColor, u.status
      FROM guild_members m JOIN users u ON m.user_id = u.id WHERE m.guild_id = ?
    `, [guild.id]);

    const formattedCategories = categories.map(c => ({
      ...c,
      channels: channels.filter(ch => ch.category_id === (c as { id: string }).id)
    }));

    res.status(200).json({
      ...newGuild,
      categories: formattedCategories,
      channels: channels.filter(ch => !ch.category_id),
      roles,
      members
    });
  } catch (error) {
    console.error('Error joining guild:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /guilds/:guildId
 * Delete a guild (owner only).
 */
router.delete('/:guildId', (req: Request, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const { guildId } = req.params;

    const guild = queryOne<{ owner_id: number }>('SELECT owner_id FROM guilds WHERE id = ?', [guildId]);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }

    if (guild.owner_id !== userId) {
      res.status(403).json({ error: 'Only the owner can delete the guild' });
      return;
    }

    runWrite('DELETE FROM guilds WHERE id = ?', [guildId]);
    res.json({ message: 'Guild deleted successfully' });
  } catch (error) {
    console.error('Error deleting guild:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /guilds/:guildId
 * Update guild name/icon (owner only).
 */
router.put('/:guildId', (req: Request, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const { guildId } = req.params;
    const { name, icon_color } = req.body;

    const guild = queryOne<{ owner_id: number }>('SELECT owner_id FROM guilds WHERE id = ?', [guildId]);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }

    if (guild.owner_id !== userId) {
      res.status(403).json({ error: 'Only the owner can update the guild' });
      return;
    }

    runWrite(`
      UPDATE guilds 
      SET name = COALESCE(?, name), icon_color = COALESCE(?, icon_color)
      WHERE id = ?
    `, [name, icon_color, guildId]);

    const updatedGuild = queryOne('SELECT * FROM guilds WHERE id = ?', [guildId]);
    res.json(updatedGuild);
  } catch (error) {
    console.error('Error updating guild:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
