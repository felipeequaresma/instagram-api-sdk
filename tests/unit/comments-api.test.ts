import { describe, expect, it, vi } from 'vitest';
import { CommentsApi } from '../../src/features/comments/CommentsApi';
import { ValidationError } from '../../src/errors/InstagramError';
import type { HttpClient } from '../../src/client/HttpClient';

type MockHttpClient = Pick<HttpClient, 'get' | 'post' | 'delete'>;

const createHttpClient = (): MockHttpClient => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
});

describe('CommentsApi', () => {
  it('lists comments with pagination and expected fields', async () => {
    const httpClient = createHttpClient();
    const api = new CommentsApi(httpClient as HttpClient);
    const response = { data: [{ id: 'comment-1', text: 'Hello' }] };
    vi.mocked(httpClient.get).mockResolvedValue(response);

    await expect(api.list('media-1', 10, 'cursor')).resolves.toBe(response);

    expect(httpClient.get).toHaveBeenCalledWith('/media-1/comments', {
      params: {
        limit: 10,
        after: 'cursor',
        fields: 'id,text,timestamp,from,like_count,hidden,parent_id',
      },
    });
  });

  it('gets comments and replies by id', async () => {
    const httpClient = createHttpClient();
    const api = new CommentsApi(httpClient as HttpClient);
    const comment = { id: 'comment-1', text: 'Hello' };
    const replies = { data: [{ id: 'reply-1' }] };

    vi.mocked(httpClient.get).mockResolvedValueOnce(comment).mockResolvedValueOnce(replies);

    await expect(api.get('comment-1')).resolves.toBe(comment);
    await expect(api.getReplies('comment-1', 5)).resolves.toBe(replies);

    expect(httpClient.get).toHaveBeenNthCalledWith(1, '/comment-1', {
      params: {
        fields: 'id,text,timestamp,from,like_count,hidden,parent_id',
      },
    });
    expect(httpClient.get).toHaveBeenNthCalledWith(2, '/comment-1/replies', {
      params: {
        limit: 5,
        fields: 'id,text,timestamp,from,like_count,hidden',
      },
    });
  });

  it('creates replies and returns the normalized comment id', async () => {
    const httpClient = createHttpClient();
    const api = new CommentsApi(httpClient as HttpClient);
    vi.mocked(httpClient.post).mockResolvedValue({ id: 'reply-1' });

    await expect(api.reply({ commentId: 'comment-1', message: 'Thanks' })).resolves.toEqual({
      commentId: 'reply-1',
    });

    expect(httpClient.post).toHaveBeenCalledWith('/comment-1/replies', { message: 'Thanks' });
  });

  it('hides, unhides, and deletes comments', async () => {
    const httpClient = createHttpClient();
    const api = new CommentsApi(httpClient as HttpClient);
    vi.mocked(httpClient.post).mockResolvedValue({});
    vi.mocked(httpClient.delete).mockResolvedValue({});

    await expect(api.hide('comment-1')).resolves.toEqual({ success: true });
    await expect(api.unhide('comment-1')).resolves.toEqual({ success: true });
    await expect(api.delete('comment-1')).resolves.toEqual({ success: true });

    expect(httpClient.post).toHaveBeenNthCalledWith(1, '/comment-1', { hide: true });
    expect(httpClient.post).toHaveBeenNthCalledWith(2, '/comment-1', { hide: false });
    expect(httpClient.delete).toHaveBeenCalledWith('/comment-1');
  });

  it('validates required ids and messages', async () => {
    const api = new CommentsApi(createHttpClient() as HttpClient);

    await expect(api.list('')).rejects.toMatchObject(new ValidationError('mediaId is required', 'mediaId'));
    await expect(api.get('')).rejects.toMatchObject(
      new ValidationError('commentId is required', 'commentId')
    );
    await expect(api.getReplies('')).rejects.toMatchObject(
      new ValidationError('commentId is required', 'commentId')
    );
    await expect(api.reply({ commentId: '', message: 'reply' })).rejects.toMatchObject(
      new ValidationError('commentId is required', 'commentId')
    );
    await expect(api.reply({ commentId: 'comment-1', message: '' })).rejects.toMatchObject(
      new ValidationError('message is required', 'message')
    );
    await expect(api.hide('')).rejects.toMatchObject(
      new ValidationError('commentId is required', 'commentId')
    );
    await expect(api.unhide('')).rejects.toMatchObject(
      new ValidationError('commentId is required', 'commentId')
    );
    await expect(api.delete('')).rejects.toMatchObject(
      new ValidationError('commentId is required', 'commentId')
    );
  });
});
