import { promises as fs } from 'fs';
import { dirname } from 'path';
import type { ITokenStorage, TokenData } from '../types/index';
import { logger } from '../utils/logger';

/**
 * File-based token storage implementation
 */
export class FileTokenStorage implements ITokenStorage {
  private readonly filePath: string;
  private cache: Map<string, TokenData> = new Map();

  constructor(filePath: string = './tokens.json') {
    this.filePath = filePath;
  }

  async get(userId: string): Promise<TokenData | null> {
    // Check cache first
    if (this.cache.has(userId)) {
      return this.cache.get(userId) || null;
    }

    // Load from file
    await this.load();
    return this.cache.get(userId) || null;
  }

  async set(userId: string, token: TokenData): Promise<void> {
    this.cache.set(userId, token);
    await this.save();
    logger.debug(`Token saved for user ${userId}`);
  }

  async delete(userId: string): Promise<void> {
    this.cache.delete(userId);
    await this.save();
    logger.debug(`Token deleted for user ${userId}`);
  }

  /**
   * Load tokens from file
   */
  private async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const tokens = JSON.parse(data) as Record<string, TokenData>;
      this.cache = new Map(Object.entries(tokens));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist yet, that's okay
        this.cache = new Map();
      } else {
        logger.error('Failed to load tokens from file', error);
        throw error;
      }
    }
  }

  /**
   * Save tokens to file
   */
  private async save(): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(dirname(this.filePath), { recursive: true });

      const tokens = Object.fromEntries(this.cache);
      await fs.writeFile(this.filePath, JSON.stringify(tokens, null, 2), 'utf-8');
    } catch (error) {
      logger.error('Failed to save tokens to file', error);
      throw error;
    }
  }
}

/**
 * In-memory token storage implementation (for testing/development)
 */
export class MemoryTokenStorage implements ITokenStorage {
  private tokens = new Map<string, TokenData>();

  get(userId: string): Promise<TokenData | null> {
    return Promise.resolve(this.tokens.get(userId) || null);
  }

  set(userId: string, token: TokenData): Promise<void> {
    this.tokens.set(userId, token);
    return Promise.resolve();
  }

  delete(userId: string): Promise<void> {
    this.tokens.delete(userId);
    return Promise.resolve();
  }

  clear(): void {
    this.tokens.clear();
  }
}
