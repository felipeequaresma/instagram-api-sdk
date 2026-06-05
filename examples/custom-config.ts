import { InstagramClient } from './../src/index';

/**
 * Example: Using custom API version and scopes
 */

async function main() {
  // Example 1: Using default configuration (v21.0 + default scopes)
  const instagram1 = new InstagramClient({
    appId: process.env.INSTAGRAM_APP_ID!,
    appSecret: process.env.INSTAGRAM_APP_SECRET!,
  });

  console.log('📌 Default Configuration:');
  console.log(`API Version: ${instagram1.apiVersion}`);
  console.log(`Scopes: ${instagram1.scopes.join(', ')}`);

  // Example 2: Using custom API version
  const instagram2 = new InstagramClient({
    appId: process.env.INSTAGRAM_APP_ID!,
    appSecret: process.env.INSTAGRAM_APP_SECRET!,
    apiVersion: 'v19.0', // Use specific API version
  });

  console.log('\n📌 Custom API Version:');
  console.log(`API Version: ${instagram2.apiVersion}`);

  // Example 3: Using custom default scopes
  const instagram3 = new InstagramClient({
    appId: process.env.INSTAGRAM_APP_ID!,
    appSecret: process.env.INSTAGRAM_APP_SECRET!,
    defaultScopes: [
      'instagram_business_basic',
      'instagram_business_manage_messages',
      // Only messages and basic - no comments or content publish
    ],
  });

  console.log('\n📌 Custom Scopes:');
  console.log(`Scopes: ${instagram3.scopes.join(', ')}`);

  // Example 4: Both custom version and scopes
  const instagram4 = new InstagramClient({
    appId: process.env.INSTAGRAM_APP_ID!,
    appSecret: process.env.INSTAGRAM_APP_SECRET!,
    apiVersion: 'v20.0',
    defaultScopes: ['instagram_business_basic'],
  });

  console.log('\n📌 Custom Version + Scopes:');
  console.log(`API Version: ${instagram4.apiVersion}`);
  console.log(`Scopes: ${instagram4.scopes.join(', ')}`);

  // The configured scopes are used automatically in getAuthUrl()
  const authUrl = instagram3.getAuthUrl();
  console.log('\n🔗 Auth URL uses configured scopes automatically');

  // You can still override scopes per request if needed
  const customAuthUrl = instagram3.getAuthUrl({
    scopes: ['instagram_business_basic', 'custom_scope'],
  });
  console.log('🔗 Or override with custom scopes per request');

  // Access static default scopes
  console.log('\n📚 Static DEFAULT_SCOPES:');
  console.log(InstagramClient.DEFAULT_SCOPES.join(', '));
}

main().catch(console.error);
