import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TEAM, AUD, makeKeyPair, signToken, validClaims, mockCerts } from './helpers.js';

const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
const req = (headers) => new Request('https://cellar.example/api/cellar', { headers });

let keyPair, otherPair, verifyAccess, AuthError;

beforeEach(async () => {
  keyPair = await makeKeyPair('kid-1');
  otherPair = await makeKeyPair('kid-other');
  mockCerts(vi, [keyPair.jwk]);
  // access.js caches certs at module level, so give each test a fresh module.
  vi.resetModules();
  ({ verifyAccess, AuthError } = await import('../functions/_lib/access.js'));
});

afterEach(() => vi.unstubAllGlobals());

async function expectAuthError(promise, status, messageMatch) {
  const err = await promise.then(() => null, (e) => e);
  expect(err, 'expected verifyAccess to throw').not.toBeNull();
  expect(err).toBeInstanceOf(AuthError);
  expect(err.status).toBe(status);
  if (messageMatch) expect(err.message).toMatch(messageMatch);
}

describe('verifyAccess', () => {
  it('accepts a valid RS256 token from the assertion header', async () => {
    const token = await signToken(keyPair, validClaims());
    await expect(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': token }), env)).resolves.toEqual({ email: 'alice@example.com' });
  });

  it('accepts a valid token from the CF_Authorization cookie', async () => {
    const token = await signToken(keyPair, validClaims());
    const user = await verifyAccess(req({ Cookie: `foo=bar; CF_Authorization=${token}; x=y` }), env);
    expect(user.email).toBe('alice@example.com');
  });

  it('accepts a string aud as well as an array', async () => {
    const token = await signToken(keyPair, validClaims({ aud: AUD }));
    await expect(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': token }), env)).resolves.toBeTruthy();
  });

  it('rejects a missing token', async () => {
    await expectAuthError(verifyAccess(req({}), env), 401, /not signed in/i);
  });

  it('rejects a malformed token', async () => {
    await expectAuthError(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': 'nope' }), env), 401, /malformed/i);
    await expectAuthError(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': '!!.!!.!!' }), env), 401, /malformed/i);
  });

  it('rejects an expired token', async () => {
    const token = await signToken(keyPair, validClaims({ exp: Math.floor(Date.now() / 1000) - 600 }));
    await expectAuthError(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': token }), env), 401, /expired/i);
  });

  it('rejects a token with no exp', async () => {
    const claims = validClaims();
    delete claims.exp;
    const token = await signToken(keyPair, claims);
    await expectAuthError(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': token }), env), 401, /expiry/i);
  });

  it('rejects a token signed by a key not in the certs', async () => {
    const token = await signToken(otherPair, validClaims(), { kid: 'kid-1' }); // claims to be kid-1
    await expectAuthError(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': token }), env), 401, /signature/i);
  });

  it('rejects a token with an unknown kid', async () => {
    const token = await signToken(otherPair, validClaims());
    await expectAuthError(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': token }), env), 401, /unknown signing key/i);
  });

  it('rejects a token whose signature is not valid base64url with 401, not 500', async () => {
    const token = await signToken(keyPair, validClaims());
    const [h, p] = token.split('.');
    await expectAuthError(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': `${h}.${p}.!!!` }), env), 401, /malformed/i);
  });

  it('rejects a tampered payload', async () => {
    const token = await signToken(keyPair, validClaims());
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify(validClaims({ email: 'mallory@example.com' }))).toString('base64url');
    await expectAuthError(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': `${h}.${forged}.${s}` }), env), 401, /signature/i);
  });

  it('rejects alg other than RS256 (e.g. none)', async () => {
    const token = await signToken(keyPair, validClaims(), { alg: 'none' });
    await expectAuthError(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': token }), env), 401, /algorithm/i);
  });

  it('rejects a wrong audience', async () => {
    const token = await signToken(keyPair, validClaims({ aud: ['some-other-app'] }));
    await expectAuthError(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': token }), env), 403, /audience/i);
  });

  it('rejects a wrong issuer', async () => {
    const token = await signToken(keyPair, validClaims({ iss: 'https://evil.cloudflareaccess.com' }));
    await expectAuthError(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': token }), env), 403, /issuer/i);
  });

  it('rejects a token with no issuer', async () => {
    const claims = validClaims();
    delete claims.iss;
    const token = await signToken(keyPair, claims);
    await expectAuthError(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': token }), env), 403, /issuer/i);
  });

  it('returns 500 when ACCESS_* config is missing', async () => {
    const token = await signToken(keyPair, validClaims());
    await expectAuthError(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': token }), {}), 500, /configuration/i);
  });

  it('bypasses verification only when DEV_ALLOW_UNAUTH is "true"', async () => {
    await expect(verifyAccess(req({}), { DEV_ALLOW_UNAUTH: 'true' })).resolves.toEqual({ email: 'dev@localhost', dev: true });
    await expectAuthError(verifyAccess(req({}), { ...env, DEV_ALLOW_UNAUTH: 'yes' }), 401);
  });

  it('shares one certs fetch across concurrent requests', async () => {
    const fetchMock = mockCerts(vi, [keyPair.jwk]);
    const token = await signToken(keyPair, validClaims());
    const results = await Promise.all(Array.from({ length: 5 }, () => verifyAccess(req({ 'Cf-Access-Jwt-Assertion': token }), env)));
    expect(results.every((u) => u.email === 'alice@example.com')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throttles forced refetches from concurrent unknown-kid tokens', async () => {
    const fetchMock = mockCerts(vi, [keyPair.jwk]);
    await verifyAccess(req({ 'Cf-Access-Jwt-Assertion': await signToken(keyPair, validClaims()) }), env);
    const bogus = await signToken(otherPair, validClaims());
    vi.useFakeTimers({ now: Date.now() + 61_000, toFake: ['Date'] });
    try {
      const results = await Promise.allSettled(Array.from({ length: 5 }, () => verifyAccess(req({ 'Cf-Access-Jwt-Assertion': bogus }), env)));
      expect(results.every((r) => r.status === 'rejected')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2); // initial + one shared forced refetch
  });

  it('caches certs and refetches once on an unknown kid after rotation', async () => {
    const fetchMock = mockCerts(vi, [keyPair.jwk]);
    const t1 = await signToken(keyPair, validClaims());
    await verifyAccess(req({ 'Cf-Access-Jwt-Assertion': t1 }), env);
    await verifyAccess(req({ 'Cf-Access-Jwt-Assertion': t1 }), env);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Rotate: certs endpoint now serves the other key; a token with the new kid
    // triggers one refetch and is then accepted.
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ keys: [otherPair.jwk] }), { status: 200 }));
    const t2 = await signToken(otherPair, validClaims());
    // The refetch throttle is 60s from the last fetch; move the clock past it.
    vi.useFakeTimers({ now: Date.now() + 61_000, toFake: ['Date'] });
    try {
      await expect(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': t2 }), env)).resolves.toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
