/**
 * Expose the Express mini API to the internet with localhost.run so Instagram /
 * Meta can reach your OAuth callback and your webhook endpoint.
 *
 * localhost.run is an SSH reverse tunnel - nothing to install, it uses the `ssh`
 * client already on your machine (macOS / Linux / Windows OpenSSH).
 *
 * What this script does:
 *   1. Opens an SSH tunnel:  ssh -R 80:localhost:<PORT> localhost.run
 *   2. Captures the public https URL it hands out.
 *   3. Starts the mini API with INSTAGRAM_REDIRECT_URI pointed at that URL.
 *   4. Prints the exact values to paste into the Meta App Dashboard.
 *
 * Run:   npm run mini-api:tunnel
 * Stop:  Ctrl+C  (tears down both the tunnel and the server)
 *
 * Config comes from .env / environment (same vars as the mini API). The free
 * localhost.run domain changes on every run; for a stable domain use a
 * custom domain (see https://localhost.run/docs/custom-domains).
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

loadEnv(join(ROOT, '.env'));

const PORT = process.env.PORT || '3000';
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'testando';
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET || '';
const SSH_REMOTE = process.env.LOCALHOST_RUN_SSH || 'localhost.run';
// localhost.run announces the tunnel as: "<host> tunneled with tls termination,
// https://<host>". Anchor on that phrase (works for free .lhr.life and custom
// domains) and keep a .lhr.life fallback. The welcome banner mentions
// admin.localhost.run, so never match on a bare localhost.run.
const FORWARD_RE = /tunneled with tls termination,\s*(https:\/\/[^\s\\]+)/i;
const LHR_FALLBACK_RE = /https:\/\/[a-z0-9][a-z0-9-]*\.lhr\.life/i;

let server = null;
let tunnel = null;
let publicUrl = null;
let shuttingDown = false;

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('Opening localhost.run tunnel via ssh...');

tunnel = spawn(
  'ssh',
  [
    '-T',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ServerAliveInterval=60',
    '-o', 'ExitOnForwardFailure=yes',
    '-R', `80:127.0.0.1:${PORT}`,
    SSH_REMOTE,
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] }
);

let tunnelBuf = '';
tunnel.stdout.on('data', onTunnelData);
tunnel.stderr.on('data', onTunnelData);

tunnel.on('error', (err) => {
  console.error(`\nCould not start ssh: ${err.message}`);
  console.error('Make sure an ssh client is installed and outbound SSH (port 22) is allowed.');
  shutdown(1);
});

tunnel.on('exit', (code) => {
  if (shuttingDown) return;
  console.error(`\nTunnel closed (exit ${code}).`);
  shutdown(1);
});

// Give the tunnel time to advertise its URL.
setTimeout(() => {
  if (!publicUrl && !shuttingDown) {
    console.error('\nTimed out after 30s waiting for a localhost.run URL. Output above may explain why.');
    shutdown(1);
  }
}, 30000);

function onTunnelData(chunk) {
  const text = chunk.toString();
  process.stdout.write(dim('[tunnel] ') + text);
  if (publicUrl) return;

  tunnelBuf += text;
  const match = tunnelBuf.match(FORWARD_RE) || tunnelBuf.match(LHR_FALLBACK_RE);
  if (match) {
    publicUrl = match[1] || match[0];
    startServer().catch((err) => {
      console.error(err);
      shutdown(1);
    });
  }
}

async function startServer() {
  const redirectUri = `${publicUrl}/auth/callback`;
  console.log(`\nTunnel is live: ${publicUrl}`);
  console.log('Starting the mini API...\n');

  server = spawn('node', ['examples/mini-api.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT,
      INSTAGRAM_REDIRECT_URI: redirectUri,
      WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => process.stdout.write(dim('[server] ') + d));
  server.stderr.on('data', (d) => process.stdout.write(dim('[server] ') + d));
  server.on('exit', (code) => {
    if (shuttingDown) return;
    console.error(`\nServer exited (exit ${code}).`);
    shutdown(1);
  });

  if (!(await waitForHealth())) {
    console.error('The mini API did not become healthy.');
    return shutdown(1);
  }

  printInstructions(redirectUri);
}

async function waitForHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  return false;
}

function printInstructions(redirectUri) {
  const line = '='.repeat(70);
  const out = [
    '',
    line,
    '  Mini API is now reachable from the internet via localhost.run',
    line,
    `  Public URL          ${publicUrl}`,
    `  Open in browser     ${publicUrl}/`,
    `  Start OAuth login   ${publicUrl}/auth/login`,
    '',
    '  Paste these into the Meta App Dashboard:',
    `    OAuth redirect URI    ${redirectUri}`,
    `    Webhook callback URL  ${publicUrl}/webhook`,
    `    Webhook verify token  ${VERIFY_TOKEN}`,
    `    Privacy Policy URL    ${publicUrl}/privacy`,
    `    Terms of Service URL  ${publicUrl}/terms`,
    line,
  ];

  if (!APP_SECRET || APP_SECRET === 'PASTE_APP_SECRET_HERE') {
    out.push(
      '  WARNING: INSTAGRAM_APP_SECRET is not set in .env.',
      '  OAuth token exchange and webhook signature checks will fail until you set it.',
      line
    );
  }

  out.push('  The free domain changes every run. Press Ctrl+C to stop.', '');
  console.log(out.join('\n'));
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (server) server.kill('SIGTERM');
  if (tunnel) tunnel.kill('SIGTERM');
  setTimeout(() => process.exit(code), 200);
}

function dim(text) {
  return `\x1b[90m${text}\x1b[0m`;
}

/** Minimal .env loader. Existing process.env values take precedence. */
function loadEnv(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return; // no .env present; rely on the real environment
  }

  for (const lineText of raw.split('\n')) {
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
