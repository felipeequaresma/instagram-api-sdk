# Authentication Guide

Complete guide to Instagram OAuth authentication and token management.

## Prerequisites

- Instagram Business or Creator account
- Facebook App with Instagram Graph API access
- App ID and App Secret from your Facebook App

## OAuth Flow

### Step 1: Generate Authorization URL

```typescript
import { InstagramClient } from '@felipeequaresma/instagram-api-sdk';

const instagram = new InstagramClient({
  appId: 'YOUR_APP_ID',
  appSecret: 'YOUR_APP_SECRET',
  redirectUri: 'https://yourapp.com/auth/callback',
});

const authUrl = instagram.getAuthUrl({
  scopes: [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
  ],
  state: 'random_state_for_csrf',
});

// Redirect user to authUrl
```

### Step 2: Handle Callback

After the user authorizes your app, Instagram redirects them to your `redirectUri` with a `code` parameter:

```
https://yourapp.com/auth/callback?code=AUTHORIZATION_CODE&state=random_state_for_csrf
```

### Step 3: Exchange Code for Token

```typescript
// Verify state parameter matches (CSRF protection)
if (receivedState !== expectedState) {
  throw new Error('Invalid state parameter');
}

// Exchange code for long-lived token
const userId = await instagram.authenticate(code);
// Token is automatically saved and scheduled for refresh
```

## Token Lifecycle

### Short-Lived to Long-Lived Exchange

The SDK automatically handles the token exchange:

1. **Short-lived token** (1 hour) - Obtained from authorization code
2. **Long-lived token** (60 days) - Automatically exchanged by SDK

```typescript
// This happens automatically in authenticate()
const userId = await instagram.authenticate(code);
```

### Automatic Token Refresh

Tokens are automatically refreshed **7 days before expiry**:

```typescript
// Token refresh is scheduled automatically
await instagram.authenticate(code);
// SDK will refresh the token in ~53 days (7 days before 60-day expiry)
```

### Manual Token Refresh

For advanced use cases, you can manually refresh tokens:

```typescript
const refreshed = await instagram.auth.refreshToken(accessToken);
```

## Token Storage

### Default File Storage

By default, tokens are stored in a JSON file:

```typescript
const instagram = new InstagramClient({
  appId: 'YOUR_APP_ID',
  appSecret: 'YOUR_APP_SECRET',
  tokenStorage: new FileTokenStorage('./tokens.json'),
});
```

### Custom Storage Implementation

Implement `ITokenStorage` for database, Redis, etc.:

```typescript
import { ITokenStorage, TokenData } from '@felipeequaresma/instagram-api-sdk';

class DatabaseTokenStorage implements ITokenStorage {
  async get(userId: string): Promise<TokenData | null> {
    const row = await db.query(
      'SELECT * FROM tokens WHERE user_id = $1',
      [userId]
    );
    
    if (!row) return null;
    
    return {
      accessToken: row.access_token,
      tokenType: row.token_type,
      expiresAt: row.expires_at,
      userId: row.user_id,
    };
  }
  
  async set(userId: string, token: TokenData): Promise<void> {
    await db.query(
      'INSERT INTO tokens (user_id, access_token, token_type, expires_at) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO UPDATE SET access_token = $2, expires_at = $4',
      [userId, token.accessToken, token.tokenType, token.expiresAt]
    );
  }
  
  async delete(userId: string): Promise<void> {
    await db.query('DELETE FROM tokens WHERE user_id = $1', [userId]);
  }
}

const instagram = new InstagramClient({
  appId: 'YOUR_APP_ID',
  appSecret: 'YOUR_APP_SECRET',
  tokenStorage: new DatabaseTokenStorage(),
});
```

## Token Introspection

Check token validity and metadata:

```typescript
const info = await instagram.auth.introspectToken(accessToken);

console.log('Valid:', info.isValid);
console.log('Expires at:', new Date(info.expiresAt * 1000));
console.log('Scopes:', info.scopes);
console.log('User ID:', info.userId);
```

## Required Scopes

Different features require different permissions:

| Feature | Required Scopes |
|---------|----------------|
| Basic profile | `instagram_business_basic` |
| Direct messages | `instagram_business_basic`, `instagram_business_manage_messages` |
| Comments | `instagram_business_basic`, `instagram_business_manage_comments` |
| Media insights | `instagram_business_basic`, `instagram_manage_insights` |

## Security Best Practices

1. **Always verify state parameter** to prevent CSRF attacks
2. **Store tokens securely** - never commit to version control
3. **Use HTTPS** for redirect URIs in production
4. **Rotate app secret** periodically
5. **Implement token encryption** for database storage
6. **Monitor token usage** and revoke suspicious tokens

## Error Handling

```typescript
try {
  const userId = await instagram.authenticate(code);
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Authentication failed:', error.message);
    // Handle auth error (e.g., invalid code, expired code)
  }
}
```

## Complete Example

See [examples/basic-auth.ts](../examples/basic-auth.ts) for a complete working example.
