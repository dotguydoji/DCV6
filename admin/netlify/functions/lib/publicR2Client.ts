import { S3Client } from '@aws-sdk/client-s3';

// Deliberately a SEPARATE client + credential pair from r2Client.ts's
// private-PDF bucket (dc-notes) - this one only ever touches dc-notes-images,
// the existing public-read bucket product thumbnails already live in (see
// VITE_IMAGE_BASE_URL / img.dojicreates.com). Keeping the credentials split
// means an R2 API token scoped to just this public bucket (Cloudflare
// dashboard > R2 > Manage API Tokens > scope to "dc-notes-images" only) can
// never touch the private PDF bucket even if it were ever compromised -
// same reasoning that already kept the two buckets themselves separate.
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';

export const R2_PUBLIC_BUCKET_NAME = process.env.R2_PUBLIC_BUCKET_NAME ?? '';

export const publicR2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_PUBLIC_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_PUBLIC_SECRET_ACCESS_KEY ?? ''
  }
});
