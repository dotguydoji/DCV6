// The Productivity category is a single bundled subscription (₱59/month) -
// kept in sync by hand with PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID in the main
// site's src/constants.ts and admin/src/lib/productivityFeatures.ts (that
// file isn't reachable from these Netlify functions, same reason
// admin/netlify/functions/lib/validation.ts duplicates the main site's
// PRODUCT_ID_PATTERN instead of importing it). admin-update-buyer.ts uses
// this to skip its "must have an uploaded file" check for exactly this id,
// and to know when to record/clear the subscription start date.
export const PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID = 'productivity-subscription';

export const isProductivitySubscriptionProductId = (id: string): boolean =>
  id === PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID;
