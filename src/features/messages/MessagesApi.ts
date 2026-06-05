import type { HttpClient } from '../../client/HttpClient';
import { ValidationError } from '../../errors/InstagramError';
import type {
  Conversation,
  Message,
  PaginatedResponse,
  SendMessageOptions,
} from '../../types/index';
import { logger } from '../../utils/logger';

/**
 * Instagram Messages (Direct Messages) API
 */
export class MessagesApi {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * Send a text message via DM
   * Note: Can only send messages within 24-hour window after user initiates conversation
   */
  async send(options: SendMessageOptions): Promise<{ messageId: string }> {
    if (!options.text && !options.attachment) {
      throw new ValidationError('Either text or attachment must be provided');
    }

    if (!options.recipientId) {
      throw new ValidationError('recipientId is required', 'recipientId');
    }

    logger.debug('Sending message', { recipientId: options.recipientId });

    const payload: Record<string, unknown> = {
      recipient: { id: options.recipientId },
    };

    if (options.text) {
      payload.message = { text: options.text };
    }

    if (options.attachment) {
      payload.message = {
        attachment: {
          type: options.attachment.type,
          payload: {
            url: options.attachment.url,
          },
        },
      };
    }

    const response = await this.httpClient.post<{ message_id: string }>('/me/messages', payload);

    logger.info('Message sent successfully', { messageId: response.message_id });

    return { messageId: response.message_id };
  }

  /**
   * Send a text message (convenience method)
   */
  async sendText(recipientId: string, text: string): Promise<{ messageId: string }> {
    return this.send({ recipientId, text });
  }

  /**
   * Send an image message
   */
  async sendImage(recipientId: string, imageUrl: string): Promise<{ messageId: string }> {
    return this.send({
      recipientId,
      attachment: {
        type: 'image',
        url: imageUrl,
      },
    });
  }

  /**
   * Send a video message
   */
  async sendVideo(recipientId: string, videoUrl: string): Promise<{ messageId: string }> {
    return this.send({
      recipientId,
      attachment: {
        type: 'video',
        url: videoUrl,
      },
    });
  }

  /**
   * Get conversations
   */
  async getConversations(limit: number = 25): Promise<PaginatedResponse<Conversation>> {
    logger.debug('Fetching conversations', { limit });

    const response = await this.httpClient.get<PaginatedResponse<Conversation>>(
      '/me/conversations',
      {
        params: { limit },
      }
    );

    return response;
  }

  /**
   * Get messages in a conversation
   */
  async getMessages(
    conversationId: string,
    limit: number = 25
  ): Promise<PaginatedResponse<Message>> {
    logger.debug('Fetching messages', { conversationId, limit });

    const response = await this.httpClient.get<PaginatedResponse<Message>>(
      `/${conversationId}/messages`,
      {
        params: { limit },
      }
    );

    return response;
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId: string): Promise<{ success: boolean }> {
    logger.debug('Marking message as read', { messageId });

    await this.httpClient.post(`/${messageId}`, {
      read: true,
    });

    return { success: true };
  }
}
