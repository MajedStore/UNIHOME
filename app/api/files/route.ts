import { randomUUID } from "node:crypto";
import { authenticated, sameOrigin, sessionHash } from "@/lib/auth";
import { limitedBody } from "@/lib/body";
import { AppError, ensure } from "@/lib/model";
import { mutate, readState } from "@/lib/store";
import { getFile, putFile } from "@/lib/storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof AppError
          ? error.message
          : "تعذر الوصول إلى الملف، تحقق من إعدادات التخزين",
    },
    { status: error instanceof AppError ? error.status : 500 },
  );
}
export async function GET(request: Request) {
  try {
    const state = await readState();
    const user = authenticated(state, await sessionHash());
    const file = state.files.find(
      (f) => f.id === new URL(request.url).searchParams.get("id"),
    );
    ensure(file, "الملف غير موجود", 404);
    ensure(
      file.ownerId === user.id || user.role === "admin",
      "لا يمكنك الوصول لهذا الملف",
      403,
    );
    return await getFile(file.key, file.type, file.name);
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const hash = await sessionHash();
    authenticated(await readState(), hash);
    const bytesBody = await limitedBody(request, 6 * 1024 * 1024);
    const form = await new Response(new Uint8Array(bytesBody), {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    const kind = form.get("kind");
    const paymentId = String(form.get("paymentId") || "");
    ensure(
      file instanceof File && file.size > 0 && file.size <= 5 * 1024 * 1024,
      "اختر ملفًا بحجم أقل من 5 ميغابايت",
    );
    ensure(kind === "receipt" || kind === "avatar", "نوع الملف غير صحيح");
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "image/png"
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? "image/jpeg"
        : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP"
          ? "image/webp"
          : bytes.subarray(0, 5).toString() === "%PDF-"
            ? "application/pdf"
            : "";
    ensure(
      type && (kind === "receipt" || type !== "application/pdf"),
      "الأنواع المدعومة: PNG وJPG وWebP، وPDF للإيصالات",
    );
    const state = await readState();
    const owner = authenticated(state, hash);
    if (kind === "receipt")
      ensure(
        state.payments.some(
          (p) =>
            p.id === paymentId &&
            p.userId === owner.id &&
            ["unpaid", "review"].includes(p.status),
        ),
        "لا يمكن إرفاق وصل بهذا الطلب",
        403,
      );
    const id = randomUUID();
    await putFile(id, bytes, type);
    await mutate((state) => {
      const actor = authenticated(state, hash);
      if (kind === "avatar") actor.avatar = id;
      else {
        const p = state.payments.find(
          (p) => p.id === paymentId && p.userId === actor.id,
        );
        ensure(
          p && ["unpaid", "review"].includes(p.status),
          "تغيرت حالة الطلب، حدّث الصفحة",
        );
        p.receipt = id;
      }
      state.files.push({
        id,
        key: id,
        ownerId: actor.id,
        paymentId: kind === "receipt" ? paymentId : undefined,
        kind,
        type,
        name: file.name.slice(0, 160),
      });
    });
    return Response.json({ ok: true, id });
  } catch (error) {
    return failure(error);
  }
}
