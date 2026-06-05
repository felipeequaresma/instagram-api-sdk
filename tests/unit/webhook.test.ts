import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { WebhookHandler } from '../../src/webhooks/WebhookHandler';

describe('WebhookHandler', () => {
  const config = {
    verifyToken: 'test_verify_token',
    appSecret: 'test_app_secret',
  };

  it('should handle verification challenge', () => {
    const webhook = new WebhookHandler(config);
    
    const query = {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'test_verify_token',
      'hub.challenge': 'challenge_string',
    };
    
    const result = webhook.handleVerification(query);
    expect(result).toBe('challenge_string');
  });

  it('should reject invalid verify token', () => {
    const webhook = new WebhookHandler(config);
    
    const query = {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong_token',
      'hub.challenge': 'challenge_string',
    };
    
    const result = webhook.handleVerification(query);
    expect(result).toBeNull();
  });

  it('should verify webhook signature', () => {
    const webhook = new WebhookHandler(config);
    
    const payload = JSON.stringify({ test: 'data' });
    const hmac = createHmac('sha256', config.appSecret);
    hmac.update(payload);
    const signature = `sha256=${hmac.digest('hex')}`;
    
    const isValid = webhook.verifySignature(payload, signature);
    expect(isValid).toBe(true);
  });

  it('should reject invalid signature', () => {
    const webhook = new WebhookHandler(config);
    
    const payload = JSON.stringify({ test: 'data' });
    const signature = 'sha256=invalid_signature';
    
    const isValid = webhook.verifySignature(payload, signature);
    expect(isValid).toBe(false);
  });
});
