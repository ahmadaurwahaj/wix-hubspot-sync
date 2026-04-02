type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEYS = [
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'password',
  'secret',
  'apiKey',
  'api_key',
  'clientSecret',
  'client_secret',
];

function sanitizeData(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }

  const sanitized: any = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some(sk => lowerKey.includes(sk.toLowerCase()));
    
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeData(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function shouldLog(level: LogLevel): boolean {
  const configLevel = 'info';
  const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  const configIndex = levels.indexOf(configLevel as LogLevel);
  const messageIndex = levels.indexOf(level);
  return messageIndex >= configIndex;
}

function formatMessage(level: LogLevel, message: string, data?: any): string {
  const timestamp = new Date().toISOString();
  const safeLogging = true;
  const sanitizedData = safeLogging && data ? sanitizeData(data) : data;
  
  const logData = sanitizedData ? ` ${JSON.stringify(sanitizedData)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${logData}`;
}

export const logger = {
  debug(message: string, data?: any) {
    if (shouldLog('debug')) {
      console.log(formatMessage('debug', message, data));
    }
  },

  info(message: string, data?: any) {
    if (shouldLog('info')) {
      console.log(formatMessage('info', message, data));
    }
  },

  warn(message: string, data?: any) {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, data));
    }
  },

  error(message: string, error?: any) {
    if (shouldLog('error')) {
      const errorData = error instanceof Error 
        ? { message: error.message, stack: error.stack }
        : error;
      console.error(formatMessage('error', message, errorData));
    }
  },
};
