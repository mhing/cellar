import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TEAM, AUD, makeKeyPair, signToken, validClaims, mockCerts, makeKV, authedRequest } from './helpers.js';
import seed from '../data/seed.json';

const URL = 'https://cellar.example/api/cellar';
let keyPair, token, api;

const baseEnv = () => ({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD });
const validData = () => {
  const { schema, version, updatedAt, updatedBy, ...data } = structuredClone(seed);
  return data;
};
const put = (body, env) =>
  api.onRequestPut({
    request: authedRequest(URL, token, { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
    env,
  });

beforeEach(async () => {
  keyPair = await makeKeyPair();
  mockCerts(vi, [keyPair.jwk]);
  token = await signToken(keyPair, validClaims());
  vi.resetModules();
  api = await import('../functions/api/cellar.js');
});

afterEach(() => vi.unstubAllGlobals());

describe('GET /api/cellar', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await api.onRequestGet({ request: new Request(URL), env: { ...baseEnv(), CELLAR_KV: makeKV() } });
    expect(res.status).toBe(401);
  });

  it('serves the seed when KV is empty, with the viewer email', async () => {
    const res = await api.onRequestGet({ request: authedRequest(URL, token), env: { ...baseEnv(), CELLAR_KV: makeKV() } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe(seed.version);
    expect(body.champagne).toHaveLength(seed.champagne.length);
    expect(body.viewer).toBe('alice@example.com');
  });

  it('serves the KV document once one exists', async () => {
    const stored = { ...seed, version: 7, champagne: [] };
    const res = await api.onRequestGet({ request: authedRequest(URL, token), env: { ...baseEnv(), CELLAR_KV: makeKV({ cellar: stored }) } });
    expect((await res.json()).version).toBe(7);
  });
});

describe('PUT /api/cellar', () => {
  it('saves when baseVersion matches, bumps version, and writes a backup', async () => {
    const kv = makeKV();
    const data = validData();
    data.nextUpNote = 'changed';
    const res = await put({ baseVersion: seed.version, data }, { ...baseEnv(), CELLAR_KV: kv });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe(seed.version + 1);
    expect(body.updatedBy).toBe('alice@example.com');
    expect(body.nextUpNote).toBe('changed');
    expect(body.viewer).toBe('alice@example.com');

    const keys = kv.puts.map((p) => p.key);
    expect(keys).toContain('cellar');
    const backup = kv.puts.find((p) => p.key.startsWith('backup:'));
    expect(backup.opts.expirationTtl).toBe(90 * 24 * 60 * 60);
    expect(JSON.parse(backup.value).version).toBe(seed.version);
    expect(JSON.parse(kv.store.get('cellar')).viewer).toBeUndefined();
  });

  it('returns 409 with the current document when baseVersion is stale', async () => {
    const kv = makeKV({ cellar: { ...seed, version: 5 } });
    const res = await put({ baseVersion: 4, data: validData() }, { ...baseEnv(), CELLAR_KV: kv });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('conflict');
    expect(body.current.version).toBe(5);
    expect(kv.puts).toHaveLength(0);
  });

  it.each([
    ['invalid JSON', '{not json', /invalid json/i],
    ['non-object body', '"hello"', /json object/i],
    ['array body', '[]', /json object/i],
    ['missing baseVersion', { data: validData() }, /baseVersion/],
    ['non-integer baseVersion', { baseVersion: '1', data: validData() }, /baseVersion/],
    ['missing data', { baseVersion: 1 }, /data object/i],
    ['data is an array', { baseVersion: 1, data: [] }, /data object/i],
    ['a list is missing', { baseVersion: 1, data: { ...validData(), reds: undefined } }, /data\.reds must be an array/],
    ['a list is not an array', { baseVersion: 1, data: { ...validData(), shelves: {} } }, /data\.shelves must be an array/],
    ['an item has no id', { baseVersion: 1, data: { ...validData(), everyday: [{ house: 'x' }] } }, /string id/],
    ['an item has a non-string id', { baseVersion: 1, data: { ...validData(), everyday: [{ id: 3 }] } }, /string id/],
  ])('returns 400 for %s', async (_label, body, match) => {
    const kv = makeKV();
    const res = await put(body, { ...baseEnv(), CELLAR_KV: kv });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(match);
    expect(kv.puts).toHaveLength(0);
  });

  it('returns 413 for an oversized payload', async () => {
    const res = await put('x'.repeat(512 * 1024 + 1), { ...baseEnv(), CELLAR_KV: makeKV() });
    expect(res.status).toBe(413);
  });

  it('strips viewer and ignores client-supplied version/updatedBy', async () => {
    const data = { ...validData(), viewer: 'spoof@example.com', version: 99, updatedBy: 'spoof', schema: 9 };
    const res = await put({ baseVersion: seed.version, data }, { ...baseEnv(), CELLAR_KV: makeKV() });
    const body = await res.json();
    expect(body.version).toBe(seed.version + 1);
    expect(body.updatedBy).toBe('alice@example.com');
    expect(body.schema).toBe(seed.schema);
  });

  it('drops __proto__ keys and truncates long strings', async () => {
    const data = validData();
    data.everyday = [{ id: 'e-1', notes: 'n'.repeat(5000) }];
    const raw = JSON.stringify({ baseVersion: seed.version, data }).replace('"id":"e-1"', '"id":"e-1","__proto__":{"polluted":true}');
    const res = await put(raw, { ...baseEnv(), CELLAR_KV: makeKV() });
    expect(res.status).toBe(200);
    const item = (await res.json()).everyday[0];
    expect(item.notes).toHaveLength(2000);
    expect(Object.keys(item)).not.toContain('__proto__');
    expect({}.polluted).toBeUndefined();
  });

  it('does not leak internal error details on 500', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await api.onRequestGet({ request: authedRequest(URL, token), env: baseEnv() }); // no KV binding
    expect(logged).toHaveBeenCalledOnce();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Server error' });
  });
});
