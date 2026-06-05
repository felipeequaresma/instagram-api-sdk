import type { ITokenStorage, TokenData } from '../types/index';

/**
 * Database Token Storage Adapter
 *
 * This adapter allows you to integrate the SDK with your database.
 * Implement the save/load/delete methods to persist tokens in your database.
 */
export abstract class DatabaseTokenStorage implements ITokenStorage {
  /**
   * Get token from database
   * @param userId - Instagram user ID
   */
  abstract get(userId: string): Promise<TokenData | null>;

  /**
   * Save token to database
   * @param userId - Instagram user ID
   * @param token - Token data to save
   */
  abstract set(userId: string, token: TokenData): Promise<void>;

  /**
   * Delete token from database
   * @param userId - Instagram user ID
   */
  abstract delete(userId: string): Promise<void>;
}

/**
 * Example: Prisma Database Adapter
 *
 * Usage:
 * ```typescript
 * import { PrismaClient } from '@prisma/client'
 *
 * class PrismaTokenStorage extends DatabaseTokenStorage {
 *   constructor(private prisma: PrismaClient) {
 *     super()
 *   }
 *
 *   async get(userId: string): Promise<TokenData | null> {
 *     const token = await this.prisma.instagramToken.findUnique({
 *       where: { userId }
 *     })
 *
 *     if (!token) return null
 *
 *     return {
 *       accessToken: token.accessToken,
 *       tokenType: token.tokenType,
 *       expiresAt: token.expiresAt,
 *       userId: token.userId,
 *     }
 *   }
 *
 *   async set(userId: string, token: TokenData): Promise<void> {
 *     await this.prisma.instagramToken.upsert({
 *       where: { userId },
 *       create: {
 *         userId,
 *         accessToken: token.accessToken,
 *         tokenType: token.tokenType,
 *         expiresAt: token.expiresAt,
 *       },
 *       update: {
 *         accessToken: token.accessToken,
 *         tokenType: token.tokenType,
 *         expiresAt: token.expiresAt,
 *       },
 *     })
 *   }
 *
 *   async delete(userId: string): Promise<void> {
 *     await this.prisma.instagramToken.delete({
 *       where: { userId }
 *     })
 *   }
 * }
 * ```
 */

/**
 * Example: MongoDB Adapter
 *
 * Usage:
 * ```typescript
 * import { MongoClient, Db } from 'mongodb'
 *
 * class MongoTokenStorage extends DatabaseTokenStorage {
 *   constructor(private db: Db) {
 *     super()
 *   }
 *
 *   async get(userId: string): Promise<TokenData | null> {
 *     const token = await this.db.collection('instagram_tokens').findOne({ userId })
 *
 *     if (!token) return null
 *
 *     return {
 *       accessToken: token.accessToken,
 *       tokenType: token.tokenType,
 *       expiresAt: token.expiresAt,
 *       userId: token.userId,
 *     }
 *   }
 *
 *   async set(userId: string, token: TokenData): Promise<void> {
 *     await this.db.collection('instagram_tokens').updateOne(
 *       { userId },
 *       { $set: token },
 *       { upsert: true }
 *     )
 *   }
 *
 *   async delete(userId: string): Promise<void> {
 *     await this.db.collection('instagram_tokens').deleteOne({ userId })
 *   }
 * }
 * ```
 */

/**
 * Example: TypeORM Adapter
 *
 * Usage:
 * ```typescript
 * import { Repository } from 'typeorm'
 * import { InstagramToken } from './entities/InstagramToken'
 *
 * class TypeORMTokenStorage extends DatabaseTokenStorage {
 *   constructor(private repository: Repository<InstagramToken>) {
 *     super()
 *   }
 *
 *   async get(userId: string): Promise<TokenData | null> {
 *     const token = await this.repository.findOne({ where: { userId } })
 *
 *     if (!token) return null
 *
 *     return {
 *       accessToken: token.accessToken,
 *       tokenType: token.tokenType,
 *       expiresAt: token.expiresAt,
 *       userId: token.userId,
 *     }
 *   }
 *
 *   async set(userId: string, token: TokenData): Promise<void> {
 *     await this.repository.save({
 *       userId,
 *       ...token,
 *     })
 *   }
 *
 *   async delete(userId: string): Promise<void> {
 *     await this.repository.delete({ userId })
 *   }
 * }
 * ```
 */
