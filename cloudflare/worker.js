// Cloudflare Worker — progress sync API for the French lessons site.
// Auth: Google ID token (JWT) as Authorization: Bearer. The Worker verifies
// the signature against Google's public keys (JWKS), checks audience/expiry,
// and keys the D1 row by the Google account id (sub). No secret is stored —
// only the public GOOGLE_CLIENT_ID variable is needed.
//
// Deploy: see cloudflare/README.md

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
let certs = { keys: null, exp: 0 };

function b64urlBytes(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function googleKeys() {
  if (certs.keys && Date.now() < certs.exp) return certs.keys;
  const r = await fetch(CERTS_URL);
  if (!r.ok) throw new Error('jwks');
  const cc = r.headers.get('Cache-Control') || '';
  const m = cc.match(/max-age=(\d+)/);
  const ttl = m ? parseInt(m[1], 10) * 1000 : 3600000;
  const j = await r.json();
  certs = { keys: j.keys, exp: Date.now() + Math.min(Math.max(ttl, 60000), 86400000) };
  return certs.keys;
}

async function verifyIdToken(jwt, clientId) {
  const parts = String(jwt || '').split('.');
  if (parts.length !== 3) throw new Error('malformed');
  const header = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[1])));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('alg');
  const now = Math.floor(Date.now() / 1000);
  if (!(payload.exp > now)) throw new Error('expired');
  if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') throw new Error('iss');
  if (payload.aud !== clientId) throw new Error('aud');
  if (!payload.sub) throw new Error('sub');
  const keys = await googleKeys();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['verify']
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key,
    b64urlBytes(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1])
  );
  if (!ok) throw new Error('signature');
  return payload;
}

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (url.pathname !== '/progress') return new Response('not found', { status: 404, headers: cors });

    const auth = request.headers.get('Authorization') || '';
    const jwt = auth.replace(/^Bearer\s+/i, '').trim();
    let claims;
    try {
      claims = await verifyIdToken(jwt, env.GOOGLE_CLIENT_ID);
    } catch (e) {
      return new Response('unauthorized', { status: 401, headers: cors });
    }

    const userId = claims.sub;
    const email = claims.email || '';

    if (request.method === 'GET') {
      const row = await env.DB
        .prepare('SELECT data FROM progress WHERE user_id = ?1')
        .bind(userId)
        .first();
      return new Response(row ? row.data : '{}', {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    if (request.method === 'PUT') {
      const body = await request.text();
      if (body.length > 2000000) return new Response('too large', { status: 413, headers: cors });
      try { JSON.parse(body); } catch (e) { return new Response('bad json', { status: 400, headers: cors }); }
      await env.DB
        .prepare('INSERT INTO progress (user_id, email, data, updated_at) VALUES (?1, ?2, ?3, ?4) ' +
                 'ON CONFLICT(user_id) DO UPDATE SET email = ?2, data = ?3, updated_at = ?4')
        .bind(userId, email, body, Date.now())
        .run();
      return new Response('ok', { headers: cors });
    }

    return new Response('method not allowed', { status: 405, headers: cors });
  }
};
