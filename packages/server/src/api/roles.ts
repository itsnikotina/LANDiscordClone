import { Router, Request, Response } from 'express';
import { getDb, queryOne, queryAll, runWrite } from '../database/db';
import { authMiddleware } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

function hasManageRoles(userId: number, guildId: string): boolean {
  const guild = queryOne<{ owner_id: number }>('SELECT owner_id FROM guilds WHERE id = ?', [guildId]);
  if (guild && guild.owner_id === userId) return true;
  return false;
}

/**
 * GET /guilds/:guildId/roles
 * List roles in guild.
 */
router.get('/', (req: Request, res: Response): void => {
  try {
    const { guildId } = req.params;
    const roles = queryAll('SELECT * FROM roles WHERE guild_id = ? ORDER BY position DESC', [guildId]);
    res.json(roles);
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /guilds/:guildId/roles
 * Create a new role.
 */
router.post('/', (req: Request, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const { guildId } = req.params;
    const { name, color, permissions, hoist } = req.body;

    if (!hasManageRoles(userId, String(guildId))) {
      res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
      return;
    }

    const roleId = uuidv4();
    
    const maxPosRes = queryOne<{ maxPos: number | null }>('SELECT MAX(position) as maxPos FROM roles WHERE guild_id = ?', [guildId]);
    const position = (maxPosRes?.maxPos || 0) + 1;

    runWrite(`
      INSERT INTO roles (id, guild_id, name, color, permissions, hoist, position)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [roleId, guildId, name || 'new role', color || '#99AAB5', permissions || 0, hoist ? 1 : 0, position]);

    const newRole = queryOne('SELECT * FROM roles WHERE id = ?', [roleId]);
    res.status(201).json(newRole);
  } catch (error) {
    console.error('Error creating role:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /guilds/:guildId/roles/:roleId
 * Update an existing role.
 */
router.put('/:roleId', (req: Request, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const { guildId, roleId } = req.params;
    const { name, color, permissions, hoist, position } = req.body;

    if (!hasManageRoles(userId, String(guildId))) {
      res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
      return;
    }

    runWrite(`
      UPDATE roles
      SET name = COALESCE(?, name),
          color = COALESCE(?, color),
          permissions = COALESCE(?, permissions),
          hoist = COALESCE(?, hoist),
          position = COALESCE(?, position)
      WHERE id = ? AND guild_id = ?
    `, [name, color, permissions, hoist, position, roleId, guildId]);

    const updatedRole = queryOne('SELECT * FROM roles WHERE id = ?', [roleId]);
    res.json(updatedRole);
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /guilds/:guildId/roles/:roleId
 * Delete a role.
 */
router.delete('/:roleId', (req: Request, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const { guildId, roleId } = req.params;

    if (!hasManageRoles(userId, String(guildId))) {
      res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
      return;
    }

    runWrite('DELETE FROM roles WHERE id = ? AND guild_id = ?', [roleId, guildId]);
    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /guilds/:guildId/members/:targetUserId/roles
 * Assign roles to a member. Expects body.roles to be an array of role IDs.
 */
router.put('/members/:targetUserId/roles', (req: Request, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const { guildId, targetUserId } = req.params;
    const { roles } = req.body;

    if (!Array.isArray(roles)) {
      res.status(400).json({ error: 'Roles must be an array of role IDs' });
      return;
    }

    if (!hasManageRoles(userId, String(guildId))) {
      res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
      return;
    }

    const db = getDb();
    
    db.run('BEGIN');
    try {
      // Clear existing roles
      runWrite('DELETE FROM member_roles WHERE guild_id = ? AND user_id = ?', [guildId, targetUserId]);
      
      // Insert new roles
      for (const roleId of roles) {
        runWrite('INSERT INTO member_roles (guild_id, user_id, role_id) VALUES (?, ?, ?)', [guildId, targetUserId, roleId]);
      }
      db.run('COMMIT');
    } catch(e) {
      db.run('ROLLBACK');
      throw e;
    }

    res.json({ message: 'Roles updated successfully' });
  } catch (error) {
    console.error('Error assigning roles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
