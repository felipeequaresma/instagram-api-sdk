# Instagram API SDK

TypeScript SDK for the Instagram Graph API. The package provides OAuth helpers,
token storage, automatic long-lived token refresh, direct messages, comments,
media access, webhook handling, rate limiting, retries, and typed errors.

## Requirements

- Node.js 18 or later
- Instagram Business or Creator account
- Meta app configured with Instagram Graph API access
- App ID and app secret from Meta for Developers

## Installation

```bash
npm install @felipeequaresma/instagram-api-sdk
```

## Basic Usage

```typescript
import { InstagramClient } from '@felipeequaresma/instagram-api-sdk';

const instagram = new InstagramClient({
  appId: process.env.INSTAGRAM_APP_ID!,
  appSecret: process.env.INSTAGRAM_APP_SECRET!,
  redirectUri: 'https://example.com/auth/callback',
});

const authUrl = instagram.getAuthUrl({
  state: 'csrf-state',
});

// Redirect the user to authUrl. After the callback:
const userId = await instagram.authenticate(codeFromCallback);

await instagram.messages.sendText('recipient_id', 'Message text');
const comments = await instagram.comments.list('media_id');
const media = await instagram.media.list();
```

## Client Configuration

```typescript
import {
  FileTokenStorage,
  InstagramClient,
} from '@felipeequaresma/instagram-api-sdk';

const instagram = new InstagramClient({
  appId: 'META_APP_ID',
  appSecret: 'META_APP_SECRET',
  redirectUri: 'https://example.com/auth/callback',
  tokenStorage: new FileTokenStorage('./tokens.json'),
  debug: false,
  timeout: 30000,
  rateLimit: 200,
  apiVersion: 'v21.0',
  defaultScopes: [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
    'instagram_business_content_publish',
  ],
});
```

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `appId` | Yes | None | Meta app ID. |
| `appSecret` | Yes | None | Meta app secret. |
| `redirectUri` | No | `http://localhost:3000/auth/callback` | OAuth callback URL. |
| `tokenStorage` | No | `FileTokenStorage('./tokens.json')` | Token persistence adapter. |
| `debug` | No | `false` | Enables SDK debug logs. |
| `timeout` | No | `30000` | HTTP timeout in milliseconds. |
| `rateLimit` | No | `200` | Requests per hour used by the local rate limiter. |
| `apiVersion` | No | `v21.0` | Instagram Graph API version. |
| `defaultScopes` | No | SDK default scopes | OAuth scopes used by `getAuthUrl()`. |
| `onTokenGenerated` | No | None | Callback called after token generation. |

## Authentication

### Generate an Authorization URL

```typescript
const authUrl = instagram.getAuthUrl({
  scopes: [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
  ],
  state: 'csrf-state',
});
```

If `scopes` is omitted, the client uses the configured `defaultScopes`.

### Exchange the Callback Code

```typescript
const userId = await instagram.authenticate(codeFromCallback);
```

`authenticate()` performs the short-lived token exchange, converts it to a
long-lived token, stores it through the configured token storage, schedules
automatic refresh, and sets the authenticated user as the active API context.

To authenticate without setting the active context:

```typescript
const userId = await instagram.authenticate(codeFromCallback, false);
```

### Use an Existing Token

```typescript
instagram.setAccessToken('long_lived_access_token');
```

Or load a stored token by user ID:

```typescript
await instagram.setUser('instagram_user_id');
```

### Advanced Auth Operations

```typescript
const tokenInfo = await instagram.auth.introspectToken(accessToken);
const refreshed = await instagram.auth.refreshToken(accessToken);
```

## API Modules

### Direct Messages

```typescript
await instagram.messages.sendText('recipient_id', 'Hello');
await instagram.messages.sendImage('recipient_id', 'https://example.com/image.jpg');
await instagram.messages.sendVideo('recipient_id', 'https://example.com/video.mp4');

const conversations = await instagram.messages.getConversations(25);
const messages = await instagram.messages.getMessages('conversation_id', 25);
await instagram.messages.markAsRead('message_id');
```

Instagram messaging rules still apply. In most cases, business accounts can only
send direct messages inside the allowed response window after the user initiates
the conversation.

### Comments

```typescript
const comments = await instagram.comments.list('media_id', 25);
const comment = await instagram.comments.get('comment_id');
const replies = await instagram.comments.getReplies('comment_id', 25);

await instagram.comments.reply({
  commentId: 'comment_id',
  message: 'Reply text',
});

await instagram.comments.hide('comment_id');
await instagram.comments.unhide('comment_id');
await instagram.comments.delete('comment_id');
```

### Media

```typescript
const media = await instagram.media.list(25);
const post = await instagram.media.get('media_id');
const insights = await instagram.media.getInsights('media_id');
const children = await instagram.media.getChildren('carousel_media_id');
```

`getInsights()` returns:

```typescript
{
  impressions: number;
  reach: number;
  engagement: number;
  saved: number;
}
```

## Webhooks

```typescript
const webhook = instagram.createWebhookHandler('VERIFY_TOKEN');

// Capture the raw body so webhook signatures verify. Meta signs the exact bytes
// it sends, so JSON.stringify(req.body) would not match the computed signature.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

app.get('/webhook', (req, res) => {
  const challenge = webhook.handleVerification(req.query);
  if (!challenge) {
    res.sendStatus(403);
    return;
  }

  res.send(challenge);
});

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const payload =
    (req as express.Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ?? '';

  try {
    webhook.processEvent(payload, String(signature || ''));
    res.sendStatus(200);
  } catch {
    res.sendStatus(403);
  }
});

webhook.on('messages', (event) => {
  console.log(event.message);
});

webhook.on('message_reactions', (event) => {
  console.log(event.reaction);
});

webhook.on('comments', (change) => {
  console.log(change.value);
});

webhook.on('mentions', (change) => {
  console.log(change.value);
});

webhook.on('story_insights', (change) => {
  console.log(change.value);
});
```

`processEvent()` verifies the `x-hub-signature-256` signature with the app secret
and throws `WebhookVerificationError` when verification fails.

## Token Storage

The SDK includes file-based and in-memory storage adapters:

```typescript
import {
  FileTokenStorage,
  MemoryTokenStorage,
} from '@felipeequaresma/instagram-api-sdk';
```

For production, implement `ITokenStorage` and persist tokens in your database or
secret storage.

```typescript
import type {
  ITokenStorage,
  TokenData,
} from '@felipeequaresma/instagram-api-sdk';

class DatabaseTokenStorage implements ITokenStorage {
  async get(userId: string): Promise<TokenData | null> {
    return loadTokenFromDatabase(userId);
  }

  async set(userId: string, token: TokenData): Promise<void> {
    await saveTokenToDatabase(userId, token);
  }

  async delete(userId: string): Promise<void> {
    await deleteTokenFromDatabase(userId);
  }
}
```

Tokens should be encrypted at rest and should not be committed to version
control.

## Errors

The package exports typed errors:

```typescript
import {
  ApiError,
  AuthenticationError,
  NetworkError,
  RateLimitError,
  ValidationError,
  WebhookVerificationError,
} from '@felipeequaresma/instagram-api-sdk';
```

Example:

```typescript
try {
  await instagram.authenticate(codeFromCallback);
} catch (error) {
  if (error instanceof AuthenticationError) {
    // Invalid code, expired code, or token exchange failure.
  }

  throw error;
}
```

## API Limitations

- Personal Instagram accounts are not supported by the Instagram Graph API.
- Production webhook endpoints must use HTTPS.
- Messaging, comment, media, and insight operations require the corresponding
  scopes and Meta app permissions.
- Instagram and Meta rate limits still apply. The SDK rate limiter only controls
  local request pacing.

## Examples

The `examples` directory contains runnable examples:

- `examples/basic-auth.ts`
- `examples/send-message.ts`
- `examples/fetch-comments.ts`
- `examples/webhook-server.ts`
- `examples/mini-api.js` (and `mini-api.smoke.mjs`, `tunnel.mjs`)
- `examples/database-integration.ts`
- `examples/custom-config.ts`

## Mini API (Express)

The repository includes a small [Express](https://expressjs.com/) app for testing
the SDK against real Instagram credentials with plain `curl` or a browser. The
source lives in `examples/mini-api.js`.

Configuration is read from environment variables (see `.env.example`); copy it to
`.env` and fill in your credentials:

```bash
cp .env.example .env
```

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port. |
| `INSTAGRAM_APP_ID` | demo id | Meta app ID. |
| `INSTAGRAM_APP_SECRET` | _placeholder_ | Meta app secret. Required to authenticate. |
| `INSTAGRAM_REDIRECT_URI` | `http://localhost:3000/auth/callback` | OAuth callback URL (use your ngrok URL for webhooks). |
| `WEBHOOK_VERIFY_TOKEN` | `testando` | Token configured in Meta webhooks. |
| `INSTAGRAM_ACCESS_TOKEN` | empty | Optional token to start authenticated. |
| `DEBUG` | `false` | Enables SDK debug logs. |

Real environment variables take precedence over `.env`. Never commit a real app
secret or access token (`.env` is git-ignored).

Run it locally (builds the SDK, then starts the server):

```bash
npm run mini-api
```

Or with Docker:

```bash
docker compose up --build
```

Open `http://localhost:3000` for a browsable route catalog, or hit
`GET /auth/login` to jump straight into the OAuth flow.

Available endpoints:

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | HTML landing page listing every route. |
| `GET` | `/health` | Health check. |
| `GET` | `/config` | Shows non-secret runtime configuration. |
| `GET` | `/routes` | Route catalog as JSON. |
| `GET` | `/terms` | Terms of Service page (placeholder). |
| `GET` | `/privacy` | Privacy Policy page (placeholder). |
| `GET` | `/auth/login` | Redirects straight to the Instagram OAuth screen. Optional query: `state`. |
| `GET` | `/auth/url` | Generates an OAuth URL. Optional query: `state`, `scopes` (comma-separated). |
| `GET` | `/auth/callback?code=...` | Exchanges an OAuth callback code and stores the token in memory. |
| `POST` | `/auth/token` | Sets an access token manually. Body: `accessToken`, optional `userId`, `expiresAt`. |
| `POST` | `/auth/user` | Activates a stored in-memory token. Body: `userId`. |
| `GET` | `/media` | Lists authenticated user media. Query: `limit`, `after`. |
| `GET` | `/media/:mediaId` | Gets one media object. |
| `GET` | `/media/:mediaId/insights` | Gets media insights. |
| `GET` | `/media/:mediaId/children` | Gets carousel children. |
| `GET` | `/media/:mediaId/comments` | Lists comments for a media object. Query: `limit`, `after`. |
| `GET` | `/comments/:commentId` | Gets one comment. |
| `GET` | `/comments/:commentId/replies` | Lists replies to a comment. Query: `limit`. |
| `POST` | `/comments/:commentId/replies` | Replies to a comment. Body: `message`. |
| `POST` | `/comments/:commentId/hide` | Hides a comment. |
| `POST` | `/comments/:commentId/unhide` | Unhides a comment. |
| `DELETE` | `/comments/:commentId` | Deletes a comment. |
| `POST` | `/messages/text` | Sends a text message. Body: `recipientId`, `text`. |
| `POST` | `/messages/image` | Sends an image message. Body: `recipientId`, `imageUrl`. |
| `POST` | `/messages/video` | Sends a video message. Body: `recipientId`, `videoUrl`. |
| `POST` | `/messages/:messageId/read` | Marks a message as read. |
| `GET` | `/conversations` | Lists conversations. Query: `limit`. |
| `GET` | `/conversations/:conversationId/messages` | Lists conversation messages. Query: `limit`. |
| `GET` | `/webhook` | Meta webhook verification endpoint. |
| `POST` | `/webhook` | Meta webhook event endpoint with signature verification. |

Example:

```bash
curl http://localhost:3000/health
curl "http://localhost:3000/auth/url?state=local-test"
curl "http://localhost:3000/media?limit=5"
```

### Expose it to the internet (webhooks) with localhost.run

Instagram OAuth callbacks and webhook deliveries need a public HTTPS URL.
[localhost.run](https://localhost.run) provides one through an SSH reverse tunnel
with nothing to install (it uses the `ssh` client already on your machine):

```bash
npm run mini-api:tunnel
```

This opens the tunnel, starts the mini API with `INSTAGRAM_REDIRECT_URI` already
pointed at the public URL, and prints the exact values to paste into the Meta App
Dashboard:

```text
  Public URL          https://<random>.lhr.life
  Start OAuth login   https://<random>.lhr.life/auth/login

  Paste these into the Meta App Dashboard:
    OAuth redirect URI    https://<random>.lhr.life/auth/callback
    Webhook callback URL  https://<random>.lhr.life/webhook
    Webhook verify token  <WEBHOOK_VERIFY_TOKEN>
    Privacy Policy URL    https://<random>.lhr.life/privacy
    Terms of Service URL  https://<random>.lhr.life/terms
```

Then, in the Meta App Dashboard:

1. Add the **OAuth redirect URI** under the Instagram API OAuth settings.
2. Add the **Webhook callback URL** and **verify token** under Webhooks, then
   subscribe to the `messages`, `comments`, and `mentions` fields.
3. Add the **Privacy Policy URL** (`…/privacy`) and **Terms of Service URL**
   (`…/terms`) under App Settings &rarr; Basic. The mini API serves placeholder
   pages there - replace them with your own legal text for a real app.
4. Open `…/auth/login` to authenticate, then trigger a DM or comment to see the
   webhook events stream into the terminal.

Notes:

- The free domain changes on every run. For a stable domain, register an SSH key
  with a [localhost.run account](https://admin.localhost.run) and pass your own
  command via `LOCALHOST_RUN_SSH` (for example a custom-domain `-R` form).
- `INSTAGRAM_APP_SECRET` must be set in `.env`, otherwise OAuth token exchange and
  webhook signature verification will fail for real Meta traffic.
- Equivalent manual command: `ssh -R 80:localhost:3000 localhost.run`.

### Automated smoke test

Validate routing, validation, webhook verification (challenge + signature) and the
error handler without real Instagram calls:

```bash
npm run mini-api:smoke
```

### Logs and debugging

The mini API logs every request and every error to the console (visible in the
terminal running `npm run mini-api`, or prefixed with `[server]` under
`npm run mini-api:tunnel`):

```text
[req] GET /auth/callback -> 401 (480ms)
[error] GET /auth/callback -> 401 AuthenticationError: Failed to exchange for long-lived token | upstream {"status":400,"body":{"error_type":"OAuthException","error_message":"..."}}
```

Errors that originate from Instagram/Meta also include an `upstream` field in the
JSON response with the real Graph API status and body, so the actual cause is
visible instead of only the SDK's generic message. Set `DEBUG=true` in `.env` for
verbose SDK logs (every HTTP call, token exchange step, etc.).

> **`"Unsupported request - method type: get"` (IGApiException, code 100)** on the
> long-lived token step is a misleading **Meta-side** error, not a wrong HTTP
> method - the official reference confirms the long-lived exchange is `GET`. It
> means the app or the authorizing account lacks access. Fix it in the Meta App
> Dashboard: make the Instagram account an **Instagram tester** (App roles ->
> Roles) and accept the invite in Instagram (Settings -> Apps and websites ->
> Tester invites), confirm the app uses **Instagram API with Instagram Login**
> (Basic Display was deprecated in Dec 2024), and complete **Access verification /
> App Review** to unlock advanced permissions.

While you sort out those permissions, you can keep developing with a short-lived
token: set `allowShortLivedToken: true` in the SDK config (or
`ALLOW_SHORT_LIVED_TOKEN=true` for the mini API). When the long-lived exchange
fails, the SDK keeps the short-lived token instead of throwing so the OAuth flow
completes. Important: this does **not** extend the token - Instagram controls the
real expiry, so the token still dies in ~1h and you re-authenticate. It only
avoids aborting the flow for local testing; never rely on it in production.

## Additional Guides

- [Authentication](./docs/authentication.md)
- [Token persistence and database integration](./docs/database-integration.md)
- [Webhooks](./docs/webhooks.md)

## Contributing

Contributions are handled through GitHub issues and pull requests.

- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.
- Follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) in project discussions.
- Use the issue templates for bug reports and feature requests.
- Run `npm run validate` before submitting changes.

## Development

```bash
npm ci
cp .env.example .env
npm run build
npm run type-check
npm run lint
npm test
npm run test:coverage
```

Run the complete validation pipeline:

```bash
npm run validate
```

The project enforces 100 percent coverage for statements, branches, functions,
and lines.

## Publishing

Publishing is handled by GitHub Actions through npm Trusted Publishing.

The production workflow runs:

```bash
npm ci
npm run validate
npm publish
```

Create and push a version tag to publish a new release:

```bash
npm version patch
git push --follow-tags
```

## License

MIT. See [LICENSE](./LICENSE).
