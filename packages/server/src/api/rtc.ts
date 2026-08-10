import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { config } from '../config';

const router = Router();
router.use(authMiddleware);

/**
 * GET /rtc-config
 * TURN relay connection info, used by clients as an ICE fallback when direct P2P
 * fails (e.g. two peers on different VPNs with no shared network route).
 */
router.get('/', (req: Request, res: Response): void => {
  res.json({
    turnPort: config.turnPort,
    username: config.turnUsername,
    credential: config.turnPassword,
  });
});

export default router;
