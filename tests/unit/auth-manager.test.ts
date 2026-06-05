import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthManager } from '../../src/auth/AuthManager';
import { AuthenticationError } from '../../src/errors/InstagramError';
import type { ITokenStorage, TokenData } from '../../src/types';

vi.mock('axios', () => ({
  default: {
    create: vi.fn(),
  },
}));

type MockAxiosClient = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

const createStorage = (): ITokenStorage => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
});

describe('AuthManager', () => {
  let httpClient: MockAxiosClient;
  let storage: ITokenStorage;
  let manager: AuthManager;

  beforeEach(() => {
    httpClient = {
      get: vi.fn(),
      post: vi.fn(),
    };
    storage = createStorage();

    vi.mocked(axios.create).mockReturnValue(httpClient as never);

    manager = new AuthManager({
      appId: 'app-123',
      appSecret: 'secret-456',
      redirectUri: 'https://example.com/callback',
      tokenStorage: storage,
    });
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('generates an OAuth URL with scopes and state', () => {
    const url = new URL(
      manager.getAuthorizationUrl({
        scopes: ['instagram_business_basic', 'instagram_business_manage_comments'],
        state: 'csrf-state',
      })
    );

    expect(url.origin + url.pathname).toBe('https://api.instagram.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('app-123');
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/callback');
    expect(url.searchParams.get('scope')).toBe(
      'instagram_business_basic,instagram_business_manage_comments'
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('csrf-state');
  });

  it('generates an OAuth URL without optional state', () => {
    const url = new URL(
      manager.getAuthorizationUrl({
        scopes: ['instagram_business_basic'],
      })
    );

    expect(url.searchParams.get('scope')).toBe('instagram_business_basic');
    expect(url.searchParams.has('state')).toBe(false);
  });

  it('exchanges an authorization code for a short-lived token', async () => {
    httpClient.post.mockResolvedValue({
      data: {
        access_token: 'short-token',
        user_id: 12345,
      },
    });

    await expect(manager.exchangeCodeForToken('oauth-code')).resolves.toEqual({
      accessToken: 'short-token',
      userId: '12345',
    });

    expect(httpClient.post).toHaveBeenCalledWith(
      'https://api.instagram.com/oauth/access_token',
      expect.any(URLSearchParams),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const form = httpClient.post.mock.calls[0][1] as URLSearchParams;
    expect(form.get('client_id')).toBe('app-123');
    expect(form.get('client_secret')).toBe('secret-456');
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('redirect_uri')).toBe('https://example.com/callback');
    expect(form.get('code')).toBe('oauth-code');
  });

  it('wraps code exchange failures as authentication errors', async () => {
    const originalError = new Error('network down');
    httpClient.post.mockRejectedValue(originalError);

    await expect(manager.exchangeCodeForToken('oauth-code')).rejects.toMatchObject({
      name: 'AuthenticationError',
      message: 'Failed to exchange authorization code',
      originalError,
    } satisfies Partial<AuthenticationError>);
  });

  it('exchanges and refreshes long-lived tokens with Graph API parameters', async () => {
    httpClient.get
      .mockResolvedValueOnce({
        data: {
          access_token: 'long-token',
          token_type: 'bearer',
          expires_in: 5_184_000,
        },
      })
      .mockResolvedValueOnce({
        data: {
          access_token: 'refreshed-token',
          token_type: 'bearer',
          expires_in: 5_184_000,
        },
      });

    await expect(manager.exchangeForLongLivedToken('short-token')).resolves.toEqual({
      accessToken: 'long-token',
      userId: '',
      expiresIn: 5_184_000,
    });

    await expect(manager.refreshToken('long-token')).resolves.toEqual({
      accessToken: 'refreshed-token',
      userId: '',
      expiresIn: 5_184_000,
    });

    const exchangeUrl = new URL(httpClient.get.mock.calls[0][0] as string);
    expect(exchangeUrl.origin + exchangeUrl.pathname).toBe('https://graph.instagram.com/access_token');
    expect(exchangeUrl.searchParams.get('grant_type')).toBe('ig_exchange_token');
    expect(exchangeUrl.searchParams.get('client_secret')).toBe('secret-456');
    expect(exchangeUrl.searchParams.get('access_token')).toBe('short-token');

    const refreshUrl = new URL(httpClient.get.mock.calls[1][0] as string);
    expect(refreshUrl.origin + refreshUrl.pathname).toBe(
      'https://graph.instagram.com/refresh_access_token'
    );
    expect(refreshUrl.searchParams.get('grant_type')).toBe('ig_refresh_token');
    expect(refreshUrl.searchParams.get('access_token')).toBe('long-token');
  });

  it('wraps long-lived token exchange and refresh failures', async () => {
    httpClient.get.mockRejectedValueOnce(new Error('exchange failed'));
    await expect(manager.exchangeForLongLivedToken('short-token')).rejects.toMatchObject({
      name: 'AuthenticationError',
      message: 'Failed to exchange for long-lived token',
    });

    httpClient.get.mockRejectedValueOnce(new Error('refresh failed'));
    await expect(manager.refreshToken('long-token')).rejects.toMatchObject({
      name: 'AuthenticationError',
      message: 'Failed to refresh token',
    });
  });

  it('introspects tokens with the app access token', async () => {
    httpClient.get.mockResolvedValue({
      data: {
        data: {
          appId: 'app-123',
          type: 'USER',
          application: 'Instagram App',
          dataAccessExpiresAt: 1_800_000_000,
          expiresAt: 1_800_000_000,
          isValid: true,
          scopes: ['instagram_business_basic'],
          userId: 'user-1',
        },
      },
    });

    await expect(manager.introspectToken('user-token')).resolves.toMatchObject({
      appId: 'app-123',
      isValid: true,
      userId: 'user-1',
    });

    const url = new URL(httpClient.get.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe('https://graph.facebook.com/debug_token');
    expect(url.searchParams.get('input_token')).toBe('user-token');
    expect(url.searchParams.get('access_token')).toBe('app-123|secret-456');
  });

  it('wraps token introspection failures', async () => {
    httpClient.get.mockRejectedValue(new Error('debug token failed'));

    await expect(manager.introspectToken('user-token')).rejects.toMatchObject({
      name: 'AuthenticationError',
      message: 'Failed to introspect token',
    });
  });

  it('saves tokens and schedules automatic refresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const refreshSpy = vi.spyOn(manager, 'refreshToken').mockResolvedValue({
      accessToken: 'new-token',
      userId: '',
      expiresIn: 5_184_000,
    });

    const token: TokenData = {
      accessToken: 'old-token',
      tokenType: 'Bearer',
      expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      userId: 'user-1',
    };

    await manager.saveToken('user-1', token);
    expect(storage.set).toHaveBeenCalledWith('user-1', token);

    await vi.runOnlyPendingTimersAsync();
    expect(refreshSpy).toHaveBeenCalledWith('old-token');
    expect(storage.set).toHaveBeenLastCalledWith(
      'user-1',
      expect.objectContaining({
        accessToken: 'new-token',
        tokenType: 'Bearer',
        userId: 'user-1',
      })
    );
  });

  it('uses the default expiry when an automatic refresh response omits expiresIn', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    vi.spyOn(manager, 'refreshToken').mockResolvedValue({
      accessToken: 'new-token',
      userId: '',
    });

    await manager.saveToken('user-1', {
      accessToken: 'old-token',
      tokenType: 'Bearer',
      expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      userId: 'user-1',
    });

    await vi.runOnlyPendingTimersAsync();

    expect(storage.set).toHaveBeenLastCalledWith(
      'user-1',
      expect.objectContaining({
        accessToken: 'new-token',
        expiresAt: Math.floor(Date.now() / 1000) + 5_184_000,
      })
    );
  });

  it('logs scheduled automatic refresh failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    vi.spyOn(manager, 'refreshToken').mockRejectedValue(new Error('refresh failed'));

    await manager.saveToken('user-1', {
      accessToken: 'old-token',
      tokenType: 'Bearer',
      expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      userId: 'user-1',
    });

    await vi.runOnlyPendingTimersAsync();

    expect(manager.refreshToken).toHaveBeenCalledWith('old-token');
  });

  it('returns null for missing and expired stored tokens', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    vi.mocked(storage.get).mockResolvedValueOnce(null);
    await expect(manager.getToken('missing-user')).resolves.toBeNull();

    vi.mocked(storage.get).mockResolvedValueOnce({
      accessToken: 'expired-token',
      tokenType: 'Bearer',
      expiresAt: Math.floor(Date.now() / 1000) - 1,
      userId: 'expired-user',
    });
    await expect(manager.getToken('expired-user')).resolves.toBeNull();
  });

  it('returns valid stored tokens', async () => {
    const token: TokenData = {
      accessToken: 'valid-token',
      tokenType: 'Bearer',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      userId: 'user-1',
    };

    vi.mocked(storage.get).mockResolvedValue(token);

    await expect(manager.getToken('user-1')).resolves.toBe(token);
  });
});
