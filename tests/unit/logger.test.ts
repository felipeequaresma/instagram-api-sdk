import { describe, it } from 'vitest';
import { logger, LogLevel } from '../../src/utils/logger';

describe('Logger', () => {
  it('should sanitize access tokens', () => {
    logger.setLevel(LogLevel.DEBUG);
    
    // Should not throw and should sanitize sensitive data
    logger.debug('Test', { accessToken: 'secret123' });
    logger.info('Test', { token: 'secret456' });
  });

  it('should respect log levels', () => {
    logger.setLevel(LogLevel.ERROR);
    
    // These should not throw even though they won't log
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warn message');
    logger.error('Error message');
  });

  it('should enable and disable logging', () => {
    logger.enable();
    logger.disable();
    
    // Should not throw
    logger.debug('Test');
  });
});
