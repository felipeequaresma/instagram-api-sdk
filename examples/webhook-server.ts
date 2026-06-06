import express from 'express';
import { InstagramClient } from './../src/index';

/**
 * Example: Complete webhook server with Express
 */

const app = express();

// Parse JSON bodies while keeping the raw payload. Webhook signature
// verification must run against the exact bytes Meta sent, so re-serializing the
// parsed body (JSON.stringify(req.body)) would change the bytes and fail HMAC.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

// Initialize SDK
const instagram = new InstagramClient({
  appId: process.env.INSTAGRAM_APP_ID!,
  appSecret: process.env.INSTAGRAM_APP_SECRET!,
});

// Create webhook handler
const webhook = instagram.createWebhookHandler(process.env.WEBHOOK_VERIFY_TOKEN!);

// Webhook verification endpoint (GET)
app.get('/webhook', (req, res) => {
  console.log('📋 Webhook verification request received');
  
  const challenge = webhook.handleVerification(req.query as any);
  
  if (challenge) {
    console.log('✅ Webhook verified successfully');
    res.send(challenge);
  } else {
    console.log('❌ Webhook verification failed');
    res.sendStatus(403);
  }
});

// Webhook events endpoint (POST)
app.post('/webhook', (req, res) => {
  console.log('📨 Webhook event received');
  
  const signature = req.headers['x-hub-signature-256'] as string;
  const payload = (req as express.Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ?? '';
  
  try {
    webhook.processEvent(payload, signature);
    console.log('✅ Event processed successfully');
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Event processing failed:', error);
    res.sendStatus(403);
  }
});

// Event handlers
webhook.on('messages', async (event) => {
  console.log('\n💬 New message received:');
  console.log(`From: ${event.sender.id}`);
  console.log(`To: ${event.recipient.id}`);
  console.log(`Text: ${event.message?.text || '(no text)'}`);
  
  // Auto-reply example
  if (event.message?.text) {
    try {
      await instagram.setUser(event.recipient.id);
      await instagram.messages.sendText(
        event.sender.id,
        `Thanks for your message! You said: "${event.message.text}"`
      );
      console.log('✅ Auto-reply sent');
    } catch (error) {
      console.error('Failed to send auto-reply:', error);
    }
  }
});

webhook.on('message_reactions', (event) => {
  console.log('\n❤️  Message reaction:');
  console.log(`From: ${event.sender.id}`);
  console.log(`Action: ${event.reaction?.action}`);
  console.log(`Emoji: ${event.reaction?.emoji || 'N/A'}`);
});

webhook.on('comments', (change) => {
  console.log('\n💭 New comment:');
  console.log('Field:', change.field);
  console.log('Value:', JSON.stringify(change.value, null, 2));
});

webhook.on('mentions', (change) => {
  console.log('\n@️ New mention:');
  console.log('Field:', change.field);
  console.log('Value:', JSON.stringify(change.value, null, 2));
});

webhook.on('story_insights', (change) => {
  console.log('\n📊 Story insights:');
  console.log('Field:', change.field);
  console.log('Value:', JSON.stringify(change.value, null, 2));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Webhook server running on port ${PORT}`);
  console.log(`📍 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log('\n⚠️  For production, use HTTPS and a public URL');
  console.log('💡 Consider using ngrok for local testing: https://ngrok.com\n');
});
