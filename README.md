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
  const payload = JSON.stringify(req.body);

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
- `examples/database-integration.ts`
- `examples/custom-config.ts`

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
