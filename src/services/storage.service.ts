import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";
import { AppError } from "../errors/app-error.js";

export const MAX_SLIP_BYTES = 5 * 1024 * 1024;
function storage() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) throw new AppError(503, "Slip storage is not configured");
  return { bucket: R2_BUCKET, client: new S3Client({ region: "auto", endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }, requestHandler: { requestTimeout: 30000 }, maxAttempts: 2 }) };
}
export async function uploadUrl(key: string, mimeType: string, size: number) {
  const { client, bucket } = storage();
  return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mimeType, ContentLength: size }), { expiresIn: 300 });
}
export async function finalizeImage(uploadKey: string, finalKey: string, expectedSize: number) {
  const { client, bucket } = storage();
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: uploadKey }));
  if (!head.ContentLength || head.ContentLength > MAX_SLIP_BYTES || head.ContentLength !== expectedSize) throw new AppError(400, "Invalid slip size");
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: uploadKey, IfMatch: head.ETag }));
  if (!object.Body) throw new AppError(400, "Upload is missing");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > MAX_SLIP_BYTES) throw new AppError(400, "Slip exceeds 5 MB");
    chunks.push(Buffer.from(chunk));
  }
  let image: Buffer;
  try {
    const source = sharp(Buffer.concat(chunks), { limitInputPixels: 25000000 });
    const metadata = await source.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) throw new Error('Unsupported image');
    image = await source.rotate().jpeg({ quality: 92 }).toBuffer();
  } catch { throw new AppError(400, "Slip must be a valid JPEG, PNG or WebP image"); }
  // A new server-only key freezes the verified image; the upload URL cannot overwrite evidence.
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: finalKey, Body: image, ContentType: 'image/jpeg', CacheControl: 'private, no-store' }));
}
export async function downloadUrl(key: string) {
  const { client, bucket } = storage();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseCacheControl: 'private, no-store' }), { expiresIn: 300 });
}
