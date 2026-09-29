import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { authenticated, sameOrigin, sessionHash } from "@/lib/auth";
import { limitedBody } from "@/lib/body";
import {
  demo,
  mutate,
  readState,
  pendingResetFiles,
  clearResetFile,
} from "@/lib/store";
import { canReset, resetState } from "@/lib/reset";
import { deleteFile } from "@/lib/storage";
import {
  AppError,
  audit,
  balance,
  cents,
  createPayments,
  ensure,
  hashPassword,
  notify,
  now,
  phoneNumber,
  tokenHash,
  transition,
  validIban,
  verifyPassword,
} from "@/lib/model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  if (error instanceof AppError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  console.error(error instanceof Error ? error.message : "Application error");
  return NextResponse.json(
    { error: "تعذر إتمام العملية. تحقق من إعدادات الخادم ثم حاول مجددًا." },
    { status: 500 },
  );
}
export async function GET() {
  try {
    const state = await readState();
    const hash = await sessionHash();
    const actor = authenticated(state, hash);
    const safeUser = (u: typeof actor) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      role: u.role,
      iban: u.iban,
      bankName: u.bankName,
      avatar: u.avatar,
      balance: balance(state, u.id),
    });
    return NextResponse.json(
      {
        me: safeUser(actor),
        canReset: canReset(actor),
        users:
          actor.role === "admin"
            ? state.users.map(safeUser)
            : [safeUser(actor)],
        payments: state.payments.filter(
          (p) => actor.role === "admin" || p.userId === actor.id,
        ),
        notices: state.notices
          .filter((n) => n.userId === actor.id)
          .slice(0, 100),
        demo,
        currency: process.env.APP_CURRENCY || "TRY",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    let input;
    try {
      input = JSON.parse((await limitedBody(request, 20000)).toString("utf8"));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("صيغة الطلب غير صحيحة");
    }
    ensure(
      input && typeof input === "object" && !Array.isArray(input),
      "صيغة الطلب غير صحيحة",
    );
    const hash = await sessionHash();
    if (input.action === "login") {
      ensure(
        typeof input.phone === "string" &&
          input.phone.length < 40 &&
          typeof input.password === "string" &&
          input.password.length <= 128,
        "تحقق من رقم الهاتف وكلمة المرور",
      );
      const phone = phoneNumber(input.phone);
      const token = randomBytes(32).toString("hex");
      const result = await mutate((state) => {
        const attempt = state.attempts[phone];
        if (attempt && attempt.until > Date.now() && attempt.count >= 8)
          return "locked";
        const user = state.users.find((u) => u.phone === phone);
        if (!user || !verifyPassword(input.password, user.password)) {
          if (user)
            state.attempts[phone] = {
              count:
                attempt && attempt.until > Date.now() ? attempt.count + 1 : 1,
              until:
                attempt && attempt.until > Date.now()
                  ? attempt.until
                  : Date.now() + 15 * 60_000,
            };
          return "invalid";
        }
        delete state.attempts[phone];
        state.sessions = state.sessions.filter((s) => s.expires > Date.now());
        state.sessions.push({
          hash: tokenHash(token),
          userId: user.id,
          expires: Date.now() + 7 * 86400_000,
        });
        return "ok";
      });
      ensure(
        result !== "locked",
        "محاولات كثيرة. حاول مجددًا بعد 15 دقيقة",
        429,
      );
      ensure(result === "ok", "رقم الهاتف أو كلمة المرور غير صحيحة", 401);
      (await cookies()).set("unihome_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 86400,
      });
      return NextResponse.json({ ok: true });
    }
    if (input.action === "logout") {
      await mutate((state) => {
        state.sessions = state.sessions.filter((s) => s.hash !== hash);
      });
      (await cookies()).delete("unihome_session");
      return NextResponse.json({ ok: true });
    }
    if (input.action === "reset") {
      await mutate(
        (state) =>
          resetState(
            state,
            authenticated(state, hash),
            input.password,
            input.confirmation,
          ),
        true,
      );
      (await cookies()).delete("unihome_session");
      let remaining = 0;
      for (const key of await pendingResetFiles()) {
        try {
          await deleteFile(key);
          await clearResetFile(key);
        } catch {
          remaining++;
        }
      }
      return NextResponse.json({
        ok: true,
        warning: remaining
          ? "تم تصفير البيانات. تعذر حذف بعض الملفات من التخزين؛ أعد المحاولة من إعادة التعيين بعد التحقق من R2."
          : undefined,
      });
    }
    await mutate((state) => {
      const actor = authenticated(state, hash);
      if (input.action === "profile") {
        ensure(
          typeof input.iban === "string" && typeof input.bankName === "string",
          "أدخل بيانات الحساب",
        );
        const iban = input.iban.replace(/\s/g, "").toUpperCase();
        ensure(
          validIban(iban),
          "رقم الآيبان غير صحيح، تحقق منه ثم حاول مجددًا",
        );
        ensure(
          input.bankName.trim().length >= 2 && input.bankName.length <= 100,
          "أدخل اسم صاحب الحساب كما يظهر في البنك",
        );
        actor.iban = iban;
        actor.bankName = input.bankName.trim();
        audit(state, actor, "profile", actor.id);
      } else if (input.action === "password") {
        ensure(
          typeof input.current === "string" &&
            input.current.length <= 128 &&
            typeof input.password === "string" &&
            input.password.length >= 8 &&
            input.password.length <= 128,
          "كلمة المرور الجديدة يجب أن تكون بين 8 و128 حرفًا",
        );
        ensure(
          verifyPassword(input.current, actor.password),
          "كلمة المرور الحالية غير صحيحة",
        );
        actor.password = hashPassword(input.password);
        state.sessions = state.sessions.filter(
          (s) => s.userId !== actor.id || s.hash === hash,
        );
      } else if (input.action === "create") {
        ensure(actor.iban && actor.bankName, "أكمل بيانات حسابك البنكي أولًا");
        createPayments(state, actor, input);
      } else if (
        ["submit", "approve", "reject", "cancel"].includes(input.action)
      ) {
        ensure(actor.iban && actor.bankName, "أكمل بيانات حسابك البنكي أولًا");
        transition(state, actor, input.id, input.action, input.rejection);
      } else if (input.action === "edit") {
        ensure(actor.role === "admin", "هذه العملية للمشرف فقط", 403);
        const p = state.payments.find((p) => p.id === input.id);
        ensure(
          p && p.status === "unpaid",
          "يمكن تعديل الطلبات غير المدفوعة فقط",
        );
        ensure(
          typeof input.reason === "string" &&
            input.reason.trim().length >= 2 &&
            input.reason.length <= 300,
          "أدخل سبب التعديل",
        );
        p.amount = cents(input.amount);
        p.reason = input.reason.trim();
        p.updatedAt = now();
        notify(state, p.userId, p.id, "تم تعديل طلب الدفع: " + p.reason);
        audit(state, actor, "edit", p.id);
      } else if (input.action === "read") {
        state.notices
          .filter(
            (n) => n.userId === actor.id && (!input.id || n.id === input.id),
          )
          .forEach((n) => {
            n.read = true;
          });
      } else throw new AppError("عملية غير معروفة");
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
