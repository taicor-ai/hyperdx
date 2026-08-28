import { safeReturnTo } from '@/auth/oidc';
import { cacheSuccess } from '@/utils/cacheSuccess';

describe('OIDC return path validation', () => {
  it.each([
    ['/search?where=service#row', '/search?where=service#row'],
    ['/', '/'],
    ['https://evil.example/search', '/'],
    ['//evil.example/search', '/'],
    ['/\\evil.example/search', '/'],
    [undefined, '/'],
  ])('normalizes %p to %p', (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected);
  });
});

describe('OIDC discovery cache', () => {
  it('retries a transient discovery failure and caches only success', async () => {
    const configuration = { issuer: 'https://broker.taicor.ai/oauth' };
    const discovery = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary discovery failure'))
      .mockResolvedValueOnce(configuration);
    const relyingParty = cacheSuccess(discovery);

    await expect(relyingParty()).rejects.toThrow('temporary discovery failure');
    await expect(relyingParty()).resolves.toBe(configuration);
    await expect(relyingParty()).resolves.toBe(configuration);
    expect(discovery).toHaveBeenCalledTimes(2);
  });
});
