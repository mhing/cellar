// Worker entry point. Routes /api/cellar to the ledger handlers and serves
// everything else from the static assets in public/ (the ASSETS binding).

import { onRequestGet, onRequestPut } from '../functions/api/cellar.js';

const json = (body, status, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...extra } });

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/cellar') {
      const context = { request, env, waitUntil: (p) => ctx.waitUntil(p) };
      if (request.method === 'GET') return onRequestGet(context);
      if (request.method === 'PUT') return onRequestPut(context);
      return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, PUT' });
    }
    if (pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);

    return env.ASSETS.fetch(request);
  },
};
