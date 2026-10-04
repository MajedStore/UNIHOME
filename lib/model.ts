import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
export type User = {
  id: string;
  name: string;
  phone: string;
  role: "admin" | "member";
  password: string;
  iban: string;
  bankName: string;
  avatar?: string;
};
export type Payment = {
  id: string;
  batch: string;
  userId: string;
  amount: number;
  reason: string;
  recipientId: string;
  iban: string;
  bankName: string;
  status: "unpaid" | "review" | "paid" | "cancelled";
  createdAt: string;
  updatedAt: string;
  receipt?: string;
  rejection?: string;
  deleting?: boolean;
};
export type Notice = {
  id: string;
  userId: string;
  paymentId: string;
  text: string;
  read: boolean;
  createdAt: string;
};
export type StoredFile = {
  id: string;
  key: string;
  ownerId: string;
  paymentId?: string;
  kind: "receipt" | "avatar";
  type: string;
  name: string;
};
export type State = {
  users: User[];
  payments: Payment[];
  notices: Notice[];
  files: StoredFile[];
  sessions: { hash: string; userId: string; expires: number }[];
  attempts: Record<string, { count: number; until: number }>;
  audit: {
    id?: string;
    actor: string;
    action: string;
    target: string;
    at: string;
  }[];
};
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function ensure(
  value: unknown,
  message: string,
  status = 400,
): asserts value {
  if (!value) throw new AppError(message, status);
}
export const now = () => new Date().toISOString();
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(hash, "hex"),
  );
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function phoneNumber(value: string) {
  let digits = value.replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11)
    digits = "90" + digits.slice(1);
  if (digits.length === 10) digits = "90" + digits;
  return "+" + digits;
}
export function seed(): State {
  const names = ["مجد الدين", "عبدالله", "علاء", "جمال", "عمر", "سامح"];
  const phones = [
    "+905343344584",
    "+905364305473",
    "+905525561262",
    "+905010521307",
    "+905516445816",
    "+905374778847",
  ];
  return {
    users: names.map((name, i) => ({
      id: String(i + 1),
      name,
      phone: phones[i],
      role: i === 0 || i === 5 ? "admin" : "member",
      password: hashPassword("mjd123"),
      iban: "",
      bankName: "",
    })),
    payments: [],
    notices: [],
    files: [],
    sessions: [],
    attempts: {},
    audit: [],
  };
}
export const balance = (state: State, userId?: string) =>
  state.payments
    .filter(
      (p) =>
        (!userId || p.userId === userId) &&
        (p.status === "unpaid" || p.status === "review"),
    )
    .reduce((sum, p) => sum + p.amount, 0);
export function cents(value: unknown) {
  ensure(
    typeof value === "string" && /^\d{1,7}(\.\d{1,2})?$/.test(value),
    "أدخل مبلغًا صحيحًا بمنزلتين عشريتين كحد أقصى",
  );
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  ensure(result > 0, "يجب أن يكون المبلغ أكبر من صفر");
  return result;
}
export function validIban(value: string) {
  if (
    !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value) ||
    (value.startsWith("TR") && value.length !== 26)
  )
    return false;
  const expanded = (value.slice(4) + value.slice(0, 4)).replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55),
  );
  let remainder = 0;
  for (const digit of expanded)
    remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
export function notify(
  state: State,
  userId: string,
  paymentId: string,
  text: string,
) {
  state.notices.unshift({
    id: randomUUID(),
    userId,
    paymentId,
    text,
    read: false,
    createdAt: now(),
  });
}
export function audit(
  state: State,
  actor: User,
  action: string,
  target: string,
) {
  state.audit.push({ actor: actor.id, action, target, at: now() });
}
export function createPayments(
  state: State,
  actor: User,
  input: {
    amount: string;
    reason: string;
    userIds: string[];
    recipientId: string;
  },
) {
  ensure(actor.role === "admin", "هذه العملية للمشرف فقط", 403);
  ensure(Array.isArray(input.userIds), "حدد الأشخاص المشاركين");
  const ids = [...new Set(input.userIds)];
  ensure(
    ids.length && ids.every((id) => state.users.some((u) => u.id === id)),
    "حدد الأشخاص المشاركين",
  );
  const total = cents(input.amount);
  ensure(total >= ids.length, "المبلغ أصغر من عدد المشاركين");
  ensure(
    typeof input.reason === "string" &&
      input.reason.trim().length >= 2 &&
      input.reason.length <= 300,
    "أدخل سبب الطلب (من حرفين إلى 300 حرف)",
  );
  const recipient = state.users.find((u) => u.id === input.recipientId);
  ensure(
    recipient?.iban && recipient.bankName,
    "اختر مستفيدًا أكمل بيانات حسابه البنكي",
  );
  const batch = randomUUID();
  ids.forEach((userId, index) => {
    const payment: Payment = {
      id: randomUUID(),
      batch,
      userId,
      amount:
        Math.floor(total / ids.length) + (index < total % ids.length ? 1 : 0),
      reason: input.reason.trim(),
      recipientId: recipient.id,
      iban: recipient.iban,
      bankName: recipient.bankName,
      status: userId === recipient.id ? "paid" : "unpaid",
      createdAt: now(),
      updatedAt: now(),
    };
    state.payments.unshift(payment);
    notify(
      state,
      userId,
      payment.id,
      (payment.status === "paid"
        ? "تم قبول حصتك تلقائيًا لأنك مستلم التحويل: "
        : "طلب دفع جديد: ") + payment.reason,
    );
  });
  audit(state, actor, "create", batch);
}
export function transition(
  state: State,
  actor: User,
  id: string,
  action: string,
  rejection?: string,
) {
  const p = state.payments.find((p) => p.id === id);
  ensure(p, "الطلب غير موجود", 404);
  ensure(!p.deleting, "جارٍ حذف الطلب نهائيًا");
  if (action === "submit") {
    ensure(p.userId === actor.id, "لا يمكنك تعديل طلب شخص آخر", 403);
    ensure(p.status === "unpaid", "لا يمكن إرسال هذا الطلب للمراجعة");
    p.status = "review";
    p.rejection = undefined;
    state.users
      .filter((u) => u.role === "admin")
      .forEach((u) =>
        notify(state, u.id, p.id, actor.name + " طلب تأكيد الدفع: " + p.reason),
      );
  } else {
    ensure(actor.role === "admin", "هذه العملية للمشرف فقط", 403);
    if (action === "approve") {
      ensure(p.status === "review", "يمكن تأكيد الطلبات قيد المراجعة فقط");
      p.status = "paid";
      notify(state, p.userId, p.id, "تم تأكيد دفعتك: " + p.reason);
    } else if (action === "reject") {
      ensure(p.status === "review", "الطلب ليس قيد المراجعة");
      ensure(
        typeof rejection === "string" &&
          rejection.trim().length >= 2 &&
          rejection.length <= 300,
        "أدخل سبب رفض التأكيد",
      );
      p.status = "unpaid";
      p.rejection = rejection.trim();
      notify(state, p.userId, p.id, "لم يتم تأكيد دفعتك: " + p.rejection);
    } else if (action === "cancel") {
      ensure(
        p.status === "unpaid" || p.status === "review",
        "لا يمكن حذف طلب مكتمل أو ملغى",
      );
      p.status = "cancelled";
      notify(state, p.userId, p.id, "تم إلغاء طلب: " + p.reason);
    } else throw new AppError("عملية غير معروفة");
  }
  p.updatedAt = now();
  audit(state, actor, action, p.id);
}
export function deletePayment(state: State, actor: User, id: string) {
  ensure(actor.role === "admin", "هذه العملية للمشرف فقط", 403);
  const p = state.payments.find((p) => p.id === id);
  ensure(p, "الطلب غير موجود", 404);
  state.payments = state.payments.filter((p) => p.id !== id);
  state.notices = state.notices.filter((n) => n.paymentId !== id);
  state.files = state.files.filter((f) => f.paymentId !== id);
  state.audit = state.audit.filter(
    (a) =>
      a.target !== id &&
      (a.target !== p.batch ||
        state.payments.some((other) => other.batch === p.batch)),
  );
}
