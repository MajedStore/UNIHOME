import nextEnv from "@next/env";
import { MongoClient } from "mongodb";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

export async function checkConnections(mode = "development") {
  nextEnv.loadEnvConfig(process.cwd(), mode === "development");
  let failed = false;
  const fail = (message) => {
    failed = true;
    console.error("[FAIL] " + message);
  };
  const required = (keys) => {
    const missing = keys.filter((key) => !process.env[key]?.trim());
    if (missing.length) fail("إعدادات ناقصة: " + missing.join(", "));
    return !missing.length;
  };
  if (process.env.APP_ORIGIN) {
    try {
      const url = new URL(process.env.APP_ORIGIN);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.origin !== process.env.APP_ORIGIN
      )
        throw Error();
    } catch {
      fail("APP_ORIGIN يجب أن يكون أصل الموقع دون مسار أو شرطة أخيرة");
    }
  }
  try {
    new Intl.NumberFormat("ar", {
      style: "currency",
      currency: process.env.APP_CURRENCY || "TRY",
    });
  } catch {
    fail("APP_CURRENCY غير صالح");
  }
  if (process.env.DEMO_MODE === "true") {
    console.log(
      "[DEMO] وضع محلي: لم يتم فحص MongoDB أو R2. استخدم DEMO_MODE=false لفحص الربط الفعلي.",
    );
    return !failed;
  }
  const mongoReady = required(["MONGODB_URI"]);
  const r2Ready = required([
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  ]);
  await Promise.all([
    (async () => {
      if (!mongoReady) return;
      let client;
      try {
        client = new MongoClient(process.env.MONGODB_URI, {
          serverSelectionTimeoutMS: 10000,
          connectTimeoutMS: 10000,
          socketTimeoutMS: 10000,
        });
        await client.connect();
        const collection = client
          .db(process.env.MONGODB_DB || "unihome")
          .collection("households");
        await collection.findOne(
          { _id: "home" },
          { projection: { _id: 1 }, maxTimeMS: 10000 },
        );
        // A no-match update checks write permission without modifying household data.
        await collection.updateOne(
          { _id: "__startup_" + randomUUID() },
          { $set: { probe: true } },
          { upsert: false, maxTimeMS: 10000 },
        );
        console.log("[OK] MongoDB: الاتصال وصلاحيات القراءة والكتابة سليمة");
      } catch (error) {
        fail(
          error.code === 8000 || error.code === 18
            ? "MongoDB: اسم المستخدم أو كلمة المرور غير صحيحة"
            : error.code === 13
              ? "MongoDB: صلاحيات قاعدة البيانات غير كافية"
              : "MongoDB: تعذر الاتصال أو التحقق من الصلاحيات؛ راجع الرابط وقائمة IP المسموحة",
        );
      } finally {
        await client?.close();
      }
    })(),
    (async () => {
      if (!r2Ready) return;
      if (!/^[a-f0-9]{32}$/i.test(process.env.R2_ACCOUNT_ID)) {
        fail(
          "R2_ACCOUNT_ID يجب أن يكون معرّف الحساب (32 خانة)، وليس رابط endpoint",
        );
        return;
      }
      const client = new S3Client({
        region: "auto",
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
        maxAttempts: 1,
      });
      const target = {
        Bucket: process.env.R2_BUCKET,
        Key: ".unihome-health/" + randomUUID(),
      };
      let written = false;
      const send = (command) =>
        client.send(command, { abortSignal: AbortSignal.timeout(15000) });
      try {
        await send(
          new PutObjectCommand({
            ...target,
            Body: "unihome-startup-check",
            ContentType: "text/plain",
          }),
        );
        written = true;
        const result = await send(new GetObjectCommand(target));
        if (
          (await result.Body?.transformToString()) !== "unihome-startup-check"
        )
          throw Error("Mismatch");
        console.log("[OK] R2: المفتاح والحاوية وصلاحيات الرفع والقراءة سليمة");
      } catch (error) {
        const status = error.$metadata?.httpStatusCode;
        const reason =
          status === 403
            ? "رفض الوصول: راجع المفتاح السري وصلاحيات الحاوية"
            : status === 404
              ? "الحاوية غير موجودة في الحساب المحدد"
              : "تحقق من المفاتيح والحاوية وصلاحياتها والاتصال";
        fail(
          "R2: فشل اختبار الرفع/القراءة؛ " +
            reason +
            (status ? ` (HTTP ${status})` : ""),
        );
      } finally {
        if (written) {
          try {
            await send(new DeleteObjectCommand(target));
            console.log("[OK] R2: تم حذف ملف الفحص المؤقت");
          } catch {
            fail(
              "R2: تعذر حذف ملف الفحص المؤقت؛ تحقق من صلاحية الحذف (.unihome-health/)",
            );
          }
        }
        client.destroy();
      }
    })(),
  ]);
  return !failed;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  checkConnections(
    process.argv.includes("--production") ? "production" : "development",
  )
    .then((ok) => {
      process.exitCode = ok ? 0 : 1;
    })
    .catch(() => {
      console.error("[FAIL] تعذر فحص إعدادات التشغيل");
      process.exitCode = 1;
    });
}
