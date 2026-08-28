import type { NextFunction, Request, Response } from 'express';

import { beginOidcLogin, completeOidcLogin } from '@/auth/oidc';
import * as config from '@/config';
import {
  getCounter,
  getStaticFeatureFlags,
  setBusinessContext,
} from '@/utils/instrumentation';
import logger from '@/utils/logger';

const loginCounter = getCounter('hyperdx.auth.login', {
  description: 'Count of ClickStack login outcomes by authentication method',
});

export async function startOidcLogin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!config.OIDC_ENABLED) {
    res.sendStatus(404);
    return;
  }
  try {
    const location = await beginOidcLogin({
      sessionId: req.sessionID,
      returnTo: req.query.returnTo,
    });
    // saveUninitialized=false means the state/session binding would otherwise
    // have no browser cookie and the callback would receive a new session id.
    req.session.oidcPending = true;
    await saveSession(req);
    res.redirect(303, location.toString());
  } catch (error) {
    next(error);
  }
}

function login(req: Request, user: Express.User): Promise<void> {
  return new Promise((resolve, reject) => {
    req.login(user, error => (error ? reject(error) : resolve()));
  });
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save(error => (error ? reject(error) : resolve()));
  });
}

export async function finishOidcLogin(
  req: Request,
  res: Response,
): Promise<void> {
  if (!config.OIDC_ENABLED) {
    res.sendStatus(404);
    return;
  }
  try {
    const result = await completeOidcLogin({
      sessionId: req.sessionID,
      query: new URLSearchParams(
        Object.entries(req.query).flatMap(([key, value]) =>
          typeof value === 'string' ? [[key, value]] : [],
        ),
      ),
    });
    await login(req, result.user);
    req.session.oidcExpiresAt =
      Date.now() + config.OIDC_SESSION_MAX_AGE_SECONDS * 1000;
    req.session.cookie.maxAge = config.OIDC_SESSION_MAX_AGE_SECONDS * 1000;
    await saveSession(req);
    setBusinessContext({
      teamId: result.user.team.toString(),
      userId: result.user._id.toString(),
      email: result.user.email,
      'auth.method': 'oidc',
      ...getStaticFeatureFlags(),
    });
    loginCounter.add(1, { method: 'oidc', outcome: 'success' });
    res.redirect(303, `${config.FRONTEND_REDIRECT_BASE}${result.returnTo}`);
  } catch (error) {
    loginCounter.add(1, { method: 'oidc', outcome: 'error' });
    logger.warn({ err: error }, 'OIDC login rejected');
    res.redirect(303, `${config.FRONTEND_REDIRECT_BASE}/login?err=oidc`);
  }
}
