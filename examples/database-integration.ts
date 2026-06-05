import { DatabaseTokenStorage, InstagramClient, type TokenData } from './../src/index';

/**
 * Example: Database Integration with Token Persistence
 * 
 * This example shows how to integrate the SDK with your database
 * to persist Instagram tokens.
 */

// Example 1: Simple in-memory database simulation
class SimpleDBTokenStorage extends DatabaseTokenStorage {
  private tokens = new Map<string, TokenData>();

  async get(userId: string): Promise<TokenData | null> {
    return this.tokens.get(userId) || null;
  }

  async set(userId: string, token: TokenData): Promise<void> {
    this.tokens.set(userId, token);
    console.log(`💾 Token saved to database for user ${userId}`);
  }

  async delete(userId: string): Promise<void> {
    this.tokens.delete(userId);
    console.log(`🗑️  Token deleted from database for user ${userId}`);
  }
}

// Example 2: Using onTokenGenerated callback
async function exampleWithCallback() {
  console.log('📌 Example 1: Using onTokenGenerated callback\n');

  const instagram = new InstagramClient({
    appId: process.env.INSTAGRAM_APP_ID!,
    appSecret: process.env.INSTAGRAM_APP_SECRET!,
    
    // This callback is called whenever a new token is generated
    onTokenGenerated: async (userId, token) => {
      console.log('🔔 Token generated callback triggered!');
      console.log(`User ID: ${userId}`);
      console.log(`Access Token: ${token.accessToken.substring(0, 20)}...`);
      console.log(`Expires At: ${new Date(token.expiresAt * 1000).toISOString()}`);
      
      // Save to your database
      // await db.instagramTokens.upsert({
      //   where: { userId },
      //   create: { userId, ...token },
      //   update: token,
      // });
    },
  });

  // When you authenticate, the callback will be called automatically
  // const userId = await instagram.authenticate(code);
}

// Example 3: Using custom TokenStorage adapter
async function exampleWithAdapter() {
  console.log('\n📌 Example 2: Using DatabaseTokenStorage adapter\n');

  const dbStorage = new SimpleDBTokenStorage();

  const instagram = new InstagramClient({
    appId: process.env.INSTAGRAM_APP_ID!,
    appSecret: process.env.INSTAGRAM_APP_SECRET!,
    tokenStorage: dbStorage, // Use custom database storage
  });

  // Tokens will be automatically saved to your database
  // const userId = await instagram.authenticate(code);
}

// Example 4: Getting token data manually
async function exampleGetToken() {
  console.log('\n📌 Example 3: Getting token data manually\n');

  const instagram = new InstagramClient({
    appId: process.env.INSTAGRAM_APP_ID!,
    appSecret: process.env.INSTAGRAM_APP_SECRET!,
  });

  // After authentication, you can get the token data
  // const userId = await instagram.authenticate(code);
  
  // Get token data for persistence
  const userId = 'example_user_id';
  const tokenData = await instagram.getToken(userId);
  
  if (tokenData) {
    console.log('📦 Token Data:');
    console.log(JSON.stringify(tokenData, null, 2));
    
    // Save to your database
    // await saveToDatabase(userId, tokenData);
  }
}

// Example 5: Complete Prisma integration example
const prismaExample = `
// prisma/schema.prisma
model InstagramToken {
  id          String   @id @default(cuid())
  userId      String   @unique
  accessToken String
  tokenType   String
  expiresAt   Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// lib/instagram-storage.ts
import { PrismaClient } from '@prisma/client'
import { DatabaseTokenStorage, type TokenData } from '@felipeequaresma-design/instagram-api-sdk'

export class PrismaTokenStorage extends DatabaseTokenStorage {
  constructor(private prisma: PrismaClient) {
    super()
  }

  async get(userId: string): Promise<TokenData | null> {
    const token = await this.prisma.instagramToken.findUnique({
      where: { userId }
    })
    
    if (!token) return null
    
    return {
      accessToken: token.accessToken,
      tokenType: token.tokenType,
      expiresAt: token.expiresAt,
      userId: token.userId,
    }
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
    })
  }

  async delete(userId: string): Promise<void> {
    await this.prisma.instagramToken.delete({
      where: { userId }
    })
  }
}

// Usage
import { InstagramClient } from '@felipeequaresma-design/instagram-api-sdk'
import { PrismaClient } from '@prisma/client'
import { PrismaTokenStorage } from './lib/instagram-storage'

const prisma = new PrismaClient()
const tokenStorage = new PrismaTokenStorage(prisma)

const instagram = new InstagramClient({
  appId: process.env.INSTAGRAM_APP_ID!,
  appSecret: process.env.INSTAGRAM_APP_SECRET!,
  tokenStorage, // Tokens automatically saved to Prisma
})
`;

async function main() {
  await exampleWithCallback();
  await exampleWithAdapter();
  await exampleGetToken();
  
  console.log('\n📚 Complete Prisma Example:');
  console.log(prismaExample);
}

main().catch(console.error);
