import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { publicR2Client, R2_PUBLIC_BUCKET_NAME } from './publicR2Client';

// Everything under this prefix is public, non-sensitive marketing content
// (thumbnails + titles/descriptions of things that have already shipped) -
// deliberately in the PUBLIC images bucket (dc-notes-images), never the
// private PDF bucket (dc-notes), so a misconfiguration here can never expose
// a member-only file. See publicR2Client.ts for the bucket split.
const PREFIX = 'new-releases/';
const VIDEOS_KEY = `${PREFIX}videos.json`;
const PDFS_KEY = `${PREFIX}pdfs.json`;
export const THUMBNAIL_PREFIX = `${PREFIX}thumbnails/`;

export const MAX_VIDEOS = 2;
export const MAX_TITLE_LENGTH = 150;
export const MAX_DESCRIPTION_LENGTH = 500;

// UUID v4 + a small allowlist of image extensions - matches exactly what
// admin-get-new-release-upload-url.ts ever hands out, so this doubles as a
// guard against a client supplying an arbitrary R2 key outside the intended
// thumbnails folder.
export const THUMBNAIL_KEY_PATTERN =
  /^new-releases\/thumbnails\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpe?g)$/;

export const isValidThumbnailKey = (value: unknown): value is string =>
  typeof value === 'string' && THUMBNAIL_KEY_PATTERN.test(value);

export interface NewReleaseVideoItem {
  id: string;
  title: string;
  description: string;
  thumbnailKey: string;
  youtubeId: string;
  addedAt: number;
}

export interface NewReleasePdfItem {
  id: string;
  title: string;
  description: string;
  thumbnailKey: string;
  productId: string;
  addedAt: number;
}

const readManifest = async <T>(key: string): Promise<T[]> => {
  try {
    const result = await publicR2Client.send(new GetObjectCommand({ Bucket: R2_PUBLIC_BUCKET_NAME, Key: key }));
    const raw = await result.Body?.transformToString();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.items) ? (parsed.items as T[]) : [];
  } catch (err: any) {
    // NoSuchKey just means nothing has ever been published yet - a genuinely
    // empty list, not an error. Any other failure (network, malformed JSON,
    // permissions) is rethrown so a caller never mistakes "couldn't read the
    // real data" for "there's nothing there" and silently overwrites it.
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
      return [];
    }
    throw err;
  }
};

const writeManifest = async <T>(key: string, items: T[]): Promise<void> => {
  await publicR2Client.send(
    new PutObjectCommand({
      Bucket: R2_PUBLIC_BUCKET_NAME,
      Key: key,
      Body: JSON.stringify({ items, updatedAt: Date.now() }),
      ContentType: 'application/json'
    })
  );
};

export const readVideos = (): Promise<NewReleaseVideoItem[]> => readManifest<NewReleaseVideoItem>(VIDEOS_KEY);
export const writeVideos = (items: NewReleaseVideoItem[]): Promise<void> => writeManifest(VIDEOS_KEY, items);
export const readPdfs = (): Promise<NewReleasePdfItem[]> => readManifest<NewReleasePdfItem>(PDFS_KEY);
export const writePdfs = (items: NewReleasePdfItem[]): Promise<void> => writeManifest(PDFS_KEY, items);
