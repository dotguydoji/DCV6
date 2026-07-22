// Mirrors PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID in the main site's
// src/constants.ts and admin/netlify/functions/lib/productivityFeatures.ts -
// kept in sync by hand across all three, same pattern already used for
// PRODUCT_ID_PATTERN duplication between the site and this admin app.
export const PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID = 'productivity-subscription';
export const PRODUCTIVITY_SUBSCRIPTION_LABEL = 'Productivity Subscription';
export const PRODUCTIVITY_SUBSCRIPTION_PRICE_LABEL = '₱59/month';
export const PRODUCTIVITY_SUBSCRIPTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/** subscribedAt + 30 days - the same cutoff scheduled-expire-productivity.ts uses to remove access. */
export const getProductivityExpiresAt = (subscribedAt: string): Date =>
  new Date(new Date(subscribedAt).getTime() + PRODUCTIVITY_SUBSCRIPTION_PERIOD_MS);
