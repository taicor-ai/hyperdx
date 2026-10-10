import crypto from 'crypto';

const env = process.env;

// DEFAULTS
const DEFAULT_APP_TYPE = 'api';
const DEFAULT_FRONTEND_URL = env.HYPERDX_APP_PORT
  ? `http://localhost:${env.HYPERDX_APP_PORT}`
  : '';

export const NODE_ENV = env.NODE_ENV as string;

export const APP_TYPE = (env.APP_TYPE || DEFAULT_APP_TYPE) as
  | 'api'
  | 'scheduled-task';
export const CODE_VERSION = env.CODE_VERSION ?? '';
// Only for single container local deployments, disable authentication
export const IS_LOCAL_APP_MODE =
  env.IS_LOCAL_APP_MODE === 'DANGEROUSLY_is_local_app_mode💀';
const LEGACY_PUBLIC_SESSION_SECRET = 'hyperdx is cool 👋';
// Authenticated deployments never use the public demo secret. Without a safe
// configured value, generate one per process (sessions end on restart).
export const IS_EXPRESS_SESSION_SECRET_GENERATED =
  !env.EXPRESS_SESSION_SECRET ||
  (!IS_LOCAL_APP_MODE &&
    env.EXPRESS_SESSION_SECRET === LEGACY_PUBLIC_SESSION_SECRET);
export const EXPRESS_SESSION_SECRET =
  !IS_EXPRESS_SESSION_SECRET_GENERATED && env.EXPRESS_SESSION_SECRET
    ? env.EXPRESS_SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');
export const FRONTEND_URL = (env.FRONTEND_URL ||
  DEFAULT_FRONTEND_URL) as string;
const HYPERDX_IMAGE = env.HYPERDX_IMAGE;
export const IS_APP_IMAGE = HYPERDX_IMAGE === 'hyperdx';
export const IS_ALL_IN_ONE_IMAGE = HYPERDX_IMAGE === 'all-in-one-auth';
export const IS_LOCAL_IMAGE = HYPERDX_IMAGE === 'all-in-one-noauth';
// On Vercel preview deployments the API is inlined into the Next.js app and
// shares its origin, so we emit relative redirects (FRONTEND_URL there points
// at the production host). Everywhere else the API and app run on separate
// hosts, so absolute URLs anchored at FRONTEND_URL are required.
export const IS_INLINE_API = env.HDX_PREVIEW_INLINE_API === 'true';
export const FRONTEND_REDIRECT_BASE = IS_INLINE_API ? '' : FRONTEND_URL;
export const INGESTION_API_KEY = env.INGESTION_API_KEY ?? '';
// Opt-in: emit the contrib `datadogreceiver` on the collector so a
// Datadog Agent can ship APM traces (DD trace API -> OTLP -> ClickHouse).
// Off by default because the receiver has no per-team bearer-token auth like
// `otlp/hyperdx`, so enabling it opens an unauthenticated ingest port (:8126).
export const ENABLE_DATADOG_RECEIVER = env.ENABLE_DATADOG_RECEIVER === 'true';
export const HYPERDX_API_KEY = env.HYPERDX_API_KEY as string;
export const HYPERDX_LOG_LEVEL = env.HYPERDX_LOG_LEVEL as string;
export const IS_CI = NODE_ENV === 'test';
export const IS_DEV = NODE_ENV === 'development';
export const IS_PROD = NODE_ENV === 'production';
export const MONGO_URI = env.MONGO_URI;
export const OTEL_SERVICE_NAME = env.OTEL_SERVICE_NAME as string;
export const PORT = Number.parseInt(env.PORT as string);
export const OPAMP_PORT = Number.parseInt(env.OPAMP_PORT as string);
export const USAGE_STATS_ENABLED = env.USAGE_STATS_ENABLED !== 'false';
export const WEBHOOK_HOSTNAME_ALLOWLIST = env.WEBHOOK_HOSTNAME_ALLOWLIST ?? '';
export const RUN_SCHEDULED_TASKS_EXTERNALLY =
  env.RUN_SCHEDULED_TASKS_EXTERNALLY === 'true';

export const PASSWORD_AUTH_ENABLED = env.HDX_PASSWORD_AUTH_ENABLED !== 'false';
export const OIDC_ENABLED = env.HDX_OIDC_ENABLED === 'true';
export const OIDC_ISSUER_URL = env.HDX_OIDC_ISSUER_URL ?? '';
export const OIDC_CLIENT_ID = env.HDX_OIDC_CLIENT_ID ?? '';
export const OIDC_CLIENT_SECRET = env.HDX_OIDC_CLIENT_SECRET ?? '';
export const OIDC_REDIRECT_URI = env.HDX_OIDC_REDIRECT_URI ?? '';
export const OIDC_SESSION_MAX_AGE_SECONDS = Number.parseInt(
  env.HDX_OIDC_SESSION_MAX_AGE_SECONDS ?? '3600',
);
export const OIDC_TRANSACTION_TTL_SECONDS = Number.parseInt(
  env.HDX_OIDC_TRANSACTION_TTL_SECONDS ?? '600',
);
export const PUBLIC_HOST = env.HDX_PUBLIC_HOST ?? '';
export const TRUSTED_PRIVATE_HOSTS = (env.HDX_TRUSTED_PRIVATE_HOSTS ?? '')
  .split(',')
  .map(host => host.trim().toLowerCase())
  .filter(Boolean);
export const INTERNAL_BOOTSTRAP_ENABLED =
  env.HDX_INTERNAL_BOOTSTRAP_ENABLED === 'true';
export const INTERNAL_BOOTSTRAP_TOKEN_FILE =
  env.HDX_INTERNAL_BOOTSTRAP_TOKEN_FILE ?? '';
export const INTERNAL_BOOTSTRAP_EMAIL =
  env.HDX_INTERNAL_BOOTSTRAP_EMAIL ?? 'bootstrap@taicor.invalid';
export const INTERNAL_BOOTSTRAP_TEAM =
  env.HDX_INTERNAL_BOOTSTRAP_TEAM ?? 'Taicor';
export const SESSION_COOKIE_NAME =
  NODE_ENV === 'development' && env.HDX_DEV_SLOT
    ? `connect.sid.${env.HDX_DEV_SLOT}`
    : 'connect.sid';

if (OIDC_ENABLED) {
  const missing = [
    ['HDX_OIDC_ISSUER_URL', OIDC_ISSUER_URL],
    ['HDX_OIDC_CLIENT_ID', OIDC_CLIENT_ID],
    ['HDX_OIDC_CLIENT_SECRET', OIDC_CLIENT_SECRET],
    ['HDX_OIDC_REDIRECT_URI', OIDC_REDIRECT_URI],
    ['HDX_PUBLIC_HOST', PUBLIC_HOST],
  ].filter(([, value]) => value === '');
  if (missing.length > 0) {
    throw new Error(
      `OIDC is enabled but required settings are missing: ${missing
        .map(([name]) => name)
        .join(', ')}`,
    );
  }
  if (
    !Number.isFinite(OIDC_SESSION_MAX_AGE_SECONDS) ||
    OIDC_SESSION_MAX_AGE_SECONDS <= 0 ||
    !Number.isFinite(OIDC_TRANSACTION_TTL_SECONDS) ||
    OIDC_TRANSACTION_TTL_SECONDS <= 0
  ) {
    throw new Error('OIDC session and transaction TTLs must be positive');
  }
  if (PASSWORD_AUTH_ENABLED) {
    throw new Error('Password authentication must be disabled in OIDC mode');
  }
  let issuer: URL;
  try {
    issuer = new URL(OIDC_ISSUER_URL);
  } catch {
    throw new Error('HDX_OIDC_ISSUER_URL must be an absolute HTTPS URL');
  }
  if (
    issuer.protocol !== 'https:' ||
    issuer.username !== '' ||
    issuer.password !== '' ||
    issuer.search !== '' ||
    issuer.hash !== ''
  ) {
    throw new Error('HDX_OIDC_ISSUER_URL must be an absolute HTTPS URL');
  }
  if (OIDC_REDIRECT_URI !== `https://${PUBLIC_HOST}/api/login/oidc/callback`) {
    throw new Error(
      'HDX_OIDC_REDIRECT_URI must be the exact callback on HDX_PUBLIC_HOST',
    );
  }
}

if (INTERNAL_BOOTSTRAP_ENABLED && INTERNAL_BOOTSTRAP_TOKEN_FILE === '') {
  throw new Error(
    'HDX_INTERNAL_BOOTSTRAP_TOKEN_FILE is required when internal bootstrap is enabled',
  );
}

// 32-byte key (base64 or hex). Setting it is what turns on encryption of
// stored third-party tokens; unset means they are stored in plain text. See
// utils/tokenEncryption.ts.
export const TOKEN_ENCRYPTION_KEY = env.TOKEN_ENCRYPTION_KEY;

// Only used to bootstrap empty instances
export const DEFAULT_CONNECTIONS = env.DEFAULT_CONNECTIONS;
export const DEFAULT_SOURCES = env.DEFAULT_SOURCES;

export const IS_PROMQL_ENABLED = env.ENABLE_PROMQL === 'true';

export const EXTERNAL_API_RATE_LIMIT_MAX = (() => {
  const parsed = Number(env.EXTERNAL_API_RATE_LIMIT_MAX);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 100;
})();

// FOR CI ONLY
export const CLICKHOUSE_HOST = env.CLICKHOUSE_HOST as string;
export const CLICKHOUSE_USER = env.CLICKHOUSE_USER as string;
export const CLICKHOUSE_PASSWORD = env.CLICKHOUSE_PASSWORD as string;

// AI Assistant
// Provider-agnostic configuration (preferred)
export const AI_PROVIDER = env.AI_PROVIDER as string; // 'anthropic' | 'openai'
export const AI_API_KEY = env.AI_API_KEY as string;
export const AI_BASE_URL = env.AI_BASE_URL as string;
export const AI_MODEL_NAME = env.AI_MODEL_NAME as string;
export const AI_REQUEST_HEADERS = env.AI_REQUEST_HEADERS as string;

// Legacy Anthropic-specific configuration (backward compatibility)
export const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY as string;
