import { ensure, seed, verifyPassword, type State, type User } from "./model";
export const canReset = (user: User) =>
  user.role === "admin" && user.phone === "+905343344584";
export function resetState(
  state: State,
  actor: User,
  password: unknown,
  confirmation: unknown,
) {
  ensure(canReset(actor), "إعادة التعيين متاحة لمجد الدين فقط", 403);
  ensure(confirmation === "إعادة تعيين كل شيء", "اكتب عبارة التأكيد كما هي");
  ensure(
    typeof password === "string" &&
      password.length <= 128 &&
      verifyPassword(password, actor.password),
    "كلمة المرور الحالية غير صحيحة",
  );
  Object.assign(state, seed());
}
