import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { demo, dataPath } from "./store";
function client() {
  if (
    !process.env.R2_ACCOUNT_ID ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY ||
    !process.env.R2_BUCKET
  )
    throw new Error("R2 configuration is missing");
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}
export async function deleteFile(key: string) {
  if (demo) {
    const root = path.resolve(dataPath, "uploads");
    const target = path.resolve(root, key);
    if (path.dirname(target) !== root) throw new Error("Invalid file key");
    try {
      await unlink(target);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  } else {
    const s3 = client();
    try {
      await s3.send(
        new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
    } finally {
      s3.destroy();
    }
  }
}
export async function putFile(key: string, buffer: Buffer, type: string) {
  if (demo) {
    await mkdir(path.join(dataPath, "uploads"), { recursive: true });
    await writeFile(path.join(dataPath, "uploads", key), buffer);
  } else
    await client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: type,
      }),
    );
}
export async function getFile(key: string, type: string, name: string) {
  if (demo)
    return new Response(
      new Uint8Array(await readFile(path.join(dataPath, "uploads", key))),
      {
        headers: {
          "Content-Type": type,
          "Cache-Control": "private, no-store",
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  const url = await getSignedUrl(
    client(),
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ResponseContentType: type,
      ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      ResponseCacheControl: "private, no-store",
    }),
    { expiresIn: 60 },
  );
  return Response.redirect(url);
}
