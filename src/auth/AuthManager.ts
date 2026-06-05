import axios, { type AxiosInstance } from 'axios';
import { AuthenticationError } from '../errors/InstagramError';
import type {
  ITokenStorage,
  OAuthUrlOptions,
  TokenData,
  TokenExchangeResponse,
  TokenIntrospectionResponse,
} from '../types/index';
import { logger } from '../utils/logger';

const INSTAGRAM_OAUTH_URL = 'https://api.instagram.com/oauth/authorize';
const INSTAGRAM_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const GRAPH_API_URL = 'https://graph.instagram.com';

export interface AuthManagerConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  tokenStorage: ITokenStorage;
}

/**
 * Manages Instagram OAuth authentication and token lifecycle
 */
export class AuthManager {
  private readonly config: AuthManagerConfig;
  private readonly httpClient: AxiosInstance;
  private refreshTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: AuthManagerConfig) {
    this.config = config;
    this.httpClient = axios.create({
      timeout: 30000,
    });
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(options: OAuthUrlOptions): string {
    const params = new URLSearchParams({
      client_id: this.config.appId,
      redirect_uri: this.config.redirectUri,
      scope: options.scopes.join(','),
      response_type: 'code',
      ...(options.state && { state: options.state }),
    });

    const url = `${INSTAGRAM_OAUTH_URL}?${params.toString()}`;
    logger.debug('Generated OAuth URL', { scopes: options.scopes });
    return url;
  }

  /**
   * Exchange authorization code for short-lived access token
   */
  async exchangeCodeForToken(code: string): Promise<TokenExchangeResponse> {
    try {
      logger.debug('Exchanging authorization code for token');

      const formData = new URLSearchParams({
        client_id: this.config.appId,
        client_secret: this.config.appSecret,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri,
        code,
      });

      const response = await this.httpClient.post<{
        access_token: string;
        user_id: number;
      }>(INSTAGRAM_TOKEN_URL, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      logger.info('Successfully exchanged code for short-lived token');

      return {
        accessToken: response.data.access_token,
        userId: response.data.user_id.toString(),
      };
    } catch (error) {
      logger.error('Failed to exchange code for token', error);
      throw new AuthenticationError('Failed to exchange authorization code', error);
    }
  }

  /**
   * Exchange short-lived token for long-lived token (60 days)
   */
  async exchangeForLongLivedToken(shortLivedToken: string): Promise<TokenExchangeResponse> {
    try {
      logger.debug('Exchanging short-lived token for long-lived token');

      const params = new URLSearchParams({
        grant_type: 'ig_exchange_token',
        client_secret: this.config.appSecret,
        access_token: shortLivedToken,
      });

      const response = await this.httpClient.get<{
        access_token: string;
        token_type: string;
        expires_in: number;
      }>(`${GRAPH_API_URL}/access_token?${params.toString()}`);

      logger.info('Successfully exchanged for long-lived token', {
        expiresIn: response.data.expires_in,
      });

      return {
        accessToken: response.data.access_token,
        userId: '', // Will be filled by caller
        expiresIn: response.data.expires_in,
      };
    } catch (error) {
      logger.error('Failed to exchange for long-lived token', error);
      throw new AuthenticationError('Failed to exchange for long-lived token', error);
    }
  }

  /**
   * Refresh a long-lived token (extends expiry by 60 days)
   */
  async refreshToken(accessToken: string): Promise<TokenExchangeResponse> {
    try {
      logger.debug('Refreshing long-lived token');

      const params = new URLSearchParams({
        grant_type: 'ig_refresh_token',
        access_token: accessToken,
      });

      const response = await this.httpClient.get<{
        access_token: string;
        token_type: string;
        expires_in: number;
      }>(`${GRAPH_API_URL}/refresh_access_token?${params.toString()}`);

      logger.info('Successfully refreshed token', { expiresIn: response.data.expires_in });

      return {
        accessToken: response.data.access_token,
        userId: '', // Will be filled by caller
        expiresIn: response.data.expires_in,
      };
    } catch (error) {
      logger.error('Failed to refresh token', error);
      throw new AuthenticationError('Failed to refresh token', error);
    }
  }

  /**
   * Get token introspection data
   */
  async introspectToken(accessToken: string): Promise<TokenIntrospectionResponse> {
    try {
      const params = new URLSearchParams({
        input_token: accessToken,
        access_token: `${this.config.appId}|${this.config.appSecret}`,
      });

      const response = await this.httpClient.get<{
        data: TokenIntrospectionResponse;
      }>(`https://graph.facebook.com/debug_token?${params.toString()}`);

      return response.data.data;
    } catch (error) {
      logger.error('Failed to introspect token', error);
      throw new AuthenticationError('Failed to introspect token', error);
    }
  }

  /**
   * Save token and set up automatic refresh
   */
  async saveToken(userId: string, tokenData: TokenData): Promise<void> {
    await this.config.tokenStorage.set(userId, tokenData);
    this.scheduleTokenRefresh(userId, tokenData);
  }

  /**
   * Get token for a user
   */
  async getToken(userId: string): Promise<TokenData | null> {
    const token = await this.config.tokenStorage.get(userId);

    if (!token) {
      return null;
    }

    // Check if token is expired
    if (this.isTokenExpired(token)) {
      logger.warn(`Token for user ${userId} is expired`);
      return null;
    }

    return token;
  }

  /**
   * Check if token is expired
   */
  private isTokenExpired(token: TokenData): boolean {
    const now = Math.floor(Date.now() / 1000);
    return token.expiresAt <= now;
  }

  /**
   * Schedule automatic token refresh
   * Refreshes 7 days before expiry
   */
  private scheduleTokenRefresh(userId: string, token: TokenData): void {
    // Clear existing timer
    const existingTimer = this.refreshTimers.get(userId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = token.expiresAt - now;
    const refreshBuffer = 7 * 24 * 60 * 60; // 7 days in seconds
    const timeUntilRefresh = Math.max(0, timeUntilExpiry - refreshBuffer);

    logger.debug(`Scheduling token refresh for user ${userId} in ${timeUntilRefresh}s`);

    const timer = setTimeout(() => {
      this.performTokenRefresh(userId, token.accessToken).catch((error) => {
        logger.error(`Failed to auto-refresh token for user ${userId}`, error);
      });
    }, timeUntilRefresh * 1000);

    this.refreshTimers.set(userId, timer);
  }

  /**
   * Perform token refresh
   */
  private async performTokenRefresh(userId: string, accessToken: string): Promise<void> {
    try {
      logger.info(`Auto-refreshing token for user ${userId}`);

      const refreshed = await this.refreshToken(accessToken);
      const expiresAt = Math.floor(Date.now() / 1000) + (refreshed.expiresIn || 5184000); // 60 days default

      const tokenData: TokenData = {
        accessToken: refreshed.accessToken,
        tokenType: 'Bearer',
        expiresAt,
        userId,
      };

      await this.saveToken(userId, tokenData);
      logger.info(`Successfully auto-refreshed token for user ${userId}`);
    } catch (error) {
      logger.error(`Failed to auto-refresh token for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Clean up timers
   */
  destroy(): void {
    for (const timer of this.refreshTimers.values()) {
      clearTimeout(timer);
    }
    this.refreshTimers.clear();
  }
}
