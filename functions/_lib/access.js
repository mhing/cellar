// Verifies the Cloudflare Access JWT on every API request.
// Cloudflare Access already blocks unauthenticated visitors at the edge; this is a
// second check so the API can't be reached by bypassing Access (e.g. via *.pages.dev
// if it isn't covered by the Access application).
//
// Required environment variables (set in the Pages project settings):
//   ACCESS_TEAM_DOMAIN  e.g. "yourteam.cloudflareaccess.com"
//   ACCESS_AUD          the Application Audience (AUD) tag from the Access application
// Local development only:
//   DEV_ALLOW_UNAUTH = "true"  skips verification (set in .dev.vars, never in production)

let certCache = { keys: null, fetchedAt: 0, team: null };
const CERT_TTL_MS = 60 * 60 * 1000;

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

async function getKeys(team) {
  const now = Date.now();
  if (certCache.keys && certCache.team === team && now - certCache.fetchedAt < CERT_TTL_MS) {
    return certCache.keys;
  }
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('Could not fetch Access certs');
  const body = await res.json();
  certCache = { keys: body.keys || [], fetchedAt: now, team };
  return certCache.keys;
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
  if (!jwk) {
    // Keys rotate; refetch once.
    certCache.fetchedAt = 0;
    keys = await getKeys(team);
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
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(s),
    new TextEncoder().encode(`${h}.${p}`)
  );
  if (!valid) throw new AuthError('Invalid token signature');

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new AuthError('Session expired');
  if (payload.nbf && payload.nbf > now + 60) throw new AuthError('Token not yet valid');
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) throw new AuthError('Token audience mismatch', 403);
  if (payload.iss && payload.iss !== `https://${team}`) throw new AuthError('Token issuer mismatch', 403);

  return { email: payload.email || payload.common_name || 'unknown' };
}
