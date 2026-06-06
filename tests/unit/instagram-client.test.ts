import { describe, expect, it, vi } from 'vitest';
import { InstagramClient } from '../../src/client/InstagramClient';
import { MemoryTokenStorage } from '../../src/auth/TokenStorage';
import { AuthenticationError, ValidationError } from '../../src/errors/InstagramError';

type ClientInternals = {
  httpClient: {
    accessToken?: string;
  };
};

const createClient = (overrides: Partial<ConstructorParameters<typeof InstagramClient>[0]> = {}) =>
  new InstagramClient({
    appId: 'app-123',
    appSecret: 'secret-456',
    tokenStorage: new MemoryTokenStorage(),
    ...overrides,
  });

describe('InstagramClient', () => {
  it('validates required constructor config', () => {
    expect(() => new InstagramClient({ appId: '', appSecret: 'secret' })).toThrow(ValidationError);
    expect(() => new InstagramClient({ appId: 'app', appSecret: '' })).toThrow(ValidationError);
  });

  it('exposes default scopes and protects them from mutation', () => {
    const client = createClient();

    expect(client.apiVersion).toBe('v21.0');
    expect(client.scopes).toEqual(InstagramClient.DEFAULT_SCOPES);

    const scopes = client.scopes;
    scopes.push('mutated');

    expect(client.scopes).toEqual(InstagramClient.DEFAULT_SCOPES);

    client.destroy();
  });

  it('enables debug mode and applies fallback config values', () => {
    const client = createClient({
      debug: true,
      rateLimit: 0,
      redirectUri: undefined,
      tokenStorage: undefined,
      apiVersion: undefined,
    } as never);

    expect(client.apiVersion).toBe('v21.0');
    expect((client as unknown as { rateLimiter: { maxTokens: number } }).rateLimiter.maxTokens).toBe(
      200
    );

    client.destroy();
  });

  it('generates auth URLs with custom scopes and state', () => {
    const client = createClient({
      redirectUri: 'https://example.com/callback',
      defaultScopes: ['instagram_business_basic'],
    });

    const url = new URL(
      client.getAuthUrl({
        scopes: ['instagram_business_manage_messages'],
        state: 'csrf-state',
      })
    );

    expect(url.searchParams.get('client_id')).toBe('app-123');
    expect(url.searchParams.get('scope')).toBe('instagram_business_manage_messages');
    expect(url.searchParams.get('state')).toBe('csrf-state');

    client.destroy();
  });

  it('generates auth URLs with default scopes when no options are provided', () => {
    const client = createClient({ defaultScopes: ['instagram_business_basic'] });
    const url = new URL(client.getAuthUrl());

    expect(url.searchParams.get('scope')).toBe('instagram_business_basic');

    client.destroy();
  });

  it('authenticates and sets the HTTP access token by default', async () => {
    const onTokenGenerated = vi.fn();
    const client = createClient({ onTokenGenerated });

    vi.spyOn(client.auth, 'exchangeCodeForToken').mockResolvedValue({
      accessToken: 'short-token',
      userId: 'user-1',
    });
    vi.spyOn(client.auth, 'exchangeForLongLivedToken').mockResolvedValue({
      accessToken: 'long-token',
      userId: '',
      expiresIn: 3600,
    });
    const saveTokenSpy = vi.spyOn(client.auth, 'saveToken').mockResolvedValue(undefined);

    await expect(client.authenticate('oauth-code')).resolves.toBe('user-1');

    expect(saveTokenSpy).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        accessToken: 'long-token',
        tokenType: 'Bearer',
        userId: 'user-1',
      })
    );
    expect(onTokenGenerated).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ accessToken: 'long-token' })
    );
    expect((client as unknown as ClientInternals).httpClient.accessToken).toBe('long-token');

    client.destroy();
  });

  it('can authenticate without setting the active user context', async () => {
    const client = createClient();

    vi.spyOn(client.auth, 'exchangeCodeForToken').mockResolvedValue({
      accessToken: 'short-token',
      userId: 'user-1',
    });
    vi.spyOn(client.auth, 'exchangeForLongLivedToken').mockResolvedValue({
      accessToken: 'long-token',
      userId: '',
      expiresIn: 3600,
    });
    vi.spyOn(client.auth, 'saveToken').mockResolvedValue(undefined);

    await client.authenticate('oauth-code', false);

    expect((client as unknown as ClientInternals).httpClient.accessToken).toBeUndefined();

    client.destroy();
  });

  it('uses the default token expiry when authentication response omits expiresIn', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const client = createClient();

    vi.spyOn(client.auth, 'exchangeCodeForToken').mockResolvedValue({
      accessToken: 'short-token',
      userId: 'user-1',
    });
    vi.spyOn(client.auth, 'exchangeForLongLivedToken').mockResolvedValue({
      accessToken: 'long-token',
      userId: '',
    });
    const saveTokenSpy = vi.spyOn(client.auth, 'saveToken').mockResolvedValue(undefined);

    await client.authenticate('oauth-code', false);

    expect(saveTokenSpy).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        expiresAt: Math.floor(Date.now() / 1000) + 5_184_000,
      })
    );

    vi.useRealTimers();
    client.destroy();
  });

  it('falls back to the short-lived token when allowShortLivedToken is enabled', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const client = createClient({ allowShortLivedToken: true });

    vi.spyOn(client.auth, 'exchangeCodeForToken').mockResolvedValue({
      accessToken: 'short-token',
      userId: 'user-1',
    });
    vi.spyOn(client.auth, 'exchangeForLongLivedToken').mockRejectedValue(
      new AuthenticationError('Failed to exchange for long-lived token')
    );
    const saveTokenSpy = vi.spyOn(client.auth, 'saveToken').mockResolvedValue(undefined);

    await expect(client.authenticate('oauth-code')).resolves.toBe('user-1');

    expect(saveTokenSpy).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        accessToken: 'short-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    expect((client as unknown as ClientInternals).httpClient.accessToken).toBe('short-token');

    vi.useRealTimers();
    client.destroy();
  });

  it('propagates the long-lived exchange error when the fallback is disabled', async () => {
    const client = createClient();

    vi.spyOn(client.auth, 'exchangeCodeForToken').mockResolvedValue({
      accessToken: 'short-token',
      userId: 'user-1',
    });
    vi.spyOn(client.auth, 'exchangeForLongLivedToken').mockRejectedValue(
      new AuthenticationError('Failed to exchange for long-lived token')
    );
    const saveTokenSpy = vi.spyOn(client.auth, 'saveToken').mockResolvedValue(undefined);

    await expect(client.authenticate('oauth-code')).rejects.toThrow(
      'Failed to exchange for long-lived token'
    );
    expect(saveTokenSpy).not.toHaveBeenCalled();

    client.destroy();
  });

  it('sets active user context from token storage', async () => {
    const storage = new MemoryTokenStorage();
    const client = createClient({ tokenStorage: storage });

    await storage.set('user-1', {
      accessToken: 'stored-token',
      tokenType: 'Bearer',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      userId: 'user-1',
    });

    await client.setUser('user-1');
    await expect(client.getToken('user-1')).resolves.toMatchObject({
      accessToken: 'stored-token',
    });

    expect((client as unknown as ClientInternals).httpClient.accessToken).toBe('stored-token');

    client.destroy();
  });

  it('throws when setting an unknown user context', async () => {
    const client = createClient();

    await expect(client.setUser('missing-user')).rejects.toMatchObject(
      new ValidationError('No valid token found for user missing-user', 'userId')
    );

    client.destroy();
  });

  it('sets access tokens directly and creates configured webhook handlers', () => {
    const client = createClient();

    client.setAccessToken('direct-token');
    expect((client as unknown as ClientInternals).httpClient.accessToken).toBe('direct-token');

    const webhook = client.createWebhookHandler('verify-token');
    expect(
      webhook.handleVerification({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'verify-token',
        'hub.challenge': 'challenge',
      })
    ).toBe('challenge');

    client.destroy();
  });
});
