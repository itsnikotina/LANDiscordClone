import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../auth/jwt';
import { queryOne } from '../database/db';

// Declaration merging to add 'user' to Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Express middleware to authenticate requests using JWT.
 * Validates the Authorization header and attaches the user payload to req.user.
 * 
 * @param req Express Request
 * @param res Express Response
 * @param next Express NextFunction
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header missing or invalid format' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // A validly-signed token can still reference a userId that no longer (or never
  // really did) exist - e.g. a stale token cached client-side from a corrupted
  // registration. The WS gateway already checks this on IDENTIFY; REST didn't,
  // letting requests through as a phantom user (shows as "Usuário Desconhecido").
  const user = queryOne<{ id: number }>('SELECT id FROM users WHERE id = ?', [decoded.userId]);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Attach decoded user payload to request
  req.user = decoded;
  next();
}
