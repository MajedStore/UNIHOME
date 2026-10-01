import { cookies } from "next/headers";
import { ensure, State, tokenHash } from "./model";
export async function sessionHash() {
  const token = (await cookies()).get("unihome_session")?.value;
  return token ? tokenHash(token) : "";
}
export function authenticated(state: State, hash: string) {
  const session = state.sessions.find(
    (s) => s.hash === hash && s.expires > Date.now(),
  );
  const user = state.users.find((u) => u.id === session?.userId);
  ensure(user, "يرجى تسجيل الدخول", 401);
  return user;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  ensure(origin && origin !== "null", "مصدر الطلب غير مسموح", 403);
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    ensure(false, "مصدر الطلب غير مسموح", 403);
  }
  const expected = process.env.APP_ORIGIN;
  ensure(
    expected
      ? origin === expected
      : parsed.host === request.headers.get("host") &&
          ["http:", "https:"].includes(parsed.protocol),
    "مصدر الطلب غير مسموح",
    403,
  );
  return parsed.origin;
}
