# Webhooks Guide

Set up and handle Instagram webhook events with signature verification.

## Overview

Webhooks allow your application to receive real-time notifications for events like:

- New messages
- Message reactions
- Comments on media
- @mentions in comments/captions
- Story insights

## Setup

### 1. Create Webhook Handler

```typescript
import { InstagramClient } from '@felipeequaresma/instagram-api-sdk';

const instagram = new InstagramClient({
  appId: 'YOUR_APP_ID',
  appSecret: 'YOUR_APP_SECRET',
});

const webhook = instagram.createWebhookHandler('YOUR_VERIFY_TOKEN');
```

### 2. Implement Verification Endpoint

Instagram requires a GET endpoint for webhook verification:

```typescript
app.get('/webhook', (req, res) => {
  const challenge = webhook.handleVerification(req.query);
  
  if (challenge) {
    res.send(challenge);
  } else {
    res.sendStatus(403);
  }
});
```

### 3. Implement Event Endpoint

Handle POST requests with webhook events:

```typescript
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
```

## Event Handlers

### Messages

Receive new direct messages:

```typescript
webhook.on('messages', (event) => {
  console.log('New message from:', event.sender.id);
  console.log('Message:', event.message?.text);
  
  // Auto-reply example
  if (event.message?.text) {
    instagram.setUser(event.recipient.id);
    instagram.messages.sendText(
      event.sender.id,
      'Thanks for your message!'
    );
  }
});
```

### Message Reactions

Receive message reactions:

```typescript
webhook.on('message_reactions', (event) => {
  console.log('Reaction:', event.reaction?.emoji);
  console.log('Action:', event.reaction?.action); // 'react' or 'unreact'
});
```

### Comments

Receive new comments on your media:

```typescript
webhook.on('comments', (change) => {
  const comment = change.value;
  console.log('New comment:', comment);
  
  // Auto-reply to comments
  instagram.comments.reply({
    commentId: comment.id,
    message: 'Thanks for commenting!',
  });
});
```

### Mentions

Receive @mentions in comments or captions:

```typescript
webhook.on('mentions', (change) => {
  const mention = change.value;
  console.log('Mentioned in:', mention);
});
```

### Story Insights

Receive story metrics after expiry:

```typescript
webhook.on('story_insights', (change) => {
  const insights = change.value;
  console.log('Story insights:', insights);
});
```

## Signature Verification

The SDK automatically verifies webhook signatures using HMAC-SHA256:

```typescript
// Signature verification happens automatically in processEvent()
webhook.processEvent(payload, signature);
// Throws WebhookVerificationError if signature is invalid
```

## Event Deduplication

The SDK automatically deduplicates events to prevent processing the same event multiple times:

```typescript
// Events are deduplicated based on timestamp and sender ID
// No additional code needed
```

## Configuration in Meta App Dashboard

1. Go to your app in [Meta for Developers](https://developers.facebook.com/apps)
2. Add "Webhooks" product
3. Configure Instagram webhooks:
   - **Callback URL**: Your public HTTPS endpoint
   - **Verify Token**: Same token used in `createWebhookHandler()`
4. Subscribe to fields:
   - `messages`
   - `message_reactions`
   - `comments`
   - `mentions`
   - `story_insights`

## Testing Locally

Use [ngrok](https://ngrok.com) to expose your local server:

```bash
# Start your webhook server
node examples/webhook-server.js

# In another terminal, start ngrok
ngrok http 3000

# Use the ngrok HTTPS URL in Meta App Dashboard
# Example: https://abc123.ngrok.io/webhook
```

## Production Considerations

1. **Use HTTPS** - Webhooks require HTTPS in production
2. **Respond quickly** - Respond with 200 OK within 20 seconds
3. **Process asynchronously** - Queue events for background processing
4. **Handle retries** - Meta retries failed deliveries
5. **Monitor errors** - Log and alert on webhook failures

## Complete Example

See [examples/webhook-server.ts](../examples/webhook-server.ts) for a complete Express server with all event handlers.

## Error Handling

```typescript
try {
  webhook.processEvent(payload, signature);
} catch (error) {
  if (error instanceof WebhookVerificationError) {
    console.error('Invalid signature:', error.message);
  }
}
```

## Advanced: Custom Event Processing

```typescript
// Clear processed events cache if needed
webhook.clearProcessedEvents();

// Access raw event data
webhook.on('messages', (event) => {
  console.log('Raw event:', JSON.stringify(event, null, 2));
});
```
