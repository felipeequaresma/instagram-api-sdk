import { InstagramClient } from './../src/index';

/**
 * Example: Complete OAuth authentication flow
 */

async function main() {
  // Initialize SDK
  const instagram = new InstagramClient({
    appId: process.env.INSTAGRAM_APP_ID!,
    appSecret: process.env.INSTAGRAM_APP_SECRET!,
    redirectUri: 'http://localhost:3000/auth/callback',
    debug: true,
    defaultScopes: ['instagram_business_basic', 'instagram_business_manage_messages', 'instagram_business_manage_comments', 'instagram_business_content_publish'],
  });

  // Step 1: Generate authorization URL (uses default scopes automatically)
  const authUrl = instagram.getAuthUrl({
    state: 'random_state_string' // CSRF protection
  });

  console.log('🔗 Authorization URL:');
  console.log(authUrl);
  console.log('\n📝 Steps:');
  console.log('1. Open the URL above in your browser');
  console.log('2. Authorize the app');
  console.log('3. Copy the "code" parameter from the redirect URL');
  console.log('4. Run: node examples/basic-auth.js <code>');

  // Step 2: Exchange code for token (if code provided)
  const code = process.argv[2];
  if (code) {
    console.log('\n🔄 Exchanging code for token...');
    // authenticate() automatically sets user context by default
    const userId = await instagram.authenticate(code);
    console.log('✅ Authentication successful!');
    console.log(`👤 User ID: ${userId}`);
    console.log('💾 Token saved and will auto-refresh before expiry');
    console.log('🎯 User context set automatically - ready to use API!');

    // Step 3: Use the API immediately (no need to call setUser)
    const media = await instagram.media.list(5);
    console.log(`\n📸 Found ${media.data.length} media items`);
  }
}

main().catch(console.error);
