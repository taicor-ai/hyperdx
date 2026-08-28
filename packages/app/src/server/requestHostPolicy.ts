const PUBLIC_BLOCKED_PREFIXES = [
  '/api/api/v2',
  '/api/mcp',
  '/api/internal/bootstrap',
] as const;

function normalizedHost(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return new URL(`http://${raw}`).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return undefined;
  }
}

function canonicalPath(rawUrl: string | undefined): string | undefined {
  let path = (rawUrl ?? '/').split('?', 1)[0] ?? '/';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return undefined;
    }
    if (decoded === path) break;
    path = decoded;
    if (attempt === 4) return undefined;
  }
  if (path.includes('\\') || path.includes('\0')) return undefined;
  return path.replace(/\/{2,}/g, '/').toLowerCase();
}

export type RequestHostDecision =
  | { allowed: true; kind: 'health' | 'public' | 'private' }
  | { allowed: false; reason: 'unknown-host' | 'blocked-path' };

export function requestHostDecision(args: {
  host: string | undefined;
  method: string | undefined;
  url: string | undefined;
  publicHost: string;
  privateHosts: readonly string[];
}): RequestHostDecision {
  const path = canonicalPath(args.url);
  if (args.method === 'GET' && path === '/api/health') {
    return { allowed: true, kind: 'health' };
  }
  const host = normalizedHost(args.host);
  if (!host) return { allowed: false, reason: 'unknown-host' };
  const publicHost = normalizedHost(args.publicHost);
  const privateHosts = new Set(args.privateHosts.map(normalizedHost));
  if (privateHosts.has(host)) return { allowed: true, kind: 'private' };
  if (host !== publicHost) return { allowed: false, reason: 'unknown-host' };
  if (
    path === undefined ||
    PUBLIC_BLOCKED_PREFIXES.some(
      prefix => path === prefix || path.startsWith(`${prefix}/`),
    )
  ) {
    return { allowed: false, reason: 'blocked-path' };
  }
  return { allowed: true, kind: 'public' };
}
