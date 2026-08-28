describe('config', () => {
  describe('OIDC validation', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
      jest.resetModules();
    });

    it('fails startup when OIDC is only partially configured', () => {
      process.env.HDX_OIDC_ENABLED = 'true';
      process.env.HDX_OIDC_ISSUER_URL = 'https://access.taicor.ai/oauth';
      expect(() => {
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports, n/no-missing-require
          require('@/config');
        });
      }).toThrow(/required settings are missing/);
    });

    it('accepts the complete OIDC contract', () => {
      Object.assign(process.env, {
        HDX_OIDC_ENABLED: 'true',
        HDX_OIDC_ISSUER_URL: 'https://access.taicor.ai/oauth',
        HDX_OIDC_CLIENT_ID: 'clickstack',
        HDX_OIDC_CLIENT_SECRET: 'test-secret',
        HDX_PASSWORD_AUTH_ENABLED: 'false',
        HDX_OIDC_REDIRECT_URI:
          'https://observe.taicor.ai/api/login/oidc/callback',
        HDX_PUBLIC_HOST: 'observe.taicor.ai',
      });
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, n/no-missing-require
        const config = require('@/config');
        expect(config.OIDC_ENABLED).toBe(true);
        expect(config.PASSWORD_AUTH_ENABLED).toBe(false);
      });
    });

    it('rejects OIDC when password authentication remains enabled', () => {
      Object.assign(process.env, {
        HDX_OIDC_ENABLED: 'true',
        HDX_OIDC_ISSUER_URL: 'https://access.taicor.ai/oauth',
        HDX_OIDC_CLIENT_ID: 'clickstack',
        HDX_OIDC_CLIENT_SECRET: 'test-secret',
        HDX_OIDC_REDIRECT_URI:
          'https://observe.taicor.ai/api/login/oidc/callback',
        HDX_PUBLIC_HOST: 'observe.taicor.ai',
      });
      expect(() => {
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports, n/no-missing-require
          require('@/config');
        });
      }).toThrow(/Password authentication must be disabled/);
    });
  });

  describe('FRONTEND_REDIRECT_BASE', () => {
    const ORIGINAL_INLINE = process.env.HDX_PREVIEW_INLINE_API;
    const ORIGINAL_FRONTEND_URL = process.env.FRONTEND_URL;

    afterEach(() => {
      // Restore the original env vars so other tests in the suite see the
      // values they expect.
      if (ORIGINAL_INLINE === undefined) {
        delete process.env.HDX_PREVIEW_INLINE_API;
      } else {
        process.env.HDX_PREVIEW_INLINE_API = ORIGINAL_INLINE;
      }
      if (ORIGINAL_FRONTEND_URL === undefined) {
        delete process.env.FRONTEND_URL;
      } else {
        process.env.FRONTEND_URL = ORIGINAL_FRONTEND_URL;
      }
      jest.resetModules();
    });

    it('falls back to FRONTEND_URL when HDX_PREVIEW_INLINE_API is not set', () => {
      delete process.env.HDX_PREVIEW_INLINE_API;
      process.env.FRONTEND_URL = 'https://hyperdx.io';

      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, n/no-missing-require
        const config = require('@/config');
        expect(config.IS_INLINE_API).toBe(false);
        expect(config.FRONTEND_REDIRECT_BASE).toBe('https://hyperdx.io');
        expect(config.FRONTEND_REDIRECT_BASE).toBe(config.FRONTEND_URL);
      });
    });

    it('falls back to FRONTEND_URL when HDX_PREVIEW_INLINE_API is "false"', () => {
      process.env.HDX_PREVIEW_INLINE_API = 'false';
      process.env.FRONTEND_URL = 'https://hyperdx.io';

      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, n/no-missing-require
        const config = require('@/config');
        expect(config.IS_INLINE_API).toBe(false);
        expect(config.FRONTEND_REDIRECT_BASE).toBe('https://hyperdx.io');
      });
    });

    it('emits an empty string (relative redirects) when HDX_PREVIEW_INLINE_API is "true"', () => {
      process.env.HDX_PREVIEW_INLINE_API = 'true';
      process.env.FRONTEND_URL = 'https://private.hyperdx.io';

      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, n/no-missing-require
        const config = require('@/config');
        expect(config.IS_INLINE_API).toBe(true);
        expect(config.FRONTEND_REDIRECT_BASE).toBe('');
        // Sanity check: FRONTEND_URL itself is unchanged so emails/SAML
        // callbacks still have the absolute origin available when needed.
        expect(config.FRONTEND_URL).toBe('https://private.hyperdx.io');
      });
    });
  });
});
