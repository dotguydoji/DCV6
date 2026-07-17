import { isValidProductId } from './validation';

// Same shape the backup writer produces and the restore reader expects -
// kept in one place so both sides can never silently drift apart.
export interface BackupBuyerRecord {
  email: string;
  productIds: string[];
  expiresAt: string | null; // ISO date string, or null if the buyer never had one
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

export const isValidBackupRecord = (value: unknown): value is BackupBuyerRecord => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;

  if (typeof record.email !== 'string' || !EMAIL_PATTERN.test(record.email)) return false;
  if (!Array.isArray(record.productIds) || !record.productIds.every(isValidProductId)) return false;
  if (record.expiresAt !== null && typeof record.expiresAt !== 'string') return false;
  if (typeof record.expiresAt === 'string' && Number.isNaN(Date.parse(record.expiresAt))) return false;

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
