export const PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const isValidProductId = (value: unknown): value is string =>
  typeof value === 'string' && PRODUCT_ID_PATTERN.test(value);
