import { isValidProductId } from './validation';

// Mirrors PRODUCTIVITY_SUBSCRIPTION_PERIOD_MS in
// admin/src/lib/productivityFeatures.ts and the equivalent constant in
// netlify/functions/get-my-library.ts / scheduled-expire-productivity.ts -
// kept in sync by hand, same duplication pattern already used across these
// function boundaries elsewhere in this codebase.
export const PRODUCTIVITY_SUBSCRIPTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
export const PRODUCTIVITY_SUBSCRIPTION_PERIOD_DAYS = 30;

// Same shape the backup writer produces and the restore reader expects -
// kept in one place so both sides can never silently drift apart.
export interface BackupBuyerRecord {
  email: string;
  productIds: string[];
  expiresAt: string | null; // ISO date string, or null if the buyer never had one
  /**
   * Source of truth for the Productivity subscription - the exact same
   * field admin-update-buyer.ts writes and scheduled-expire-productivity.ts
   * reads. null if this buyer has never subscribed (or their subscription
   * has since expired/been removed). This is the ONLY productivity field
   * admin-restore-buyers.ts actually restores - the three below are derived
   * from it at backup time purely so the backup file itself is readable/
   * auditable without needing to run the math by hand.
   */
  productivitySubscribedAt: string | null;
  /** productivitySubscribedAt + 30 days, computed once when this backup was written. */
  productivitySubscriptionExpiresAt: string | null;
  /** Length of one subscription period in days (currently always 30, kept here so the file is self-describing even if this changes later). */
  productivitySubscriptionDurationDays: number | null;
  /**
   * Days left as of THIS backup's own createdAt - a snapshot number, not
   * live. It will be stale by the time you're reading it later; recompute
   * from productivitySubscribedAt (or just look at productivitySubscriptionExpiresAt)
   * for a current value.
   */
  productivitySubscriptionDaysRemainingAtBackup: number | null;
}

export interface BackupPayload {
  createdAt: string;
  count: number;
  buyers: BackupBuyerRecord[];
}

// Same email shape admin-update-buyer.ts validates against - Firestore
// treats "/" in a .doc(path) as a path separator, so this also guards
// against a corrupted/tampered backup file steering a restore write at an
// unexpected nested document.
const EMAIL_PATTERN = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

// A record field that must be either absent/null or a valid ISO-parseable
// date string - used identically for expiresAt and every productivity-*
// timestamp field below, so this is broken out once rather than repeated.
// "Absent" (undefined) is accepted alongside null specifically so a backup
// file written by an older version of scheduled-backup-buyers.ts (before
// the productivity-* fields existed) still passes validation and can still
// be restored - see isValidBackupPayload's comment on why silently
// rejecting a whole valid-but-older backup would itself be a regression.
const isNullOrIsoDateString = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
};

const isNullOrNumber = (value: unknown): boolean =>
  value === null || value === undefined || typeof value === 'number';

export const isValidBackupRecord = (value: unknown): value is BackupBuyerRecord => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;

  if (typeof record.email !== 'string' || !EMAIL_PATTERN.test(record.email)) return false;
  if (!Array.isArray(record.productIds) || !record.productIds.every(isValidProductId)) return false;
  if (!isNullOrIsoDateString(record.expiresAt)) return false;
  if (!isNullOrIsoDateString(record.productivitySubscribedAt)) return false;
  if (!isNullOrIsoDateString(record.productivitySubscriptionExpiresAt)) return false;
  if (!isNullOrNumber(record.productivitySubscriptionDurationDays)) return false;
  if (!isNullOrNumber(record.productivitySubscriptionDaysRemainingAtBackup)) return false;

  return true;
};

/**
 * Whole-file validation, not just per-record - restore only ever proceeds
 * if EVERY record in the file is well-formed. A backup that's even
 * partially corrupted/tampered is rejected outright rather than restoring
 * whatever happened to parse, since a partial restore would be more
 * confusing (and harder to notice) than an outright failure.
 */
export const isValidBackupPayload = (value: unknown): value is BackupPayload => {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Record<string, unknown>;
  return Array.isArray(payload.buyers) && payload.buyers.every(isValidBackupRecord);
};
