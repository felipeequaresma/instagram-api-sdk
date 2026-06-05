import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileTokenStorage, MemoryTokenStorage } from '../../src/auth/TokenStorage';
import type { TokenData } from '../../src/types';

describe('TokenStorage', () => {
  let tempDir: string;

  const token: TokenData = {
    accessToken: 'access-token',
    tokenType: 'Bearer',
    expiresAt: 1_800_000_000,
    userId: 'user-1',
    scopes: ['instagram_business_basic'],
  };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'instagram-sdk-storage-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('stores, loads, and deletes tokens in memory', async () => {
    const storage = new MemoryTokenStorage();

    await expect(storage.get('user-1')).resolves.toBeNull();
    await storage.set('user-1', token);
    await expect(storage.get('user-1')).resolves.toEqual(token);

    await storage.delete('user-1');
    await expect(storage.get('user-1')).resolves.toBeNull();

    await storage.set('user-1', token);
    storage.clear();
    await expect(storage.get('user-1')).resolves.toBeNull();
  });

  it('persists file storage tokens to nested directories', async () => {
    const filePath = join(tempDir, 'nested', 'tokens.json');
    const storage = new FileTokenStorage(filePath);

    await expect(storage.get('user-1')).resolves.toBeNull();
    await storage.set('user-1', token);
    await expect(storage.get('user-1')).resolves.toEqual(token);

    await expect(readFile(filePath, 'utf-8')).resolves.toContain('"accessToken": "access-token"');

    const reloadedStorage = new FileTokenStorage(filePath);
    await expect(reloadedStorage.get('user-1')).resolves.toEqual(token);

    await reloadedStorage.delete('user-1');
    await expect(reloadedStorage.get('user-1')).resolves.toBeNull();
  });

  it('returns null when a cached file token entry is undefined', async () => {
    const storage = new FileTokenStorage(join(tempDir, 'tokens.json'));
    const internals = storage as unknown as { cache: Map<string, TokenData | undefined> };
    internals.cache.set('user-1', undefined);

    await expect(storage.get('user-1')).resolves.toBeNull();
  });

  it('propagates invalid token file parse errors', async () => {
    const filePath = join(tempDir, 'tokens.json');
    await writeFile(filePath, '{not-valid-json', 'utf-8');

    const storage = new FileTokenStorage(filePath);

    await expect(storage.get('user-1')).rejects.toBeInstanceOf(SyntaxError);
  });

  it('propagates file save errors', async () => {
    const parentFile = join(tempDir, 'not-a-directory');
    await writeFile(parentFile, 'file content', 'utf-8');

    const storage = new FileTokenStorage(join(parentFile, 'tokens.json'));

    await expect(storage.set('user-1', token)).rejects.toThrow();
  });
});
