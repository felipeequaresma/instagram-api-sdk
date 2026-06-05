import { InstagramClient } from './../src/index';

/**
 * Example: Fetch and manage comments
 */

async function main() {
  const instagram = new InstagramClient({
    appId: process.env.INSTAGRAM_APP_ID!,
    appSecret: process.env.INSTAGRAM_APP_SECRET!,
  });

  // Set user context
  const userId = process.env.INSTAGRAM_USER_ID!;
  await instagram.setUser(userId);

  const mediaId = process.argv[2];
  if (!mediaId) {
    console.error('Usage: node fetch-comments.js <media_id>');
    process.exit(1);
  }

  // Fetch comments
  console.log('💭 Fetching comments...');
  const comments = await instagram.comments.list(mediaId, 25);
  
  console.log(`\n✅ Found ${comments.data.length} comments:\n`);
  
  for (const comment of comments.data) {
    console.log(`👤 ${comment.from.username}:`);
    console.log(`   ${comment.text}`);
    console.log(`   ❤️  ${comment.likeCount} likes | 🕐 ${comment.timestamp}`);
    console.log(`   Hidden: ${comment.hidden ? 'Yes' : 'No'}`);
    console.log('');

    // Get replies if any
    if (comment.replies && comment.replies.length > 0) {
      const replies = await instagram.comments.getReplies(comment.id);
      console.log(`   💬 ${replies.data.length} replies`);
    }
  }

  // Example: Reply to first comment
  if (comments.data.length > 0) {
    const firstComment = comments.data[0];
    console.log('\n📝 Replying to first comment...');
    
    const reply = await instagram.comments.reply({
      commentId: firstComment.id,
      message: 'Thanks for your comment! 🙏',
    });
    
    console.log(`✅ Reply posted! Comment ID: ${reply.commentId}`);
  }
}

main().catch(console.error);
