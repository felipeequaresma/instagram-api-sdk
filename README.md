# Instagram API SDK

Enterprise-grade TypeScript SDK for Instagram Graph API with authentication, automatic token refresh, messaging, comments, and webhooks.

[![npm version](https://img.shields.io/npm/v/@felipeequaresma/instagram-api-sdk.svg)](https://www.npmjs.com/package/@felipeequaresma/instagram-api-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- 🔐 **Complete OAuth Flow** - Authorization URL generation, token exchange, and automatic refresh
- 🔄 **Automatic Token Management** - Short-to-long token exchange and auto-refresh 7 days before expiry
- 💬 **Direct Messages** - Send text, images, videos, and manage conversations
- 💭 **Comments API** - List, reply, hide/unhide, and delete comments
- 📸 **Media API** - Retrieve user media, insights, and carousel children
- 🪝 **Webhooks** - Type-safe event handlers with signature verification
- 🛡️ **Type-Safe** - Full TypeScript support with comprehensive type definitions
- ⚡ **Rate Limiting** - Automatic rate limiting with token bucket algorithm
- 🔁 **Retry Logic** - Exponential backoff for transient errors
- 🔌 **Pluggable Storage** - Custom token storage implementations

## 📦 Installation

```bash
npm install @felipeequaresma/instagram-api-sdk
```

## 🚀 Quick Start

```typescript
import { InstagramClient } from '@felipeequaresma/instagram-api-sdk';


// 4. Use the API
await instagram.messages.sendText('recipient_id', 'Hello from SDK!');
const comments = await instagram.comments.list('media_id');
const media = await instagram.media.list();
```

## 📖 Documentation

### Authentication

#### OAuth Flow

```typescript
// Step 1: Generate authorization URL
const authUrl = instagram.getAuthUrl([
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
], 'optional_state_parameter');

// Step 2: Redirect user to authUrl
// User authorizes your app and is redirected back with a code

// Step 3: Exchange code for long-lived token
const userId = await instagram.authenticate(code);
// Token is automatically saved and will be refreshed 7 days before expiry
```

#### Manual Token Management

```typescript
// Set access token directly
instagram.setAccessToken('your_access_token');

// Access auth manager for advanced operations
const tokenInfo = await instagram.auth.introspectToken(accessToken);
const refreshed = await instagram.auth.refreshToken(accessToken);
```

### Direct Messages

```typescript
// Send text message
await instagram.messages.sendText('recipient_id', 'Hello!');

// Send image
await instagram.messages.sendImage('recipient_id', 'https://example.com/image.jpg');

// Send video
await instagram.messages.sendVideo('recipient_id', 'https://example.com/video.mp4');

// Get conversations
const conversations = await instagram.messages.getConversations(25);

// Get messages in a conversation
const messages = await instagram.messages.getMessages('conversation_id', 25);

// Mark message as read
await instagram.messages.markAsRead('message_id');
```

**Note:** You can only send messages within a 24-hour window after the user initiates the conversation.

### Comments

```typescript
// List comments on media
const comments = await instagram.comments.list('media_id', 25);

// Get a specific comment
const comment = await instagram.comments.get('comment_id');

// Get replies to a comment
const replies = await instagram.comments.getReplies('comment_id', 25);

// Reply to a comment
await instagram.comments.reply({
  commentId: 'comment_id',
  message: 'Thanks for your comment!',
});

// Hide/unhide a comment
await instagram.comments.hide('comment_id');
await instagram.comments.unhide('comment_id');

// Delete a comment
await instagram.comments.delete('comment_id');
```

### Media

```typescript
// Get user's media
const media = await instagram.media.list(25);

// Get specific media
const post = await instagram.media.get('media_id');

// Get media insights
const insights = await instagram.media.getInsights('media_id');
// Returns: { impressions, reach, engagement, saved }

// Get carousel children
const children = await instagram.media.getChildren('carousel_media_id');
```

### Webhooks

```typescript
// Create webhook handler
const webhook = instagram.createWebhookHandler('YOUR_VERIFY_TOKEN');

// Handle verification challenge (for webhook setup)
app.get('/webhook', (req, res) => {
  const challenge = webhook.handleVerification(req.query);
  if (challenge) {
    res.send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Handle webhook events
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const payload = JSON.stringify(req.body);
  
  try {
    webhook.processEvent(payload, signature);
    res.sendStatus(200);
  } catch (error) {
    res.sendStatus(403);
  }
});

// Listen to events
webhook.on('messages', (event) => {
  console.log('New message:', event.message);
});

webhook.on('comments', (change) => {
  console.log('New comment:', change.value);
});

webhook.on('mentions', (change) => {
  console.log('New mention:', change.value);
});
```

## 🔧 Configuration

```typescript
const instagram = new InstagramClient({
  appId: 'YOUR_APP_ID',              // Required
  appSecret: 'YOUR_APP_SECRET',      // Required
  redirectUri: 'YOUR_REDIRECT_URI',  // Optional, default: http://localhost:3000/auth/callback
  tokenStorage: new FileTokenStorage('./tokens.json'), // Optional, default: FileTokenStorage
  debug: true,                       // Optional, enables debug logging
  timeout: 30000,                    // Optional, HTTP timeout in ms
  rateLimit: 200,                    // Optional, requests per hour
});
```

### Custom Token Storage

Implement the `ITokenStorage` interface for custom storage (database, Redis, etc.):

```typescript
import { ITokenStorage, TokenData } from '@felipeequaresma/instagram-api-sdk';

class DatabaseTokenStorage implements ITokenStorage {
  async get(userId: string): Promise<TokenData | null> {
    // Fetch from database
  }
  
  async set(userId: string, token: TokenData): Promise<void> {
    // Save to database
  }
  
  async delete(userId: string): Promise<void> {
    // Delete from database
  }
}

const instagram = new InstagramClient({
  appId: 'YOUR_APP_ID',
  appSecret: 'YOUR_APP_SECRET',
  tokenStorage: new DatabaseTokenStorage(),
});
```

## 🎯 API Reference

See the [docs](./docs) folder for detailed API documentation:

- [Authentication](./docs/authentication.md) - OAuth flow and token management
- [Messages](./docs/messages.md) - Direct messaging API
- [Comments](./docs/comments.md) - Comments management
- [Webhooks](./docs/webhooks.md) - Webhook setup and event handling

## 📋 Requirements

- Node.js >= 18.0.0
- Instagram Business or Creator account
- Facebook App with Instagram Graph API access

## 🔒 Instagram API Limitations

- **DMs**: Can only send messages within 24-hour window after user initiates conversation
- **Account Types**: Requires Instagram Business/Creator account (not personal accounts)
- **Rate Limits**: 200 calls/user/hour (general), up to 100 calls/sec for messaging
- **Webhooks**: Require HTTPS endpoint for production use

## 🧪 Examples

Check the [examples](./examples) folder for complete working examples:

- `basic-auth.ts` - OAuth flow example
- `send-message.ts` - DM sending example
- `fetch-comments.ts` - Comments retrieval
- `webhook-server.ts` - Complete webhook server with Express

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT © Felipe Quaresma

## 🙏 Acknowledgments

Built with ❤️ using the [Instagram Graph API](https://developers.facebook.com/docs/instagram-api)
