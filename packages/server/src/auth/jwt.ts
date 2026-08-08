import jwt from 'jsonwebtoken';
import { config } from '../config';

/**
 * Represents the payload embedded within the JWT.
 */
export interface JwtPayload {
  userId: number;
  username: string;
}

/**
 * Signs a JSON Web Token for an authenticated user.
 * The token expires in 7 days.
 * 
 * @param userId The ID of the authenticated user.
 * @param username The username of the authenticated user.
 * @returns The signed JWT string.
 */
export function signToken(userId: number, username: string): string {
  const payload: JwtPayload = { userId, username };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

/**
 * Verifies a given JSON Web Token.
 * 
 * @param token The JWT string to verify.
 * @returns The decoded payload if valid, otherwise null.
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    if (decoded && typeof decoded === 'object' && 'userId' in decoded && 'username' in decoded) {
      return {
        userId: decoded.userId as number,
        username: decoded.username as string,
      };
    }
    return null;
  } catch (err) {
    return null;
  }
}
