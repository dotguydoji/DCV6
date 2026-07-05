import { OAuth2Client } from 'google-auth-library';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

const parseEmailList = (value: string | undefined) =>
  new Set(
    (value ?? '')
      .toLowerCase()
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean)
  );

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const ADMIN_ALLOWED_EMAILS = parseEmailList(process.env.ADMIN_ALLOWED_EMAIL);
const ADMIN_FILE_MANAGER_EMAILS = parseEmailList(process.env.ADMIN_FILE_MANAGER_EMAILS);

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export class AdminAuthError extends Error {}

/**
 * Verifies the Google ID token is genuinely from Google, then requires the
 * verified email to be one of ADMIN_ALLOWED_EMAILS (comma-separated). This is
 * the single security boundary every admin function relies on - never trust
 * a client-supplied email, and never skip this check.
 */
export const verifyAdmin = async (idToken: unknown): Promise<string> => {
  if (typeof idToken !== 'string' || !idToken) {
    throw new AdminAuthError('Missing idToken');
  }

  let verifiedEmail: string | undefined;

  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (payload?.email && payload.email_verified) {
      verifiedEmail = payload.email.toLowerCase();
    }
  } catch {
    throw new AdminAuthError('Invalid sign-in');
  }

  if (!verifiedEmail || ADMIN_ALLOWED_EMAILS.size === 0 || !ADMIN_ALLOWED_EMAILS.has(verifiedEmail)) {
    throw new AdminAuthError('Not authorized');
  }

  return verifiedEmail;
};

/**
 * File management (upload/delete in R2) is a narrower permission than
 * general admin access - some admins can manage buyers but not touch files.
 */
export const canManageFiles = (email: string): boolean => ADMIN_FILE_MANAGER_EMAILS.has(email);

let firestoreInstance: Firestore | null = null;

export const getAdminFirestore = (): Firestore => {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  const app = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert(JSON.parse(process.env.ADMIN_FIREBASE_SERVICE_ACCOUNT ?? '{}'))
      });

  firestoreInstance = getFirestore(app);
  return firestoreInstance;
};

export const jsonResponse = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});
