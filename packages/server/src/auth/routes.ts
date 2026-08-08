import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { queryOne, queryAll, runWrite } from '../database/db';
import { signToken } from './jwt';
import { config } from '../config';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * POST /auth/register
 * Registers a new user with a unique nickname.
 * Requires the global server password to prevent unauthorized access.
 */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, serverPassword } = req.body as {
      username?: string;
      password?: string;
      serverPassword?: string;
    };

    if (!username || !password || !serverPassword) {
      res.status(400).json({ error: 'username, password, and serverPassword são obrigatórios' });
      return;
    }

    if (username.length < 2 || username.length > 32) {
      res.status(400).json({ error: 'Username deve ter entre 2 e 32 caracteres' });
      return;
    }

    if (serverPassword !== config.serverPassword) {
      res.status(401).json({ error: 'Senha do servidor incorreta' });
      return;
    }

    // Check if username already taken
    const existing = queryOne<{ id: number }>(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    if (existing) {
      res.status(409).json({ error: 'Este username já está em uso' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const radminIp = req.socket.remoteAddress ?? null;

    // Avatar colors pool (Discord-like)
    const avatarColors = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#3BA55D'];
    const avatarColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];

    runWrite(
      'INSERT INTO users (username, password_hash, avatar_color, radmin_ip) VALUES (?, ?, ?, ?)',
      [username, passwordHash, avatarColor, radminIp]
    );

    const newUser = queryOne<{ id: number }>(
      'SELECT last_insert_rowid() as id'
    );
    const userId = newUser!.id;

    // Auto-join the default 'General' guild if exists
    const defaultGuild = queryOne<{ id: string }>(
      "SELECT id FROM guilds WHERE name = 'General' LIMIT 1"
    );
    if (defaultGuild) {
      runWrite(
        'INSERT OR IGNORE INTO guild_members (guild_id, user_id) VALUES (?, ?)',
        [defaultGuild.id, userId]
      );
    }

    const token = signToken(userId, username);

    res.status(201).json({
      token,
      user: { id: userId, username, avatarColor, status: 'online' },
    });
  } catch (error) {
    console.error('[Auth] Register error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * POST /auth/login
 * Authenticates a user by nickname + password and returns a JWT.
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || !password) {
      res.status(400).json({ error: 'username e password são obrigatórios' });
      return;
    }

    const user = queryOne<{
      id: number;
      username: string;
      password_hash: string;
      avatar_color: string;
      status: string;
    }>('SELECT id, username, password_hash, avatar_color, status FROM users WHERE username = ?', [username]);

    if (!user) {
      res.status(401).json({ error: 'Username ou senha incorretos' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      res.status(401).json({ error: 'Username ou senha incorretos' });
      return;
    }

    // Update Radmin IP on login
    const radminIp = req.socket.remoteAddress ?? null;
    runWrite('UPDATE users SET radmin_ip = ?, status = ? WHERE id = ?', [radminIp, 'online', user.id]);

    const token = signToken(user.id, user.username);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        avatarColor: user.avatar_color,
        status: user.status,
      },
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * GET /auth/me
 * Returns the currently authenticated user's profile.
 */
router.get('/me', authMiddleware, (req: Request, res: Response): void => {
  try {
    const { userId } = req.user!;

    const user = queryOne<{
      id: number;
      username: string;
      avatar_color: string;
      status: string;
      radmin_ip: string | null;
      created_at: number;
    }>('SELECT id, username, avatar_color, status, radmin_ip, created_at FROM users WHERE id = ?', [userId]);

    if (!user) {
      res.status(401).json({ error: 'Usuário não encontrado ou foi deletado' });
      return;
    }

    res.json({
      id: user.id,
      username: user.username,
      avatarColor: user.avatar_color,
      status: user.status,
      radminIp: user.radmin_ip,
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error('[Auth] Me error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * POST /auth/logout
 * Sets user status to offline (JWT is stateless, client deletes token).
 */
router.post('/logout', authMiddleware, (req: Request, res: Response): void => {
  try {
    const { userId } = req.user!;
    runWrite('UPDATE users SET status = ? WHERE id = ?', ['invisible', userId]);
    res.json({ ok: true });
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;
