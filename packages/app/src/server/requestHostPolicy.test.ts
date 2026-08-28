import { requestHostDecision } from './requestHostPolicy';

const policy = (host: string, url: string, method = 'GET') =>
  requestHostDecision({
    host,
    method,
    url,
    publicHost: 'observe.taicor.ai',
    privateHosts: [
      'clickstack.taicor.ai',
      'clickstack-app',
      'clickstack-app.clickstack.svc.cluster.local',
    ],
  });

describe('ClickStack request host policy', () => {
  it('allows the exact health check before host enforcement', () => {
    expect(policy('10.0.0.1', '/api/health')).toEqual({
      allowed: true,
      kind: 'health',
    });
    expect(policy('10.0.0.1', '/api/health/extra').allowed).toBe(false);
  });

  it('allows browser routes on the public host', () => {
    expect(policy('observe.taicor.ai', '/api/login/oidc').allowed).toBe(true);
    expect(policy('OBSERVE.TAICOR.AI.:443', '/api/me').allowed).toBe(true);
  });

  it.each([
    '/api/api/v2',
    '/api/api/v2/search',
    '/api/mcp',
    '/api/internal/bootstrap/status',
    '/api/%61pi%2fv2/search',
    '/api/%2561pi%252fv2/search',
    '/api//internal//bootstrap/status',
    '/api\\mcp',
  ])('blocks public access to private path %s', path => {
    expect(policy('observe.taicor.ai', path)).toEqual({
      allowed: false,
      reason: 'blocked-path',
    });
  });

  it('allows all API paths through exact private service identities', () => {
    expect(policy('clickstack-app:3000', '/api/api/v2/search').allowed).toBe(
      true,
    );
    expect(
      policy(
        'clickstack-app.clickstack.svc.cluster.local',
        '/api/internal/bootstrap',
        'POST',
      ).allowed,
    ).toBe(true);
  });

  it('fails closed for suffix tricks and unknown hosts', () => {
    expect(policy('observe.taicor.ai.evil.example', '/api/me').allowed).toBe(
      false,
    );
    expect(policy('clickstack-app.evil', '/api/me').allowed).toBe(false);
    expect(policy('', '/api/me').allowed).toBe(false);
  });
});
