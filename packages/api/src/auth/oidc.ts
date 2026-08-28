import mongoose from 'mongoose';

import * as config from '@/config';
import OidcTransaction from '@/models/oidcTransaction';
import Team from '@/models/team';
import User, { type UserDocument } from '@/models/user';
import { cacheSuccess } from '@/utils/cacheSuccess';

const REQUIRED_SCOPE = 'openid email profile';
const AUTH_TIME_SKEW_SECONDS = 60;
const AUTH_TIME_MAX_AGE_SECONDS = 300;

type OpenIdClient = typeof import('openid-client');
type ClientConfiguration = import('openid-client').Configuration;

const library = cacheSuccess<OpenIdClient>(() => import('openid-client'));

const relyingParty = cacheSuccess<ClientConfiguration>(async () => {
  const oidc = await library();
  return oidc.discovery(
    new URL(config.OIDC_ISSUER_URL),
    config.OIDC_CLIENT_ID,
    { redirect_uris: [config.OIDC_REDIRECT_URI] },
    oidc.ClientSecretBasic(config.OIDC_CLIENT_SECRET),
  );
});

export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return '/';
  }
  if (value.includes('\\')) return '/';
  try {
    const origin = 'https://return.invalid';
    const parsed = new URL(value, origin);
    return parsed.origin === origin
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : '/';
  } catch {
    return '/';
  }
}

export async function beginOidcLogin(args: {
  sessionId: string;
  returnTo: unknown;
}): Promise<URL> {
  const oidc = await library();
  const verifier = oidc.randomPKCECodeVerifier();
  const transaction = {
    state: oidc.randomState(),
    sessionId: args.sessionId,
    codeVerifier: verifier,
    nonce: oidc.randomNonce(),
    returnTo: safeReturnTo(args.returnTo),
    expiresAt: new Date(
      Date.now() + config.OIDC_TRANSACTION_TTL_SECONDS * 1000,
    ),
  };
  await OidcTransaction.create(transaction);
  const codeChallenge = await oidc.calculatePKCECodeChallenge(verifier);
  return oidc.buildAuthorizationUrl(await relyingParty(), {
    redirect_uri: config.OIDC_REDIRECT_URI,
    response_type: 'code',
    scope: REQUIRED_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: transaction.state,
    nonce: transaction.nonce,
    prompt: 'login',
    max_age: '0',
  });
}

function assertIdentity(identity: Record<string, unknown>): {
  email: string;
  name: string;
} {
  if (identity.email_verified !== true || typeof identity.email !== 'string') {
    throw new Error('OIDC identity must have a verified email');
  }
  const email = identity.email.toLowerCase();
  if (identity.email !== email || !email.endsWith('@taicor.ai')) {
    throw new Error('OIDC identity is outside the exact Taicor domain');
  }
  const name = typeof identity.name === 'string' ? identity.name : email;
  return { email, name };
}

function assertFreshAuthTime(value: unknown): void {
  if (typeof value !== 'number') throw new Error('OIDC auth_time is required');
  const age = Math.floor(Date.now() / 1000) - value;
  if (age < -AUTH_TIME_SKEW_SECONDS || age > AUTH_TIME_MAX_AGE_SECONDS) {
    throw new Error('OIDC authentication is not fresh');
  }
}

export async function ensureOidcUser(identity: {
  email: string;
  name: string;
}): Promise<UserDocument> {
  const teams = await Team.find({}).limit(2);
  if (teams.length !== 1 || !teams[0]) {
    throw new Error(
      'ClickStack must contain exactly one team before OIDC login',
    );
  }
  const canonicalEmail = identity.email.toLowerCase();
  const escaped = canonicalEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const candidates = await User.find({
    email: { $regex: `^${escaped}$`, $options: 'i' },
  });
  if (
    candidates.length > 1 ||
    candidates.some(user => user.email !== canonicalEmail)
  ) {
    throw new Error('OIDC email has an ambiguous case-folded user mapping');
  }
  const existing = candidates[0];
  if (existing) {
    if (!existing.team || !existing.team.equals(teams[0]._id)) {
      throw new Error('OIDC user is associated with an unexpected team');
    }
    return existing;
  }

  try {
    return await new User({
      email: canonicalEmail,
      name: identity.name,
      team: teams[0]._id,
    }).save();
  } catch (error) {
    if (
      !(error instanceof mongoose.mongo.MongoServerError) ||
      error.code !== 11000
    ) {
      throw error;
    }
    const raced = await User.findOne({ email: canonicalEmail });
    if (!raced?.team || !raced.team.equals(teams[0]._id)) throw error;
    return raced;
  }
}

export async function completeOidcLogin(args: {
  sessionId: string;
  query: URLSearchParams;
}): Promise<{ user: UserDocument; returnTo: string }> {
  const state = args.query.get('state');
  if (!state) throw new Error('OIDC state is required');
  const transaction = await OidcTransaction.findOneAndDelete({
    state,
    sessionId: args.sessionId,
    expiresAt: { $gt: new Date() },
  });
  if (!transaction) throw new Error('OIDC transaction is invalid or consumed');

  const oidc = await library();
  const currentUrl = new URL(config.OIDC_REDIRECT_URI);
  currentUrl.search = args.query.toString();
  const tokens = await oidc.authorizationCodeGrant(
    await relyingParty(),
    currentUrl,
    {
      pkceCodeVerifier: transaction.codeVerifier,
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      idTokenExpected: true,
    },
  );
  const claims = tokens.claims();
  if (!claims?.sub || !tokens.access_token) {
    throw new Error('OIDC response is missing required identity tokens');
  }
  assertFreshAuthTime(claims.auth_time);
  const userinfo = await oidc.fetchUserInfo(
    await relyingParty(),
    tokens.access_token,
    claims.sub,
  );
  const user = await ensureOidcUser(assertIdentity(userinfo));
  return { user, returnTo: transaction.returnTo };
}
