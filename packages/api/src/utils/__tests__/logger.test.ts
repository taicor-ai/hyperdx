import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { Writable } from 'stream';

import { REDACTED_PATHS } from '@/utils/logger';

describe('production request log redaction', () => {
  function captureRequestLog(): string {
    let out = '';
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        out += chunk.toString();
        callback();
      },
    });
    const logger = pino(
      { redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' } },
      sink,
    );
    const middleware = pinoHttp({ logger });

    const socket = new Socket();
    Object.defineProperty(socket, 'remoteAddress', { value: '203.0.113.7' });
    const request = new IncomingMessage(socket);
    request.method = 'GET';
    request.url = '/api/v2/sources';
    request.headers = {
      authorization: 'Bearer super-secret-key',
      cookie: 'connect.sid=secret-session',
      'user-agent': 'jest',
    };

    const response = new ServerResponse(request);
    middleware(request, response);
    response.setHeader('set-cookie', 'connect.sid=rotated-session');
    response.setHeader('location', '/login?ticket=secret-ticket');
    response.statusCode = 200;
    response.emit('finish');

    return out;
  }

  it('censors credentials while preserving useful request context', () => {
    const out = captureRequestLog();

    expect(out).not.toContain('super-secret-key');
    expect(out).not.toContain('secret-session');
    expect(out).not.toContain('rotated-session');
    expect(out).not.toContain('secret-ticket');
    expect(out).toContain('[REDACTED]');
    expect(out).toContain('jest');
    expect(out).toContain('203.0.113.7');
    expect(out).toContain('/api/v2/sources');
  });
});
