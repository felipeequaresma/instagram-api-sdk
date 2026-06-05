# Token Persistence & Database Integration

## Overview

The Instagram API SDK provides multiple ways to persist tokens in your database:

1. **onTokenGenerated Callback** - Get notified when tokens are generated
2. **getToken() Method** - Retrieve token data for manual persistence
3. **DatabaseTokenStorage Adapter** - Integrate with your database ORM

## Method 1: Using onTokenGenerated Callback

The simplest way to persist tokens is using the `onTokenGenerated` callback:

```typescript
import { InstagramClient } from '@felipeequaresma/instagram-api-sdk';

const instagram = new InstagramClient({
  appId: 'YOUR_APP_ID',
  appSecret: 'YOUR_APP_SECRET',
  
  // This callback is called whenever a new token is generated
  onTokenGenerated: async (userId, token) => {
    // Save to your database
    await db.instagramTokens.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: token.accessToken,
        tokenType: token.tokenType,
        expiresAt: token.expiresAt,
      },
      update: {
        accessToken: token.accessToken,
        expiresAt: token.expiresAt,
      },
    });
  },
});

// When you authenticate, the callback will be called automatically
const userId = await instagram.authenticate(code);
```

## Method 2: Using getToken() Method

Retrieve token data manually after authentication:

```typescript
const instagram = new InstagramClient({
  appId: 'YOUR_APP_ID',
  appSecret: 'YOUR_APP_SECRET',
});

// Authenticate user
const userId = await instagram.authenticate(code);

// Get token data
const tokenData = await instagram.getToken(userId);

// Save to your database
await saveToDatabase(userId, tokenData);
```

## Method 3: DatabaseTokenStorage Adapter

Create a custom storage adapter that integrates directly with your database:

### Prisma Example

```typescript
// lib/instagram-storage.ts
import { PrismaClient } from '@prisma/client';
import { DatabaseTokenStorage, type TokenData } from '@felipeequaresma/instagram-api-sdk';

export class PrismaTokenStorage extends DatabaseTokenStorage {
  constructor(private prisma: PrismaClient) {
    super();
  }

  async get(userId: string): Promise<TokenData | null> {
    const token = await this.prisma.instagramToken.findUnique({
      where: { userId }
    });
    
    if (!token) return null;
    
    return {
      accessToken: token.accessToken,
      tokenType: token.tokenType,
      expiresAt: token.expiresAt,
      userId: token.userId,
    };
  }

  async set(userId: string, token: TokenData): Promise<void> {
    await this.prisma.instagramToken.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: token.accessToken,
        tokenType: token.tokenType,
        expiresAt: token.expiresAt,
      },
      update: {
        accessToken: token.accessToken,
        expiresAt: token.expiresAt,
      },
    });
  }

  async delete(userId: string): Promise<void> {
    await this.prisma.instagramToken.delete({
      where: { userId }
    });
  }
}

// Usage
import { InstagramClient } from '@felipeequaresma/instagram-api-sdk';
import { PrismaClient } from '@prisma/client';
import { PrismaTokenStorage } from './lib/instagram-storage';

const prisma = new PrismaClient();
const tokenStorage = new PrismaTokenStorage(prisma);

const instagram = new InstagramClient({
  appId: process.env.INSTAGRAM_APP_ID!,
  appSecret: process.env.INSTAGRAM_APP_SECRET!,
  tokenStorage, // Tokens automatically saved to Prisma
});
```

### Prisma Schema

```prisma
model InstagramToken {
  id          String   @id @default(cuid())
  userId      String   @unique
  accessToken String
  tokenType   String
  expiresAt   Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### MongoDB Example

```typescript
import { MongoClient, Db } from 'mongodb';
import { DatabaseTokenStorage, type TokenData } from '@felipeequaresma/instagram-api-sdk';

class MongoTokenStorage extends DatabaseTokenStorage {
  constructor(private db: Db) {
    super();
  }

  async get(userId: string): Promise<TokenData | null> {
    const token = await this.db.collection('instagram_tokens').findOne({ userId });
    
    if (!token) return null;
    
    return {
      accessToken: token.accessToken,
      tokenType: token.tokenType,
      expiresAt: token.expiresAt,
      userId: token.userId,
    };
  }

  async set(userId: string, token: TokenData): Promise<void> {
    await this.db.collection('instagram_tokens').updateOne(
      { userId },
      { $set: token },
      { upsert: true }
    );
  }

  async delete(userId: string): Promise<void> {
    await this.db.collection('instagram_tokens').deleteOne({ userId });
  }
}
```

### TypeORM Example

```typescript
import { Repository } from 'typeorm';
import { DatabaseTokenStorage, type TokenData } from '@felipeequaresma/instagram-api-sdk';

class TypeORMTokenStorage extends DatabaseTokenStorage {
  constructor(private repository: Repository<InstagramToken>) {
    super();
  }

  async get(userId: string): Promise<TokenData | null> {
    const token = await this.repository.findOne({ where: { userId } });
    
    if (!token) return null;
    
    return {
      accessToken: token.accessToken,
      tokenType: token.tokenType,
      expiresAt: token.expiresAt,
      userId: token.userId,
    };
  }

  async set(userId: string, token: TokenData): Promise<void> {
    await this.repository.save({
      userId,
      ...token,
    });
  }

  async delete(userId: string): Promise<void> {
    await this.repository.delete({ userId });
  }
}
```

## Token Data Structure

The `TokenData` interface contains:

```typescript
interface TokenData {
  accessToken: string;  // Instagram access token
  tokenType: string;    // Usually 'Bearer'
  expiresAt: number;    // Unix timestamp (seconds)
  userId?: string;      // Instagram user ID
  scopes?: string[];    // Granted scopes
}
```

## Best Practices

1. **Always Encrypt Tokens**: Store access tokens encrypted in your database
2. **Set Expiry Alerts**: Monitor token expiry and refresh before expiration
3. **Use Transactions**: Wrap token updates in database transactions
4. **Handle Errors**: Implement proper error handling for database operations
5. **Log Token Events**: Log when tokens are created, updated, or deleted

## Complete Example

```typescript
import { InstagramClient, DatabaseTokenStorage, type TokenData } from '@felipeequaresma/instagram-api-sdk';
import { PrismaClient } from '@prisma/client';

// 1. Create custom storage adapter
class PrismaTokenStorage extends DatabaseTokenStorage {
  constructor(private prisma: PrismaClient) {
    super();
  }

  async get(userId: string): Promise<TokenData | null> {
    const token = await this.prisma.instagramToken.findUnique({
      where: { userId }
    });
    return token ? {
      accessToken: token.accessToken,
      tokenType: token.tokenType,
      expiresAt: token.expiresAt,
      userId: token.userId,
    } : null;
  }

  async set(userId: string, token: TokenData): Promise<void> {
    await this.prisma.instagramToken.upsert({
      where: { userId },
      create: { userId, ...token },
      update: token,
    });
  }

  async delete(userId: string): Promise<void> {
    await this.prisma.instagramToken.delete({ where: { userId } });
  }
}

// 2. Initialize SDK with custom storage
const prisma = new PrismaClient();
const tokenStorage = new PrismaTokenStorage(prisma);

const instagram = new InstagramClient({
  appId: process.env.INSTAGRAM_APP_ID!,
  appSecret: process.env.INSTAGRAM_APP_SECRET!,
  tokenStorage,
  
  // Optional: Also use callback for additional logging/processing
  onTokenGenerated: async (userId, token) => {
    console.log(`Token generated for user ${userId}`);
    // Send notification, log event, etc.
  },
});

// 3. Authenticate and tokens are automatically saved
const userId = await instagram.authenticate(code);

// 4. Later, retrieve user's token
const tokenData = await instagram.getToken(userId);
```

## See Also

- [Authentication Guide](./authentication.md)
- [Database Integration Example](../examples/database-integration.ts)
