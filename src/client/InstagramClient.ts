import { AuthManager } from '../auth/AuthManager';
import { FileTokenStorage } from '../auth/TokenStorage';
import { ValidationError } from '../errors/InstagramError';
import { CommentsApi } from '../features/comments/CommentsApi';
import { MediaApi } from '../features/media/MediaApi';
import { MessagesApi } from '../features/messages/MessagesApi';
import type { InstagramClientConfig, OAuthUrlOptions, TokenData } from '../types/index';
import { logger, LogLevel } from '../utils/logger';
import { RateLimiter } from '../utils/rateLimit';
import { WebhookHandler } from '../webhooks/WebhookHandler';
import { HttpClient } from './HttpClient';

/** Instagram short-lived access tokens are valid for ~1 hour. */
const SHORT_LIVED_TOKEN_TTL_SECONDS = 3600;

/**
 * Main Instagram API SDK Client
 */
export class InstagramClient {
  private readonly config: InstagramClientConfig;
  private readonly httpClient: HttpClient;
  private readonly authManager: AuthManager;
  private readonly rateLimiter: RateLimiter;
  private readonly defaultScopes: string[];

  // API modules
  public readonly messages: MessagesApi;
  public readonly comments: CommentsApi;
  public readonly media: MediaApi;

  constructor(config: InstagramClientConfig) {
    // Validate config
    if (!config.appId) {
      throw new ValidationError('appId is required', 'appId');
    }
    if (!config.appSecret) {
      throw new ValidationError('appSecret is required', 'appSecret');
    }

    // Set default scopes
    this.defaultScopes = config.defaultScopes || [
      'instagram_business_basic',
      'instagram_business_manage_messages',
      'instagram_business_manage_comments',
      'instagram_business_content_publish',
    ];

    this.config = {
      tokenStorage: new FileTokenStorage(),
      redirectUri: 'http://localhost:3000/auth/callback',
      debug: false,
      timeout: 30000,
      rateLimit: 200,
      apiVersion: 'v21.0',
      ...config,
      defaultScopes: this.defaultScopes,
    };

    // Enable debug logging if requested
    if (this.config.debug) {
      logger.setLevel(LogLevel.DEBUG);
    }

    // Initialize rate limiter
    this.rateLimiter = new RateLimiter({
      requestsPerHour: this.config.rateLimit || 200,
    });

    // Initialize HTTP client with API version
    this.httpClient = new HttpClient({
      timeout: this.config.timeout,
      rateLimiter: this.rateLimiter,
      apiVersion: this.config.apiVersion,
    });

    // Initialize auth manager
    this.authManager = new AuthManager({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      redirectUri: this.config.redirectUri || '',
      tokenStorage: this.config.tokenStorage || new FileTokenStorage(),
    });

    // Initialize API modules
    this.messages = new MessagesApi(this.httpClient);
    this.comments = new CommentsApi(this.httpClient);
    this.media = new MediaApi(this.httpClient);

    logger.info('Instagram SDK initialized', {
      apiVersion: this.config.apiVersion,
      scopes: this.defaultScopes.length,
    });
  }

  /**
   * Get OAuth authorization URL with default or custom scopes
   * @param options - Optional custom scopes and state
   */
  getAuthUrl(options?: { scopes?: string[]; state?: string }): string {
    const scopes = options?.scopes || this.defaultScopes;
    const authOptions: OAuthUrlOptions = {
      scopes,
      state: options?.state,
    };

    return this.authManager.getAuthorizationUrl(authOptions);
  }

  /**
   * Complete OAuth flow by exchanging code for tokens
   * Automatically sets the user context after authentication
   * @param code - Authorization code from OAuth callback
   * @param autoSetUser - Automatically set user context (default: true)
   * @returns userId for reference
   */
  async authenticate(code: string, autoSetUser: boolean = true): Promise<string> {
    logger.info('Starting authentication flow');

    // Exchange code for short-lived token
    const shortLived = await this.authManager.exchangeCodeForToken(code);

    // Exchange for a long-lived token. If that fails and the dev fallback is
    // enabled, keep the short-lived token (valid ~1h) so the OAuth flow still
    // completes - handy for local testing while app permissions are pending.
    let accessToken: string;
    let expiresIn: number | undefined;
    try {
      const longLived = await this.authManager.exchangeForLongLivedToken(shortLived.accessToken);
      accessToken = longLived.accessToken;
      expiresIn = longLived.expiresIn;
    } catch (error) {
      if (!this.config.allowShortLivedToken) {
        throw error;
      }
      logger.warn(
        'Long-lived token exchange failed; keeping the short-lived token (expires in ~1h) ' +
          'because allowShortLivedToken is enabled',
        error
      );
      accessToken = shortLived.accessToken;
      expiresIn = SHORT_LIVED_TOKEN_TTL_SECONDS;
    }

    // Calculate expiry timestamp
    const expiresAt = Math.floor(Date.now() / 1000) + (expiresIn || 5184000); // 60 days default

    // Save token
    await this.authManager.saveToken(shortLived.userId, {
      accessToken,
      tokenType: 'Bearer',
      expiresAt,
      userId: shortLived.userId,
    });

    // Call onTokenGenerated callback if provided
    if (this.config.onTokenGenerated) {
      await this.config.onTokenGenerated(shortLived.userId, {
        accessToken,
        tokenType: 'Bearer',
        expiresAt,
        userId: shortLived.userId,
      });
    }

    logger.info('Authentication completed successfully', { userId: shortLived.userId });

    // Automatically set user context if requested
    if (autoSetUser) {
      this.httpClient.setAccessToken(accessToken);
      logger.debug('User context set automatically', { userId: shortLived.userId });
    }

    return shortLived.userId;
  }

  /**
   * Get token data for a user (for database persistence)
   * @param userId - User ID to get token for
   * @returns Token data or null if not found
   */
  async getToken(userId: string): Promise<TokenData | null> {
    return this.authManager.getToken(userId);
  }

  /**
   * Set user context for API calls
   */
  async setUser(userId: string): Promise<void> {
    const token = await this.authManager.getToken(userId);

    if (!token) {
      throw new ValidationError(`No valid token found for user ${userId}`, 'userId');
    }

    this.httpClient.setAccessToken(token.accessToken);
    logger.debug('User context set', { userId });
  }

  /**
   * Set access token directly (for advanced use cases)
   */
  setAccessToken(accessToken: string): void {
    this.httpClient.setAccessToken(accessToken);
    logger.debug('Access token set directly');
  }

  /**
   * Create a webhook handler
   */
  createWebhookHandler(verifyToken: string): WebhookHandler {
    return new WebhookHandler({
      verifyToken,
      appSecret: this.config.appSecret,
    });
  }

  /**
   * Get auth manager for advanced authentication operations
   */
  get auth(): AuthManager {
    return this.authManager;
  }

  /**
   * Get configured API version
   */
  get apiVersion(): string {
    return this.config.apiVersion || 'v21.0';
  }

  /**
   * Get configured default scopes
   */
  get scopes(): string[] {
    return [...this.defaultScopes];
  }

  /**
   * Default scopes required for full SDK functionality
   */
  static get DEFAULT_SCOPES(): string[] {
    return [
      'instagram_business_basic',
      'instagram_business_manage_messages',
      'instagram_business_manage_comments',
      'instagram_business_content_publish',
    ];
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.authManager.destroy();
    logger.info('Instagram SDK destroyed');
  }
}
