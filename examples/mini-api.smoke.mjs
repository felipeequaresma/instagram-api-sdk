/**
 * Smoke test for the Express mini API (examples/mini-api.js).
 *
 * Boots the server with deterministic env vars, exercises routing, validation,
 * webhook verification (challenge + signature) and the error handler, then exits
 * non-zero if any check fails. No real Instagram network calls are made.
 *
 * Run:  npm run mini-api:smoke
 */
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const ENV = {
  ...process.env,
  PORT: '3999',
  INSTAGRAM_APP_ID: '123456',
  INSTAGRAM_APP_SECRET: 'smoke-secret',
  INSTAGRAM_REDIRECT_URI: 'http://localhost:3999/auth/callback',
  WEBHOOK_VERIFY_TOKEN: 'smoke-verify',
  INSTAGRAM_ACCESS_TOKEN: '',
  DEBUG: 'false',
};
const BASE = `http://localhost:${ENV.PORT}`;

const server = spawn('node', ['examples/mini-api.js'], {
  cwd: ROOT,
  env: ENV,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

const results = [];
const check = (name, ok, extra = '') => results.push({ name, ok: !!ok, extra });

async function waitForUp() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  return false;
}

try {
  const up = await waitForUp();
  check('server boots', up);
  if (!up) throw new Error('server did not start\n' + serverLog);

  let r = await fetch(`${BASE}/health`);
  let j = await r.json();
  check('GET /health', r.status === 200 && j.ok === true, JSON.stringify(j));

  r = await fetch(`${BASE}/`);
  const html = await r.text();
  check(
    'GET / landing page',
    r.status === 200 &&
      (r.headers.get('content-type') || '').includes('text/html') &&
      html.includes('mini API') &&
      html.includes('/auth/login'),
    `status=${r.status}`
  );

  r = await fetch(`${BASE}/config`);
  j = await r.json();
  check(
    'GET /config exposes flags, not secrets',
    r.status === 200 && j.hasAppSecret === true && j.hasVerifyToken === true && !('verifyToken' in j),
    JSON.stringify(j)
  );

  r = await fetch(`${BASE}/routes`);
  j = await r.json();
  check('GET /routes catalog', r.status === 200 && Array.isArray(j) && j.length >= 20, `len=${j.length}`);

  r = await fetch(`${BASE}/terms`);
  let body = await r.text();
  check(
    'GET /terms page',
    r.status === 200 &&
      (r.headers.get('content-type') || '').includes('text/html') &&
      body.includes('Terms of Service'),
    `status=${r.status}`
  );

  r = await fetch(`${BASE}/privacy`);
  body = await r.text();
  check(
    'GET /privacy page',
    r.status === 200 &&
      (r.headers.get('content-type') || '').includes('text/html') &&
      body.includes('Privacy Policy') &&
      body.includes('Data deletion'),
    `status=${r.status}`
  );

  r = await fetch(`${BASE}/auth/url?scopes=instagram_business_basic,extra_scope&state=abc123`);
  j = await r.json();
  check(
    'GET /auth/url honors scopes+state',
    r.status === 200 &&
      j.authUrl.includes('state=abc123') &&
      j.authUrl.includes('instagram_business_basic') &&
      j.authUrl.includes('extra_scope'),
    j.authUrl
  );

  r = await fetch(`${BASE}/auth/login`, { redirect: 'manual' });
  const loc = r.headers.get('location') || '';
  check(
    'GET /auth/login redirects to Instagram',
    (r.status === 301 || r.status === 302) && loc.includes('api.instagram.com/oauth/authorize'),
    `status=${r.status}`
  );

  r = await fetch(`${BASE}/webhook?hub.mode=subscribe&hub.verify_token=smoke-verify&hub.challenge=PING42`);
  const text = await r.text();
  check('GET /webhook verification ok', r.status === 200 && text === 'PING42', `status=${r.status} body=${text}`);

  r = await fetch(`${BASE}/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=PING`);
  check('GET /webhook rejects bad token', r.status === 403, `status=${r.status}`);

  r = await fetch(`${BASE}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' },
    body: JSON.stringify({ object: 'instagram', entry: [] }),
  });
  j = await r.json();
  check('POST /webhook rejects bad signature', r.status === 403 && j.error === 'WebhookVerificationError', JSON.stringify(j));

  // Valid signature: HMAC over the exact bytes we send (proves raw-body capture).
  const payload = JSON.stringify({
    object: 'instagram',
    entry: [{ id: '1', time: 1, changes: [{ field: 'comments', value: { text: 'hi' } }] }],
  });
  const sig = 'sha256=' + createHmac('sha256', ENV.INSTAGRAM_APP_SECRET).update(payload).digest('hex');
  r = await fetch(`${BASE}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig },
    body: payload,
  });
  j = await r.json();
  check('POST /webhook accepts a correctly-signed payload', r.status === 200 && j.success === true, JSON.stringify(j));

  r = await fetch(`${BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  j = await r.json();
  check(
    'POST /auth/token validates body',
    r.status === 400 && j.error === 'ValidationError' && j.field === 'accessToken',
    JSON.stringify(j)
  );

  r = await fetch(`${BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: 'tok_123' }),
  });
  j = await r.json();
  check('POST /auth/token sets token', r.status === 200 && j.success === true, JSON.stringify(j));

  r = await fetch(`${BASE}/nope`);
  j = await r.json();
  check('unknown route -> 404 json', r.status === 404 && j.error === 'Not found', JSON.stringify(j));
} catch (error) {
  check('smoke run completed', false, String(error));
} finally {
  server.kill('SIGTERM');
}

let pass = 0;
for (const res of results) {
  console.log(`${res.ok ? 'PASS' : 'FAIL'}  ${res.name}${res.ok ? '' : '  -> ' + res.extra}`);
  if (res.ok) pass++;
}
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length && results.length > 0 ? 0 : 1);
