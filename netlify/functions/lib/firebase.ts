import { cert, getApps, initializeApp } from 'firebase-admin/app';

export const getFirebaseApp = () => {
  if (getApps().length) {
    return getApps()[0];
  }

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? '{}');
  return initializeApp({
    credential: cert(serviceAccount)
  });
};
