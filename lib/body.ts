import { ensure } from "./model";
/** Enforce the real streamed length, including requests without Content-Length. */
export async function limitedBody(request: Request, limit: number) {
  ensure(
    Number(request.headers.get("content-length") || 0) <= limit,
    "حجم الطلب أكبر من الحد المسموح",
    413,
  );
  const reader = request.body?.getReader();
  ensure(reader, "الطلب فارغ");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > limit) {
        await reader.cancel();
        ensure(false, "حجم الطلب أكبر من الحد المسموح", 413);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
