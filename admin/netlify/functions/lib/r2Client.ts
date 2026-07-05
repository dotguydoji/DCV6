import { S3Client } from '@aws-sdk/client-s3';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';

export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? '';

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.ADMIN_R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.ADMIN_R2_SECRET_ACCESS_KEY ?? ''
  }
});
