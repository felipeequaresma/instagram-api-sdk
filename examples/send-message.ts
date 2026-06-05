import { InstagramClient } from './../src/index';

/**
 * Example: Send direct messages
 */

async function main() {
  const instagram = new InstagramClient({
    appId: process.env.INSTAGRAM_APP_ID!,
    appSecret: process.env.INSTAGRAM_APP_SECRET!,
  });

  // Send text message (user context already set by authenticate)
  console.log('📤 Sending message...');
  const result = await instagram.messages.sendText(recipientId, message);
  console.log('✅ Message sent!');
  console.log(`📨 Message ID: ${result.messageId}`);

  // Send image (example)
  // await instagram.messages.sendImage(
  //   recipientId,
  //   'https://example.com/image.jpg'
  // );

  // Get conversations
  console.log('\n💬 Fetching conversations...');
  const conversations = await instagram.messages.getConversations(5);
  console.log(`Found ${conversations.data.length} conversations`);
}

main().catch(console.error);
