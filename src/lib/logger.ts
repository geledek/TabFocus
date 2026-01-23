/**
 * Log levels
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Whether debug logging is enabled
 */
const DEBUG_ENABLED =
  typeof chrome !== 'undefined' &&
  chrome.runtime?.getManifest?.()?.version?.includes('dev');

/**
 * Format a log message with timestamp and context
 */
function formatMessage(level: LogLevel, context: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [TabFocus] [${level.toUpperCase()}] [${context}] ${message}`;
}

/**
 * Logger utility for consistent logging across the extension
 */
export const logger = {
  /**
   * Debug level logging (only in development)
   */
  debug(context: string, message: string, data?: unknown): void {
    if (DEBUG_ENABLED) {
      console.debug(formatMessage('debug', context, message), data ?? '');
    }
  },

  /**
   * Info level logging
   */
  info(context: string, message: string, data?: unknown): void {
    console.info(formatMessage('info', context, message), data ?? '');
  },

  /**
   * Warning level logging
   */
  warn(context: string, message: string, data?: unknown): void {
    console.warn(formatMessage('warn', context, message), data ?? '');
  },

  /**
   * Error level logging
   */
  error(context: string, message: string, error?: unknown): void {
    console.error(formatMessage('error', context, message), error ?? '');
  },

  /**
   * Create a scoped logger for a specific context
   */
  scope(context: string) {
    return {
      debug: (message: string, data?: unknown) =>
        logger.debug(context, message, data),
      info: (message: string, data?: unknown) =>
        logger.info(context, message, data),
      warn: (message: string, data?: unknown) =>
        logger.warn(context, message, data),
      error: (message: string, error?: unknown) =>
        logger.error(context, message, error),
    };
  },
};

/**
 * Error wrapper for consistent error handling
 */
export class TabFocusError extends Error {
  constructor(
    message: string,
    public readonly context: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TabFocusError';
    logger.error(context, message, cause);
  }
}

/**
 * Wrap an async function with error handling
 */
export function withErrorHandling<T extends unknown[], R>(
  context: string,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      throw new TabFocusError(
        error instanceof Error ? error.message : 'Unknown error',
        context,
        error
      );
    }
  };
}
