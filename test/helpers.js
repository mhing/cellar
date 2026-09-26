// Shared test helpers: a real RS256 key pair, JWT minting, and an in-memory KV.

const b64url = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

export const TEAM = 'testteam.cloudflareaccess.com';
export const AUD = 'aud-tag-for-tests';

export async function makeKeyPair(kid = 'kid-1') {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { kid, privateKey: pair.privateKey, jwk: { ...jwk, kid, use: 'sig', alg: 'RS256' } };
}

// Signs `payload` with `keyPair`. `header` overrides let tests craft bad tokens.
export async function signToken(keyPair, payload, header = {}) {
  const h = b64urlJson({ alg: 'RS256', typ: 'JWT', kid: keyPair.kid, ...header });
  const p = b64urlJson(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

export function validClaims(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { aud: [AUD], iss: `https://${TEAM}`, email: 'alice@example.com', iat: now, nbf: now, exp: now + 3600, ...overrides };
}

// Replaces global fetch so the certs endpoint returns `keys`. Returns the mock.
export function mockCerts(vi, keys) {
  const fn = vi.fn(async (url) => {
    if (String(url) === `https://${TEAM}/cdn-cgi/access/certs`) {
      return new Response(JSON.stringify({ keys }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function makeKV(initial = {}) {
  const store = new Map(Object.entries(initial).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  return {
    store,
    puts: [],
    async get(key, type) {
      const v = store.get(key);
      if (v === undefined) return null;
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(key, value, opts) {
      this.puts.push({ key, value, opts });
      store.set(key, value);
    },
  };
}

export const authedRequest = (url, token, init = {}) =>
  new Request(url, { ...init, headers: { 'Cf-Access-Jwt-Assertion': token, ...(init.headers || {}) } });
