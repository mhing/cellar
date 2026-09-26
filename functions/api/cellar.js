// GET  /api/cellar  -> current ledger document
// PUT  /api/cellar  -> { baseVersion, data }  saves if baseVersion matches, else 409
//
// Storage: Cloudflare KV namespace bound as CELLAR_KV.
//   "cellar"            current document
//   "backup:<iso-time>" previous document, kept 90 days after each save

import { verifyAccess, AuthError } from '../_lib/access.js';
import seed from '../../data/seed.json';

const KEY = 'cellar';
const BACKUP_TTL_SECONDS = 90 * 24 * 60 * 60;
const MAX_BYTES = 512 * 1024;
const LISTS = ['champagne', 'reds', 'nextUp', 'premier', 'everyday', 'shelves'];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

async function load(env) {
  if (!env.CELLAR_KV) throw new Error('KV binding CELLAR_KV is not configured');
  const doc = await env.CELLAR_KV.get(KEY, 'json');
  return doc || structuredClone(seed);
}

function clean(value, depth = 0) {
  // Keep only plain JSON values; trim overly long strings.
  if (depth > 6) return null;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 2000);
  if (Array.isArray(value)) return value.slice(0, 1000).map((v) => clean(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 100)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      out[String(k).slice(0, 64)] = clean(v, depth + 1);
    }
    return out;
  }
  return null;
}

function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Body must be a JSON object';
  if (!Number.isInteger(body.baseVersion)) return 'baseVersion must be an integer';
  const data = body.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Body must include a data object';
  for (const list of LISTS) {
    if (!Array.isArray(data[list])) return `data.${list} must be an array`;
    for (const item of data[list]) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id) {
        return `Every item in data.${list} needs a string id`;
      }
    }
  }
  return null;
}

async function withAuth(context, handler) {
  try {
    const user = await verifyAccess(context.request, context.env);
    return await handler(user);
  } catch (err) {
    if (err instanceof AuthError) return json({ error: err.message }, err.status);
    console.error('cellar api error:', err);
    return json({ error: 'Server error' }, 500);
  }
}

export const onRequestGet = (context) =>
  withAuth(context, async (user) => {
    const doc = await load(context.env);
    return json({ ...doc, viewer: user.email });
  });

export const onRequestPut = (context) =>
  withAuth(context, async (user) => {
    const raw = await context.request.text();
    if (raw.length > MAX_BYTES) return json({ error: 'Payload too large' }, 413);

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    const problem = validate(body);
    if (problem) return json({ error: problem }, 400);

    const current = await load(context.env);
    if (body.baseVersion !== current.version) {
      return json({ error: 'conflict', current }, 409);
    }

    const data = clean(body.data);
    delete data.viewer;
    const next = {
      ...data,
      schema: current.schema || 1,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: user.email,
    };

    await context.env.CELLAR_KV.put(`backup:${current.updatedAt || new Date().toISOString()}`, JSON.stringify(current), {
      expirationTtl: BACKUP_TTL_SECONDS,
    });
    await context.env.CELLAR_KV.put(KEY, JSON.stringify(next));
    return json({ ...next, viewer: user.email });
  });
