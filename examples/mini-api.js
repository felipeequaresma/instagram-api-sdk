/**
 * Instagram SDK mini API (Express)
 * ---------------------------------
 * A small, self-contained Express app that exposes the SDK over HTTP so you can
 * test real Instagram credentials with plain `curl` or a browser.
 *
 * Quick start:
 *   1. cp .env.example .env   # fill in INSTAGRAM_APP_SECRET (and others)
 *   2. npm run mini-api       # builds the SDK then starts this server
 *   3. open http://localhost:3000
 *
 * Configuration is read from environment variables (see .env.example). Anything
 * not set falls back to a development-friendly default so the server still boots.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const {
  InstagramClient,
  MemoryTokenStorage,
  ApiError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  WebhookVerificationError,
} = require('../dist');

// Load .env (no external dependency). Real environment variables win over .env.
loadEnv(path.join(__dirname, '..', '.env'));

const CONFIG = {
  port: Number(process.env.PORT) || 3000,
  appId: process.env.INSTAGRAM_APP_ID || '1700918690915916',
  appSecret: process.env.INSTAGRAM_APP_SECRET || 'PASTE_APP_SECRET_HERE',
  redirectUri:
    process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:3000/auth/callback',
  verifyToken: process.env.WEBHOOK_VERIFY_TOKEN || 'testando',
  initialAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
  debug: process.env.DEBUG === 'true',
  allowShortLivedToken: process.env.ALLOW_SHORT_LIVED_TOKEN === 'true',
  defaultScopes: [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
    'instagram_business_content_publish',
  ],
};

const tokenStorage = new MemoryTokenStorage();
const instagram = new InstagramClient({
  appId: CONFIG.appId,
  appSecret: CONFIG.appSecret,
  redirectUri: CONFIG.redirectUri,
  tokenStorage,
  debug: CONFIG.debug,
  allowShortLivedToken: CONFIG.allowShortLivedToken,
  defaultScopes: CONFIG.defaultScopes,
});
const webhook = instagram.createWebhookHandler(CONFIG.verifyToken);

if (CONFIG.initialAccessToken) {
  instagram.setAccessToken(CONFIG.initialAccessToken);
}

// Log received webhook events so the endpoint is observable during testing.
webhook.on('messages', (event) => console.log('[webhook] message', event));
webhook.on('message_reactions', (event) => console.log('[webhook] reaction', event));
webhook.on('comments', (change) => console.log('[webhook] comment', change.value));
webhook.on('mentions', (change) => console.log('[webhook] mention', change.value));
webhook.on('story_insights', (change) => console.log('[webhook] story', change.value));

const app = express();

// Parse JSON bodies and keep the raw buffer around. Webhook signature
// verification MUST run against the exact bytes Meta sent, so re-serializing
// `req.body` would break it.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Request logger: method + path on the way in, status + duration on finish.
// Query strings are omitted so OAuth codes / tokens never land in the logs.
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log(`[req] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - startedAt}ms)`);
  });
  next();
});

// ---------------------------------------------------------------------------
// Route catalog (also rendered on the landing page and served at /routes).
// ---------------------------------------------------------------------------
const ROUTES = [
  {
    group: 'System',
    items: [
      ['GET', '/health', 'Liveness check'],
      ['GET', '/config', 'Non-secret runtime configuration'],
      ['GET', '/routes', 'This catalog as JSON'],
    ],
  },
  {
    group: 'Legal',
    items: [
      ['GET', '/terms', 'Terms of Service (placeholder)'],
      ['GET', '/privacy', 'Privacy Policy (placeholder)'],
    ],
  },
  {
    group: 'Auth',
    items: [
      ['GET', '/auth/login', 'Redirect straight to Instagram OAuth (easiest way to connect)'],
      ['GET', '/auth/url', 'Build an OAuth URL. Query: state, scopes (comma-separated)'],
      ['GET', '/auth/callback', 'OAuth redirect target. Query: code'],
      ['POST', '/auth/token', 'Set an access token manually. Body: accessToken, [userId], [expiresAt]'],
      ['POST', '/auth/user', 'Activate a stored user token. Body: userId'],
    ],
  },
  {
    group: 'Media',
    items: [
      ['GET', '/media', 'List your media. Query: limit, after'],
      ['GET', '/media/:mediaId', 'Get one media object'],
      ['GET', '/media/:mediaId/insights', 'Get media insights'],
      ['GET', '/media/:mediaId/children', 'List carousel children'],
      ['GET', '/media/:mediaId/comments', 'List comments on media. Query: limit, after'],
    ],
  },
  {
    group: 'Comments',
    items: [
      ['GET', '/comments/:commentId', 'Get one comment'],
      ['GET', '/comments/:commentId/replies', 'List replies. Query: limit'],
      ['POST', '/comments/:commentId/replies', 'Reply to a comment. Body: message'],
      ['POST', '/comments/:commentId/hide', 'Hide a comment'],
      ['POST', '/comments/:commentId/unhide', 'Unhide a comment'],
      ['DELETE', '/comments/:commentId', 'Delete a comment'],
    ],
  },
  {
    group: 'Messages',
    items: [
      ['POST', '/messages/text', 'Send a DM. Body: recipientId, text'],
      ['POST', '/messages/image', 'Send an image DM. Body: recipientId, imageUrl'],
      ['POST', '/messages/video', 'Send a video DM. Body: recipientId, videoUrl'],
      ['POST', '/messages/:messageId/read', 'Mark a message as read'],
      ['GET', '/conversations', 'List conversations. Query: limit'],
      ['GET', '/conversations/:conversationId/messages', 'List messages. Query: limit'],
    ],
  },
  {
    group: 'Webhooks',
    items: [
      ['GET', '/webhook', 'Meta verification challenge'],
      ['POST', '/webhook', 'Meta event delivery (signature-verified)'],
    ],
  },
];

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------
app.get('/', (_req, res) => {
  res.type('html').send(renderIndex());
});

app.get('/terms', (_req, res) => {
  res.type('html').send(renderLegalPage('Terms of Service', termsHtml()));
});

app.get('/privacy', (_req, res) => {
  res.type('html').send(renderLegalPage('Privacy Policy', privacyHtml()));
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    package: '@felipeequaresma/instagram-api-sdk',
    apiVersion: instagram.apiVersion,
    uptime: Math.round(process.uptime()),
  });
});

app.get('/config', (_req, res) => {
  res.json({
    appId: CONFIG.appId,
    apiVersion: instagram.apiVersion,
    redirectUri: CONFIG.redirectUri,
    defaultScopes: instagram.scopes,
    hasAppSecret: CONFIG.appSecret !== 'PASTE_APP_SECRET_HERE' && Boolean(CONFIG.appSecret),
    hasVerifyToken: Boolean(CONFIG.verifyToken),
    hasInitialAccessToken: Boolean(CONFIG.initialAccessToken),
    allowShortLivedToken: CONFIG.allowShortLivedToken,
  });
});

app.get('/routes', (_req, res) => {
  res.json(
    ROUTES.flatMap((section) =>
      section.items.map(([method, path_, description]) => ({
        group: section.group,
        method,
        path: path_,
        description,
      }))
    )
  );
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
app.get('/auth/login', (req, res) => {
  const authUrl = instagram.getAuthUrl({ state: String(req.query.state || 'mini-api') });
  res.redirect(authUrl);
});

app.get('/auth/url', (req, res) => {
  const scopes = parseCsv(req.query.scopes);
  const authUrl = instagram.getAuthUrl({
    ...(req.query.state && { state: String(req.query.state) }),
    ...(scopes.length && { scopes }),
  });
  res.json({ authUrl });
});

app.get(
  '/auth/callback',
  asyncHandler(async (req, res) => {
    if (!req.query.code) {
      throw new ValidationError('Missing OAuth "code" query parameter', 'code');
    }
    const userId = await instagram.authenticate(String(req.query.code));
    res.json({ userId, authenticated: true });
  })
);

app.post(
  '/auth/token',
  asyncHandler(async (req, res) => {
    const { accessToken, userId, expiresAt } = req.body || {};
    if (!accessToken) {
      throw new ValidationError('accessToken is required', 'accessToken');
    }

    instagram.setAccessToken(String(accessToken));

    if (userId) {
      await tokenStorage.set(String(userId), {
        accessToken: String(accessToken),
        tokenType: 'Bearer',
        expiresAt: Number(expiresAt) || Math.floor(Date.now() / 1000) + 5184000,
        userId: String(userId),
      });
    }

    res.json({ success: true, stored: Boolean(userId) });
  })
);

app.post(
  '/auth/user',
  asyncHandler(async (req, res) => {
    const userId = req.body && req.body.userId;
    if (!userId) {
      throw new ValidationError('userId is required', 'userId');
    }
    await instagram.setUser(String(userId));
    res.json({ success: true, userId: String(userId) });
  })
);

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------
app.get(
  '/media',
  asyncHandler(async (req, res) => {
    res.json(await instagram.media.list(toLimit(req.query.limit), strOrUndefined(req.query.after)));
  })
);

app.get(
  '/media/:mediaId',
  asyncHandler(async (req, res) => {
    res.json(await instagram.media.get(req.params.mediaId));
  })
);

app.get(
  '/media/:mediaId/insights',
  asyncHandler(async (req, res) => {
    res.json(await instagram.media.getInsights(req.params.mediaId));
  })
);

app.get(
  '/media/:mediaId/children',
  asyncHandler(async (req, res) => {
    res.json(await instagram.media.getChildren(req.params.mediaId));
  })
);

app.get(
  '/media/:mediaId/comments',
  asyncHandler(async (req, res) => {
    res.json(
      await instagram.comments.list(
        req.params.mediaId,
        toLimit(req.query.limit),
        strOrUndefined(req.query.after)
      )
    );
  })
);

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------
app.get(
  '/comments/:commentId',
  asyncHandler(async (req, res) => {
    res.json(await instagram.comments.get(req.params.commentId));
  })
);

app.get(
  '/comments/:commentId/replies',
  asyncHandler(async (req, res) => {
    res.json(await instagram.comments.getReplies(req.params.commentId, toLimit(req.query.limit)));
  })
);

app.post(
  '/comments/:commentId/replies',
  asyncHandler(async (req, res) => {
    res.json(
      await instagram.comments.reply({
        commentId: req.params.commentId,
        message: String((req.body && req.body.message) || ''),
      })
    );
  })
);

app.post(
  '/comments/:commentId/hide',
  asyncHandler(async (req, res) => {
    res.json(await instagram.comments.hide(req.params.commentId));
  })
);

app.post(
  '/comments/:commentId/unhide',
  asyncHandler(async (req, res) => {
    res.json(await instagram.comments.unhide(req.params.commentId));
  })
);

app.delete(
  '/comments/:commentId',
  asyncHandler(async (req, res) => {
    res.json(await instagram.comments.delete(req.params.commentId));
  })
);

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
app.post(
  '/messages/text',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    res.json(await instagram.messages.sendText(String(body.recipientId || ''), String(body.text || '')));
  })
);

app.post(
  '/messages/image',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    res.json(
      await instagram.messages.sendImage(String(body.recipientId || ''), String(body.imageUrl || ''))
    );
  })
);

app.post(
  '/messages/video',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    res.json(
      await instagram.messages.sendVideo(String(body.recipientId || ''), String(body.videoUrl || ''))
    );
  })
);

app.post(
  '/messages/:messageId/read',
  asyncHandler(async (req, res) => {
    res.json(await instagram.messages.markAsRead(req.params.messageId));
  })
);

app.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    res.json(await instagram.messages.getConversations(toLimit(req.query.limit)));
  })
);

app.get(
  '/conversations/:conversationId/messages',
  asyncHandler(async (req, res) => {
    res.json(
      await instagram.messages.getMessages(req.params.conversationId, toLimit(req.query.limit))
    );
  })
);

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------
app.get('/webhook', (req, res) => {
  const challenge = webhook.handleVerification({
    'hub.mode': String(req.query['hub.mode'] || ''),
    'hub.verify_token': String(req.query['hub.verify_token'] || ''),
    'hub.challenge': String(req.query['hub.challenge'] || ''),
  });

  if (!challenge) {
    return res.status(403).json({ error: 'Webhook verification failed' });
  }

  res.type('text/plain').send(challenge);
});

app.post('/webhook', (req, res, next) => {
  try {
    const payload = req.rawBody ? req.rawBody.toString('utf8') : '';
    const signature = String(req.headers['x-hub-signature-256'] || '');
    webhook.processEvent(payload, signature);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// 404 + centralized error handling
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', method: req.method, path: req.path });
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, _next) => {
  const status = statusForError(error);
  const body = {
    error: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : 'Unexpected error',
  };

  if (error instanceof ValidationError && error.field) {
    body.field = error.field;
  }
  if (error instanceof RateLimitError && error.retryAfter) {
    res.set('Retry-After', String(error.retryAfter));
    body.retryAfter = error.retryAfter;
  }
  if (error instanceof ApiError) {
    body.code = error.code;
    body.type = error.type;
    if (error.fbtraceId) {
      body.fbtraceId = error.fbtraceId;
    }
  }

  // Surface the real upstream cause (e.g. the Graph API rejection hidden inside
  // an AuthenticationError) instead of only the SDK's generic message.
  const upstream = upstreamDetail(error);
  if (upstream) {
    body.upstream = upstream;
  }

  console.error(
    `[error] ${req.method} ${req.path} -> ${status} ${body.error}: ${body.message}` +
      (upstream ? ` | upstream ${JSON.stringify(upstream)}` : '')
  );

  res.status(status).json(body);
});

app.listen(CONFIG.port, () => {
  console.log(`Instagram SDK mini API listening on http://localhost:${CONFIG.port}`);
  console.log(`OAuth callback URL: ${CONFIG.redirectUri}`);
  if (CONFIG.appSecret === 'PASTE_APP_SECRET_HERE' || !CONFIG.appSecret) {
    console.warn('Warning: INSTAGRAM_APP_SECRET is not set. Copy .env.example to .env before authenticating.');
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Forward async route errors to the centralized error handler. */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** Map SDK error types to HTTP status codes. */
function statusForError(error) {
  if (error instanceof ValidationError) return 400;
  if (error instanceof AuthenticationError) return 401;
  if (error instanceof WebhookVerificationError) return 403;
  if (error instanceof RateLimitError) return 429;
  if (error instanceof ApiError) return 502; // upstream Graph API rejected the call
  return 500;
}

/**
 * Pull the real upstream failure out of an SDK error. AuthenticationError wraps
 * the original axios error in `.originalError`; axios errors carry the HTTP
 * response (status + body) from Instagram/Meta, which holds the actual reason.
 */
function upstreamDetail(error) {
  const axiosLike = (error && error.originalError) || error;
  if (!axiosLike || typeof axiosLike !== 'object') return undefined;

  if (axiosLike.response) {
    return { status: axiosLike.response.status, body: axiosLike.response.data };
  }
  if (axiosLike.code || axiosLike.message) {
    return { code: axiosLike.code, message: axiosLike.message };
  }
  return undefined;
}

/** Coerce a query value to a positive integer, with a fallback. */
function toLimit(value, fallback = 25) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Return a trimmed string or undefined (for optional query params). */
function strOrUndefined(value) {
  return value ? String(value) : undefined;
}

/** Parse a comma-separated query value into a clean array. */
function parseCsv(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Minimal .env loader. Existing process.env values take precedence. */
function loadEnv(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return; // no .env file present; rely on the real environment
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
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

// Shared HTML styling and legal-page content -------------------------------
const LEGAL_CONTACT = process.env.LEGAL_CONTACT_EMAIL || 'you@example.com';
const LEGAL_UPDATED = process.env.LEGAL_UPDATED || '2026-01-01';

const PAGE_STYLE = `<style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      max-width: 880px; margin: 0 auto; padding: 2rem 1.25rem; line-height: 1.5;
    }
    h1 { margin-bottom: 0.25rem; }
    p.lead { margin-top: 0; color: #6b7280; }
    a.cta {
      display: inline-block; margin: 0.5rem 0 1.5rem; padding: 0.6rem 1rem;
      background: #4f46e5; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600;
    }
    a.back { color: #4f46e5; text-decoration: none; font-size: 0.9rem; }
    h2 { margin: 1.75rem 0 0.5rem; font-size: 1.05rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid #e5e7eb33; vertical-align: top; }
    th { color: #6b7280; font-weight: 600; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .method { font-size: 0.72rem; font-weight: 700; padding: 0.1rem 0.4rem; border-radius: 5px; color: #fff; }
    .method.get { background: #2563eb; }
    .method.post { background: #16a34a; }
    .method.delete { background: #dc2626; }
    .note { color: #6b7280; font-size: 0.85rem; }
    footer { margin-top: 2.5rem; color: #6b7280; font-size: 0.8rem; }
  </style>`;

/** Render the HTML landing page from the route catalog. */
function renderIndex() {
  const sections = ROUTES.map((section) => {
    const rows = section.items
      .map(
        ([method, path_, description]) => `
          <tr>
            <td><span class="method ${method.toLowerCase()}">${method}</span></td>
            <td><code>${path_}</code></td>
            <td>${description}</td>
          </tr>`
      )
      .join('');

    return `
      <h2>${section.group}</h2>
      <table>
        <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Instagram SDK mini API</title>
  ${PAGE_STYLE}
</head>
<body>
  <h1>Instagram SDK mini API</h1>
  <p class="lead">Example Express server for <code>@felipeequaresma/instagram-api-sdk</code>.</p>
  <a class="cta" href="/auth/login">Connect Instagram &rarr;</a>
  ${sections}
  <footer><a class="back" href="/terms">Terms</a> &middot; <a class="back" href="/privacy">Privacy</a></footer>
</body>
</html>`;
}

/** Wrap legal/document content in the shared page shell. */
function renderLegalPage(title, contentHtml) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} - Instagram SDK mini API</title>
  ${PAGE_STYLE}
</head>
<body>
  <a class="back" href="/">&larr; Back</a>
  <h1>${title}</h1>
  <p class="note">
    This is a placeholder document for the example app. Replace it with your own
    legal text, reviewed by a professional, before using it in production.
  </p>
  ${contentHtml}
  <footer>Instagram SDK mini API &middot; example application</footer>
</body>
</html>`;
}

/** Boilerplate Terms of Service body. */
function termsHtml() {
  return `
  <p class="note">Last updated: ${LEGAL_UPDATED}</p>

  <h2>1. Acceptance of terms</h2>
  <p>By accessing or using this application ("the Service") you agree to be bound by
  these Terms of Service. If you do not agree, do not use the Service.</p>

  <h2>2. Description of the service</h2>
  <p>The Service is an example application that integrates with the Instagram Graph
  API to read media and comments and to send and receive messages on behalf of
  accounts that explicitly authorize it.</p>

  <h2>3. Use of the Meta / Instagram platform</h2>
  <p>Your use of Instagram and Meta features through the Service is also subject to
  the <a href="https://www.instagram.com/legal/terms/">Instagram Terms</a> and the
  Meta Platform Terms. You are responsible for complying with all applicable
  platform policies.</p>

  <h2>4. User responsibilities</h2>
  <p>You agree to use the Service only for lawful purposes, to provide accurate
  credentials, and not to abuse, reverse engineer, or disrupt the Service or the
  underlying platforms.</p>

  <h2>5. Disclaimer</h2>
  <p>The Service is provided "as is" and "as available", without warranties of any
  kind, express or implied, including fitness for a particular purpose.</p>

  <h2>6. Limitation of liability</h2>
  <p>To the maximum extent permitted by law, the operators of the Service are not
  liable for any indirect, incidental, or consequential damages arising from your
  use of the Service.</p>

  <h2>7. Changes</h2>
  <p>These terms may be updated at any time. Continued use of the Service after
  changes constitutes acceptance of the updated terms.</p>

  <h2>8. Contact</h2>
  <p>Questions about these terms can be sent to
  <a href="mailto:${LEGAL_CONTACT}">${LEGAL_CONTACT}</a>.</p>`;
}

/** Boilerplate Privacy Policy body. */
function privacyHtml() {
  return `
  <p class="note">Last updated: ${LEGAL_UPDATED}</p>

  <h2>1. Information we collect</h2>
  <p>When you connect an Instagram account, the Service accesses data through the
  Instagram Graph API, which may include your account profile, media, comments, and
  direct messages, together with the access token issued by Meta.</p>

  <h2>2. How we use information</h2>
  <p>Information is used solely to provide the Service's features: reading media and
  comments and sending or receiving messages that you request. We do not sell your
  data.</p>

  <h2>3. Data sharing</h2>
  <p>Data is exchanged only with Meta / Instagram APIs to fulfill your requests. We
  do not share your data with unrelated third parties.</p>

  <h2>4. Data retention</h2>
  <p>This example stores tokens only in memory and discards them when the process
  stops. A production deployment should document its own retention policy.</p>

  <h2>5. Data deletion</h2>
  <p>You may revoke access at any time from your Instagram account settings. To
  request deletion of any data held by the Service, contact
  <a href="mailto:${LEGAL_CONTACT}">${LEGAL_CONTACT}</a>.</p>

  <h2>6. Cookies</h2>
  <p>The Service does not use tracking cookies.</p>

  <h2>7. Children's privacy</h2>
  <p>The Service is not directed to children under 13 (or the minimum age required in
  your jurisdiction) and does not knowingly collect their data.</p>

  <h2>8. Changes</h2>
  <p>This policy may be updated periodically. Material changes will be reflected by
  the "last updated" date above.</p>

  <h2>9. Contact</h2>
  <p>Privacy questions can be sent to
  <a href="mailto:${LEGAL_CONTACT}">${LEGAL_CONTACT}</a>.</p>`;
}
