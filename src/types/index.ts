/**
 * Instagram API SDK Type Definitions
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface InstagramClientConfig {
  /** Facebook App ID */
  appId: string;
  /** Facebook App Secret */
  appSecret: string;
  /** Token storage implementation */
  tokenStorage?: ITokenStorage;
  /** Redirect URI for OAuth flow */
  redirectUri?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Custom HTTP timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Custom rate limit (requests per hour, default: 200) */
  rateLimit?: number;
  /** Instagram Graph API version (default: 'v21.0') */
  apiVersion?: string;
  /** Default OAuth scopes to use (default: full SDK scopes) */
  defaultScopes?: string[];
  /** Callback when a new token is generated (for database persistence) */
  onTokenGenerated?: (userId: string, token: TokenData) => Promise<void> | void;
  /**
   * Development fallback: if the long-lived token exchange fails, keep the
   * short-lived token (valid ~1h) instead of throwing. Off by default. The
   * token's real expiry is still controlled by Meta - this only avoids aborting
   * the OAuth flow so you can test while resolving app permissions.
   */
  allowShortLivedToken?: boolean;
}

// ============================================================================
// Token Types
// ============================================================================

export interface TokenData {
  /** Access token */
  accessToken: string;
  /** Token type (usually 'Bearer') */
  tokenType: string;
  /** Expiry timestamp (Unix timestamp in seconds) */
  expiresAt: number;
  /** User ID associated with the token */
  userId?: string;
  /** Scopes granted */
  scopes?: string[];
}

export interface ITokenStorage {
  /** Get token data for a user */
  get(userId: string): Promise<TokenData | null>;
  /** Save token data for a user */
  set(userId: string, token: TokenData): Promise<void>;
  /** Delete token data for a user */
  delete(userId: string): Promise<void>;
}

// ============================================================================
// Authentication Types
// ============================================================================

export interface OAuthUrlOptions {
  /** OAuth scopes to request */
  scopes: string[];
  /** State parameter for CSRF protection */
  state?: string;
}

export interface TokenExchangeResponse {
  accessToken: string;
  userId: string;
  expiresIn?: number;
}

export interface TokenIntrospectionResponse {
  appId: string;
  type: string;
  application: string;
  dataAccessExpiresAt: number;
  expiresAt: number;
  isValid: boolean;
  scopes: string[];
  userId: string;
}

// ============================================================================
// Messages Types
// ============================================================================

export interface SendMessageOptions {
  /** Recipient Instagram-scoped ID (IGSID) */
  recipientId: string;
  /** Message text */
  text?: string;
  /** Media attachment */
  attachment?: MessageAttachment;
}

export interface MessageAttachment {
  /** Attachment type */
  type: 'image' | 'video' | 'audio' | 'file';
  /** Media URL or file path */
  url: string;
}

export interface Message {
  id: string;
  from: {
    id: string;
    username?: string;
  };
  to: {
    id: string;
  };
  message: string;
  createdTime: string;
  attachments?: MessageAttachment[];
}

export interface Conversation {
  id: string;
  participants: Array<{
    id: string;
    username?: string;
  }>;
  messages: Message[];
  updatedTime: string;
}

// ============================================================================
// Comments Types
// ============================================================================

export interface Comment {
  id: string;
  text: string;
  timestamp: string;
  from: {
    id: string;
    username: string;
  };
  likeCount: number;
  hidden: boolean;
  parentId?: string;
  replies?: Comment[];
}

export interface ListCommentsOptions {
  /** Media ID to get comments for */
  mediaId: string;
  /** Maximum number of comments to return */
  limit?: number;
  /** Pagination cursor */
  after?: string;
}

export interface CreateCommentReplyOptions {
  /** Comment ID to reply to */
  commentId: string;
  /** Reply text */
  message: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
}

// ============================================================================
// Media Types
// ============================================================================

export interface Media {
  id: string;
  caption?: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  mediaUrl: string;
  permalink: string;
  timestamp: string;
  username: string;
  commentsCount?: number;
  likeCount?: number;
}

export interface MediaInsights {
  impressions: number;
  reach: number;
  engagement: number;
  saved: number;
}

// ============================================================================
// Webhook Types
// ============================================================================

export interface WebhookConfig {
  /** Verify token for webhook verification */
  verifyToken: string;
  /** App secret for signature verification */
  appSecret: string;
}

export interface WebhookVerificationRequest {
  'hub.mode': string;
  'hub.verify_token': string;
  'hub.challenge': string;
}

export interface WebhookEvent {
  object: 'instagram';
  entry: WebhookEntry[];
}

export interface WebhookEntry {
  id: string;
  time: number;
  changes?: WebhookChange[];
  messaging?: MessagingEvent[];
}

export interface WebhookChange {
  field: 'comments' | 'mentions' | 'story_insights';
  value: Record<string, unknown>;
}

export interface MessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: MessageAttachment[];
  };
  reaction?: {
    mid: string;
    action: 'react' | 'unreact';
    reaction?: string;
    emoji?: string;
  };
}

export type WebhookEventType =
  | 'messages'
  | 'message_reactions'
  | 'comments'
  | 'mentions'
  | 'story_insights';

// ============================================================================
// Error Types
// ============================================================================

export interface InstagramApiError {
  message: string;
  type: string;
  code: number;
  errorSubcode?: number;
  fbtraceId?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface RateLimitConfig {
  requestsPerHour: number;
  requestsPerSecond?: number;
}
