import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TEAM, AUD, makeKeyPair, signToken, validClaims, mockCerts, makeKV, authedRequest } from './helpers.js';

let worker, token, env;
const ctx = { waitUntil: vi.fn() };

beforeEach(async () => {
  const keyPair = await makeKeyPair();
  mockCerts(vi, [keyPair.jwk]);
  token = await signToken(keyPair, validClaims());
  env = {
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    CELLAR_KV: makeKV(),
    ASSETS: { fetch: vi.fn(async (req) => new Response(`asset:${new URL(req.url).pathname}`, { status: 200 })) },
  };
  vi.resetModules();
  worker = (await import('../src/index.js')).default;
});

afterEach(() => vi.unstubAllGlobals());

describe('worker router', () => {
  it('routes GET /api/cellar to the ledger handler', async () => {
    const res = await worker.fetch(authedRequest('https://cellar.example/api/cellar', token), env, ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).viewer).toBe('alice@example.com');
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('routes PUT /api/cellar to the ledger handler (auth still enforced)', async () => {
    const res = await worker.fetch(new Request('https://cellar.example/api/cellar', { method: 'PUT', body: '{}' }), env, ctx);
    expect(res.status).toBe(401);
  });

  it('returns 405 for other methods on /api/cellar', async () => {
    const res = await worker.fetch(new Request('https://cellar.example/api/cellar', { method: 'POST' }), env, ctx);
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET, PUT');
  });

  it('returns 404 for unknown /api/ paths without touching assets', async () => {
    const res = await worker.fetch(new Request('https://cellar.example/api/other'), env, ctx);
    expect(res.status).toBe(404);
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('serves everything else from static assets', async () => {
    for (const path of ['/', '/styles.css', '/app.js']) {
      const res = await worker.fetch(new Request(`https://cellar.example${path}`), env, ctx);
      expect(await res.text()).toBe(`asset:${path}`);
    }
    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(3);
  });
});
