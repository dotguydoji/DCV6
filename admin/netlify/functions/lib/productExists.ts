import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET_NAME } from './r2Client';

/** Whether a real uploaded PDF backs this product id - shared by anything that assigns a productId to a buyer or a package, so neither can reference a file that doesn't actually exist in R2. */
export const productFileExists = async (productId: string): Promise<boolean> => {
  try {
    await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: `pdfs/${productId}.pdf` }));
    return true;
  } catch {
    return false;
  }
};
