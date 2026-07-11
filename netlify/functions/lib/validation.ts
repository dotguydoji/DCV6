export const PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const isValidProductId = (value: unknown): value is string =>
  typeof value === 'string' && PRODUCT_ID_PATTERN.test(value);

// Matches the shape of a crypto.randomUUID() output (see
// src/lib/chatbotSession.ts) - not a security boundary itself, just bounds
// what can be used as a rate-limit/cache Map key.
export const CHATBOT_SESSION_ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;

export const isValidChatbotSessionId = (value: unknown): value is string =>
  typeof value === 'string' && CHATBOT_SESSION_ID_PATTERN.test(value);
