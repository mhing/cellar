// Verifies the Cloudflare Access JWT on every API request.
// Cloudflare Access already blocks unauthenticated visitors at the edge; this is a
// second check so the API can't be reached by bypassing Access (e.g. via *.pages.dev
// if it isn't covered by the Access application).
//
// Required environment variables (set under [vars] in wrangler.toml; see README):
//   ACCESS_TEAM_DOMAIN  e.g. "yourteam.cloudflareaccess.com"
//   ACCESS_AUD          the Application Audience (AUD) tag from the Access application
// Local development only:
//   DEV_ALLOW_UNAUTH = "true"  skips verification (set in .dev.vars, never in production)

let certCache = { keys: null, fetchedAt: 0, team: null, inflight: null };
const CERT_TTL_MS = 60 * 60 * 1000;
// Minimum gap between forced refetches (unknown kid), so a flood of bogus
// tokens can't turn every request into a call to the certs endpoint.
const CERT_REFETCH_MIN_MS = 60 * 1000;
const CLOCK_SKEW_S = 60;

function b64urlToBytes(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJson(str) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(str)));
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

async function getKeys(team, force = false) {
  const now = Date.now();
  if (!force && certCache.keys && certCache.team === team && now - certCache.fetchedAt < CERT_TTL_MS) {
    return certCache.keys;
  }
  // Concurrent requests share one fetch rather than each hitting the certs endpoint.
  if (certCache.inflight && certCache.team === team) return certCache.inflight;
  const inflight = (async () => {
    const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error('Could not fetch Access certs');
    const body = await res.json();
    certCache = { keys: body.keys || [], fetchedAt: Date.now(), team, inflight: null };
    return certCache.keys;
  })();
  certCache = { ...certCache, team, inflight };
  try {
    return await inflight;
  } finally {
    if (certCache.inflight === inflight) certCache.inflight = null;
  }
}

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function verifyAccess(request, env) {
  if (env.DEV_ALLOW_UNAUTH === 'true') {
    return { email: 'dev@localhost', dev: true };
  }
  const team = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (!team || !aud) {
    throw new AuthError('Server is missing ACCESS_TEAM_DOMAIN / ACCESS_AUD configuration', 500);
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion') || getCookie(request, 'CF_Authorization');
  if (!token) throw new AuthError('Not signed in');

  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError('Malformed token');
  const [h, p, s] = parts;

  let header, payload;
  try {
    header = b64urlToJson(h);
    payload = b64urlToJson(p);
  } catch {
    throw new AuthError('Malformed token');
  }
  if (header.alg !== 'RS256') throw new AuthError('Unexpected token algorithm');

  let keys = await getKeys(team);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk && Date.now() - certCache.fetchedAt > CERT_REFETCH_MIN_MS) {
    // Keys rotate; refetch once, but not more often than CERT_REFETCH_MIN_MS.
    // The timestamp is bumped before awaiting so concurrent requests see the throttle.
    certCache.fetchedAt = Date.now();
    keys = await getKeys(team, true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new AuthError('Unknown signing key');

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  let sig;
  try {
    sig = b64urlToBytes(s);
  } catch {
    throw new AuthError('Malformed token');
  }
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, new TextEncoder().encode(`${h}.${p}`));
  if (!valid) throw new AuthError('Invalid token signature');

  // exp and iss are mandatory: a token without them must not be accepted.
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number') throw new AuthError('Token has no expiry');
  if (payload.exp < now - CLOCK_SKEW_S) throw new AuthError('Session expired');
  if (typeof payload.nbf === 'number' && payload.nbf > now + CLOCK_SKEW_S) throw new AuthError('Token not yet valid');
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) throw new AuthError('Token audience mismatch', 403);
  if (payload.iss !== `https://${team}`) throw new AuthError('Token issuer mismatch', 403);

  return { email: payload.email || payload.common_name || 'unknown' };
}
