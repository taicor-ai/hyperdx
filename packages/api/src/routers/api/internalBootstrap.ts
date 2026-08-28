import type { NextFunction, Request, RequestHandler, Response } from 'express';
import express from 'express';

import {
  getBootstrapStatus,
  requireInternalBootstrapToken,
  runInternalBootstrap,
} from '@/auth/internalBootstrap';

function asyncRoute(
  handler: (req: Request, res: Response) => Promise<unknown>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

const router = express.Router();
router.use(requireInternalBootstrapToken);
router.get('/status', asyncRoute(getBootstrapStatus));
router.post('/', asyncRoute(runInternalBootstrap));

export default router;
