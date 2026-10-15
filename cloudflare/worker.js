// Cloudflare Worker — progress sync API for the French lessons site.
// One row per user token in D1. The token acts as the key AND the secret:
// anyone who knows it can read/write that row, so treat it like a password.
//
// Deploy: see cloudflare/README.md

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400'
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!/^[a-f0-9]{16,64}$/i.test(token)) {
      return new Response('unauthorized', { status: 401, headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/progress') {
      return new Response('not found', { status: 404, headers: cors });
    }

    if (request.method === 'GET') {
      const row = await env.DB
        .prepare('SELECT data FROM progress WHERE token = ?1')
        .bind(token)
        .first();
      return new Response(row ? row.data : '{}', {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    if (request.method === 'PUT') {
      const body = await request.text();
      if (body.length > 2000000) {
        return new Response('too large', { status: 413, headers: cors });
      }
      try {
        JSON.parse(body);
      } catch (e) {
        return new Response('bad json', { status: 400, headers: cors });
      }
      await env.DB
        .prepare('INSERT INTO progress (token, data, updated_at) VALUES (?1, ?2, ?3) ' +
                 'ON CONFLICT(token) DO UPDATE SET data = ?2, updated_at = ?3')
        .bind(token, body, Date.now())
        .run();
      return new Response('ok', { headers: cors });
    }

    return new Response('method not allowed', { status: 405, headers: cors });
  }
};
