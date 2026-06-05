import { describe, expect, it, vi } from 'vitest';
import type { HttpClient } from '../../src/client/HttpClient';
import { ValidationError } from '../../src/errors/InstagramError';
import { MessagesApi } from '../../src/features/messages/MessagesApi';

type MockHttpClient = Pick<HttpClient, 'get' | 'post'>;

const createHttpClient = (): MockHttpClient => ({
  get: vi.fn(),
  post: vi.fn(),
});

describe('MessagesApi', () => {
  it('sends text messages', async () => {
    const httpClient = createHttpClient();
    const api = new MessagesApi(httpClient as HttpClient);
    vi.mocked(httpClient.post).mockResolvedValue({ message_id: 'message-1' });

    await expect(api.sendText('recipient-1', 'Hello')).resolves.toEqual({
      messageId: 'message-1',
    });

    expect(httpClient.post).toHaveBeenCalledWith('/me/messages', {
      recipient: { id: 'recipient-1' },
      message: { text: 'Hello' },
    });
  });

  it('sends image and video attachments', async () => {
    const httpClient = createHttpClient();
    const api = new MessagesApi(httpClient as HttpClient);
    vi.mocked(httpClient.post)
      .mockResolvedValueOnce({ message_id: 'image-message' })
      .mockResolvedValueOnce({ message_id: 'video-message' });

    await expect(api.sendImage('recipient-1', 'https://example.com/image.jpg')).resolves.toEqual({
      messageId: 'image-message',
    });
    await expect(api.sendVideo('recipient-1', 'https://example.com/video.mp4')).resolves.toEqual({
      messageId: 'video-message',
    });

    expect(httpClient.post).toHaveBeenNthCalledWith(1, '/me/messages', {
      recipient: { id: 'recipient-1' },
      message: {
        attachment: {
          type: 'image',
          payload: { url: 'https://example.com/image.jpg' },
        },
      },
    });
    expect(httpClient.post).toHaveBeenNthCalledWith(2, '/me/messages', {
      recipient: { id: 'recipient-1' },
      message: {
        attachment: {
          type: 'video',
          payload: { url: 'https://example.com/video.mp4' },
        },
      },
    });
  });

  it('uses attachment payload when text and attachment are both provided', async () => {
    const httpClient = createHttpClient();
    const api = new MessagesApi(httpClient as HttpClient);
    vi.mocked(httpClient.post).mockResolvedValue({ message_id: 'message-1' });

    await api.send({
      recipientId: 'recipient-1',
      text: 'ignored when attachment exists',
      attachment: {
        type: 'image',
        url: 'https://example.com/image.jpg',
      },
    });

    expect(httpClient.post).toHaveBeenCalledWith('/me/messages', {
      recipient: { id: 'recipient-1' },
      message: {
        attachment: {
          type: 'image',
          payload: { url: 'https://example.com/image.jpg' },
        },
      },
    });
  });

  it('gets conversations and messages', async () => {
    const httpClient = createHttpClient();
    const api = new MessagesApi(httpClient as HttpClient);
    const conversations = { data: [{ id: 'conversation-1' }] };
    const messages = { data: [{ id: 'message-1' }] };
    vi.mocked(httpClient.get).mockResolvedValueOnce(conversations).mockResolvedValueOnce(messages);

    await expect(api.getConversations(7)).resolves.toBe(conversations);
    await expect(api.getMessages('conversation-1', 3)).resolves.toBe(messages);

    expect(httpClient.get).toHaveBeenNthCalledWith(1, '/me/conversations', {
      params: { limit: 7 },
    });
    expect(httpClient.get).toHaveBeenNthCalledWith(2, '/conversation-1/messages', {
      params: { limit: 3 },
    });
  });

  it('marks messages as read', async () => {
    const httpClient = createHttpClient();
    const api = new MessagesApi(httpClient as HttpClient);
    vi.mocked(httpClient.post).mockResolvedValue({});

    await expect(api.markAsRead('message-1')).resolves.toEqual({ success: true });

    expect(httpClient.post).toHaveBeenCalledWith('/message-1', { read: true });
  });

  it('validates message send inputs', async () => {
    const api = new MessagesApi(createHttpClient() as HttpClient);

    await expect(api.send({ recipientId: 'recipient-1' })).rejects.toMatchObject(
      new ValidationError('Either text or attachment must be provided')
    );
    await expect(api.send({ recipientId: '', text: 'Hello' })).rejects.toMatchObject(
      new ValidationError('recipientId is required', 'recipientId')
    );
  });
});
