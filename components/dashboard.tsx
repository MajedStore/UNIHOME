"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  Bell,
  Check,
  CheckCheck,
  ChevronLeft,
  Copy,
  CreditCard,
  FileText,
  Home,
  LayoutGrid,
  LogOut,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  Users,
  Wallet,
  X,
  Clock,
  CircleHelp,
  Building2,
  Pencil,
} from "lucide-react";
import type { Notice, Payment } from "@/lib/model";
import { toast as notifyToast } from "sonner";
type Person = {
  id: string;
  name: string;
  phone: string;
  role: string;
  iban: string;
  bankName: string;
  avatar?: string;
  balance: number;
};
type Data = {
  me: Person;
  users: Person[];
  payments: Payment[];
  notices: Notice[];
  demo: boolean;
  currency: string;
};
type Modal =
  | { kind: "pay" | "notify" | "reject" | "cancel" | "edit"; payment: Payment }
  | { kind: "create" | "notifications" | "help" }
  | null;
const labels = {
  unpaid: "بانتظار الدفع",
  review: "قيد المراجعة",
  paid: "تم الدفع",
  cancelled: "ملغى",
};
const demoPeople = [
  { name: "مجد الدين", phone: "+905343344584" },
  { name: "عبدالله", phone: "+905364305473" },
  { name: "علاء", phone: "+905525561262" },
  { name: "جمال", phone: "+905010521307" },
  { name: "عمر", phone: "+905516445816" },
  { name: "سامح · المشرف", phone: "+905374778847" },
];
function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Home size={25} />
      </span>
      <span>
        uni<span className="brand-light">home</span>
        <small>بيتنا، حساباتنا، بكل بساطة</small>
      </span>
    </div>
  );
}
function Avatar({ user, large = false }: { user: Person; large?: boolean }) {
  return (
    <span className={"avatar color-" + user.id + (large ? " large" : "")}>
      {user.avatar ? (
        <img src={"/api/files?id=" + user.avatar} alt={user.name} />
      ) : (
        user.name.charAt(0)
      )}
    </span>
  );
}
function ModalBox({
  title,
  close,
  children,
  required = false,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  required?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !required) close();
      if (event.key === "Tab") {
        const elements = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, select, textarea, a[href]",
        );
        if (!elements?.length) return;
        const first = elements[0],
          last = elements[elements.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, [close, required]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !required) close();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
      >
        <div className="modal-head">
          <h2>{title}</h2>
          {!required && (
            <button className="icon-button" aria-label="إغلاق" onClick={close}>
              <X size={21} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
export default function Dashboard({ demoMode }: { demoMode: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setToast = (message: string) => notifyToast.success(message);
  const [accountMenu, setAccountMenu] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const seenNotices = useRef<{ userId: string; ids: Set<string> } | null>(null);
  const [page, setPage] = useState("home");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [highlight, setHighlight] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const close = useCallback(() => setModal(null), []);
  const load = useCallback(async () => {
    const response = await fetch("/api/app");
    const result = await response.json();
    if (response.status === 401) {
      setData(null);
      return;
    }
    if (!response.ok) throw new Error(result.error);
    setData(result);
  }, []);
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [!!data, load]);
  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node))
        setAccountMenu(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountMenu(false);
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    if (error) notifyToast.error(error);
  }, [error]);
  useEffect(() => {
    if (!data) {
      seenNotices.current = null;
      return;
    }
    const previous = seenNotices.current;
    if (previous?.userId === data.me.id) {
      for (const notice of data.notices) {
        if (!notice.read && !previous.ids.has(notice.id))
          notifyToast(notice.text);
      }
    }
    seenNotices.current = {
      userId: data.me.id,
      ids: new Set(data.notices.map((n) => n.id)),
    };
  }, [data]);
  useEffect(() => {
    if (highlight)
      setTimeout(
        () =>
          document
            .getElementById(highlight)
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
        100,
      );
  }, [highlight, page, selectedUser]);
  async function act(input: Record<string, unknown>, success = "") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await load();
      if (input.action === "profile") {
        setPage("home");
        setSelectedUser(null);
        setAccountMenu(false);
      }
      setModal(null);
      if (success) setToast(success);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function upload(
    file: File | undefined,
    kind: string,
    paymentId?: string,
  ) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      if (paymentId) form.append("paymentId", paymentId);
      const response = await fetch("/api/files", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await load();
      setToast("تم رفع الملف بنجاح");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const money = (value: number) =>
    new Intl.NumberFormat("ar", {
      style: "currency",
      currencyDisplay: "narrowSymbol",
      currency: data?.currency || "TRY",
      minimumFractionDigits: 2,
    }).format(value / 100);
  const date = (value: string) =>
    new Intl.DateTimeFormat("ar", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  const formValues = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    return Object.fromEntries(new FormData(event.currentTarget));
  };
  const showModal = (value: Modal) => {
    setError("");
    setModal(value);
  };
  if (loading)
    return (
      <div className="loading">
        <Brand />
        <p>لحظة، نرتّب حسابات البيت…</p>
      </div>
    );
  if (!data)
    return (
      <div className="login-page">
        <header>
          <Brand />
          <span className="subtle">بيت واحد. حسابات واضحة.</span>
        </header>
        <main className="login-main">
          <section className="login-story">
            <span className="eyebrow">مساحة صغيرة، راحة كبيرة</span>
            <h1>
              نعيش سوا.
              <br />
              ونرتّب حساباتنا <em>سوا.</em>
            </h1>
            <p>
              الإيجار، الكهرباء، ومصاريف البيت.
              <br />
              كل شيء واضح، وكل دفعة في مكانها.
            </p>
            <div className="illustration">
              <div className="illustration-home">
                <Home size={72} strokeWidth={1.1} />
              </div>
              <div className="mini-receipt">
                <span className="mini-check">
                  <Check size={19} />
                </span>
                <div>
                  <strong>الحسابات مرتّبة</strong>
                  <small>وقت أكثر للأشياء المهمة</small>
                </div>
                <span className="receipt-lines">≡</span>
              </div>
              <div className="people-dots">
                {["م", "ع", "ع", "ج", "ع", "س"].map((x, i) => (
                  <span key={i} className={"avatar color-" + (i + 1)}>
                    {x}
                  </span>
                ))}
                <small>٦ زملاء، بيت واحد</small>
              </div>
            </div>
          </section>
          <section className="login-card">
            <span className="square-icon">
              <Wallet size={26} />
            </span>
            <h2>أهلًا بك في بيتك</h2>
            <p className="subtle">سجّل دخولك وتابع مصاريفك بكل راحة.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPage("home");
                act({ action: "login", phone, password });
              }}
            >
              <label>
                رقم الهاتف
                <input
                  type="tel"
                  dir="ltr"
                  autoComplete="tel"
                  placeholder="+90 5XX XXX XX XX"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              <label>
                كلمة المرور
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="أدخل كلمة المرور"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <button className="primary wide" disabled={busy}>
                {busy ? "جارٍ تسجيل الدخول…" : "تسجيل الدخول"}
                <ArrowLeft size={18} />
              </button>
            </form>
            <p className="login-note">
              <ShieldCheck size={16} /> حسابات خاصة بأفراد السكن فقط
            </p>
            {demoMode && (
              <div className="demo-login">
                <strong>نسخة تجريبية محلية</strong>
                <p>
                  اختر حسابًا لتجربة الواجهة. البيانات محفوظة على هذا الجهاز.
                </p>
                <select
                  aria-label="اختيار حساب تجريبي"
                  defaultValue=""
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setPassword("mjd123");
                  }}
                >
                  <option value="" disabled>
                    اختر أحد أفراد البيت
                  </option>
                  {demoPeople.map((p) => (
                    <option key={p.phone} value={p.phone}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>
        </main>
        <footer className="login-footer">
          يوني هوم — لأن مشاركة البيت تبدأ بالوضوح.
        </footer>
      </div>
    );
  const me = data.me;
  const isAdmin = me.role === "admin";
  const onboarding = !me.iban || !me.bankName;
  const inAdmin = page === "admin";
  const currentUser =
    inAdmin && selectedUser
      ? data.users.find((u) => u.id === selectedUser)
      : me;
  const own = data.payments.filter((p) => p.userId === me.id);
  const scoped = inAdmin
    ? data.payments.filter((p) => !selectedUser || p.userId === selectedUser)
    : own;
  const visible = scoped.filter(
    (p) =>
      (filter === "all" || p.status === filter) &&
      (!query || p.reason.includes(query)),
  );
  const pending = scoped.filter((p) => p.status === "review");
  const total = scoped
    .filter((p) => p.status === "review" || p.status === "unpaid")
    .reduce((s, p) => s + p.amount, 0);
  const paid = scoped
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + p.amount, 0);
  const unread = data.notices.filter((n) => !n.read).length;
  function navigate(next: string) {
    setPage(next);
    setFilter("all");
    setQuery("");
    setSelectedUser(null);
    setError("");
  }
  function openNotice(n: Notice) {
    const p = data!.payments.find((p) => p.id === n.paymentId);
    if (p) {
      setPage(p.userId === me.id ? "home" : "admin");
      setSelectedUser(p.userId === me.id ? null : p.userId);
      setFilter("all");
      setQuery("");
      setHighlight(p.id);
    }
    act({ action: "read", id: n.id });
  }
  function paymentCard(p: Payment) {
    const owner = data!.users.find((u) => u.id === p.userId);
    return (
      <article
        id={p.id}
        key={p.id}
        className={"payment-row " + (highlight === p.id ? "highlight" : "")}
      >
        <div className={"payment-icon " + p.status}>
          {p.status === "paid" ? (
            <CheckCheck size={23} />
          ) : (
            <FileText size={23} />
          )}
        </div>
        <div className="payment-description">
          <h3>{p.reason}</h3>
          <p>
            {inAdmin && owner ? owner.name + " · " : ""}
            {date(p.createdAt)}
            <span className="dot">·</span>إلى {p.bankName}
          </p>
          {p.rejection && p.status === "unpaid" && (
            <small className="rejection">سبب عدم التأكيد: {p.rejection}</small>
          )}
          <div className="receipt-actions">
            {p.receipt && (
              <a
                href={"/api/files?id=" + p.receipt}
                target="_blank"
                rel="noreferrer"
              >
                <FileText size={13} /> عرض الوصل
              </a>
            )}
            {p.userId === me.id && ["unpaid", "review"].includes(p.status) && (
              <label className="upload-link">
                <Upload size={13} />
                {p.receipt ? "استبدال الوصل" : "إرفاق وصل (اختياري)"}
                <input
                  type="file"
                  hidden
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  disabled={busy}
                  onChange={(e) => upload(e.target.files?.[0], "receipt", p.id)}
                />
              </label>
            )}
          </div>
        </div>
        <div className="payment-amount">
          <strong>{money(p.amount)}</strong>
          <span className={"badge " + p.status}>
            <i />
            {labels[p.status]}
          </span>
        </div>
        <div className="payment-buttons">
          {p.userId === me.id && p.status === "unpaid" && (
            <>
              <button
                className="primary small"
                onClick={() => showModal({ kind: "pay", payment: p })}
              >
                دفع
                <ArrowLeft size={15} />
              </button>
              <button
                className="text-button"
                onClick={() => showModal({ kind: "notify", payment: p })}
              >
                تنبيه المسؤول
              </button>
            </>
          )}
          {p.status === "review" && inAdmin && (
            <>
              <button
                className="primary small"
                disabled={busy}
                onClick={() =>
                  act(
                    { action: "approve", id: p.id },
                    "تم تأكيد الدفعة وتحديث الرصيد",
                  )
                }
              >
                تأكيد الدفع
              </button>
              <button
                className="text-button danger"
                onClick={() => showModal({ kind: "reject", payment: p })}
              >
                رفض التأكيد
              </button>
            </>
          )}
          {inAdmin && p.status === "unpaid" && (
            <button
              className="text-button"
              onClick={() => showModal({ kind: "edit", payment: p })}
            >
              تعديل المبلغ
            </button>
          )}
          {inAdmin && ["unpaid", "review"].includes(p.status) && (
            <button
              className="text-button muted"
              onClick={() => showModal({ kind: "cancel", payment: p })}
            >
              حذف الطلب
            </button>
          )}
          {p.status === "review" && !inAdmin && (
            <span className="waiting">
              <Clock size={16} /> بانتظار التأكيد
            </span>
          )}
          {p.status === "paid" && (
            <span className="done">
              <Check size={17} /> مكتمل
            </span>
          )}
        </div>
      </article>
    );
  }
  const settings = (
    <div className="settings-grid">
      <section className="panel settings-panel">
        <div className="section-heading">
          <span className="square-icon">
            <Building2 size={23} />
          </span>
          <div>
            <h2>حسابك البنكي</h2>
            <p>ليتمكن زملاؤك من التحويل إليك.</p>
          </div>
        </div>
        <form
          key={me.iban}
          onSubmit={(e) =>
            act(
              { action: "profile", ...formValues(e) },
              "تم حفظ بيانات الحساب البنكي",
            )
          }
        >
          <label>
            اسم صاحب الحساب
            <input
              name="bankName"
              defaultValue={me.bankName}
              required
              maxLength={100}
              placeholder="الاسم كما يظهر في حسابك البنكي"
            />
          </label>
          <label>
            رقم الآيبان (IBAN)
            <input
              name="iban"
              dir="ltr"
              defaultValue={me.iban}
              required
              maxLength={42}
              placeholder="TR00 0000 0000 0000 0000 0000 00"
            />
          </label>
          <p className="field-hint">
            تعديل بياناتك لا يغيّر بيانات التحويل في الطلبات السابقة.
          </p>
          <button className="primary" disabled={busy}>
            حفظ البيانات
            <Check size={16} />
          </button>
        </form>
      </section>
      <section className="panel settings-panel">
        <div className="section-heading">
          <div className="editable-avatar">
            <Avatar user={me} large />
            <label className="avatar-edit" title="تغيير الصورة الشخصية">
              <Pencil size={14} aria-hidden="true" />
              <input
                className="avatar-file-input"
                aria-label="تغيير الصورة الشخصية"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={(e) => {
                  upload(e.target.files?.[0], "avatar");
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div>
            <h2>{me.name}</h2>
            <p dir="ltr">{me.phone}</p>
          </div>
        </div>
        <p className="field-hint">PNG أو JPG أو WebP، بحد أقصى 5 ميغابايت.</p>
        <hr />
        <h2>تغيير كلمة المرور</h2>
        <form
          onSubmit={async (e) => {
            const form = e.currentTarget;
            const input = formValues(e);
            if (input.password !== input.confirm) {
              setError("كلمتا المرور غير متطابقتين");
              return;
            }
            if (
              await act(
                { action: "password", ...input },
                "تم تغيير كلمة المرور",
              )
            )
              form.reset();
          }}
        >
          <label>
            كلمة المرور الحالية
            <input
              name="current"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            كلمة المرور الجديدة
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              placeholder="8 أحرف على الأقل"
            />
          </label>
          <label>
            تأكيد كلمة المرور
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <button className="secondary" disabled={busy}>
            تحديث كلمة المرور
          </button>
        </form>
      </section>
    </div>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="home-tag">
          <span className="home-dot" />
          سكن الطلاب<span>٦ أفراد</span>
        </div>
        <p className="nav-label">مساحتك</p>
        <nav>
          <button
            className={page === "home" ? "active" : ""}
            onClick={() => navigate("home")}
          >
            <LayoutGrid size={20} />
            نظرة عامة
          </button>
          {isAdmin && (
            <>
              <p className="nav-label admin-label">إدارة البيت</p>
              <button
                className={inAdmin ? "active" : ""}
                onClick={() => navigate("admin")}
              >
                <Users size={20} />
                لوحة التحكم
                {data.payments.some((p) => p.status === "review") && (
                  <span className="review-dot" />
                )}
              </button>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">
              <Home size={22} />
            </span>
            <strong>حسابات واضحة، بيت أريح.</strong>
            <p>
              كل مصاريفنا في مكان واحد،
              <br />
              لتبقى الأمور بسيطة بيننا.
            </p>
          </div>
          <button
            className="help-link"
            onClick={() => showModal({ kind: "help" })}
          >
            <CircleHelp size={18} />
            كيف يعمل يوني هوم؟
            <ChevronLeft size={16} />
          </button>
          <div className="sidebar-user">
            <Avatar user={me} />
            <div>
              <strong>{me.name}</strong>
              <small>{isAdmin ? "مشرف السكن" : "أحد أفراد البيت"}</small>
            </div>
            <button
              className="icon-button"
              title="تسجيل الخروج"
              aria-label="تسجيل الخروج"
              disabled={busy}
              onClick={() => act({ action: "logout" })}
            >
              <LogOut size={19} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <Home size={16} />
            <ChevronLeft size={14} />
            <span>
              {inAdmin
                ? "لوحة التحكم"
                : page === "settings"
                  ? "إعدادات الحساب"
                  : "نظرة عامة"}
            </span>
          </div>
          <div className="topbar-actions">
            {data.demo && <span className="demo-pill">نسخة تجريبية محلية</span>}
            <button
              className="notification-button icon-button"
              aria-label={"الإشعارات، " + unread + " غير مقروءة"}
              onClick={() => showModal({ kind: "notifications" })}
            >
              <Bell size={21} />
              {unread > 0 && <span>{unread}</span>}
            </button>
            <span className="topbar-divider" />
            <div className="account-menu-anchor" ref={accountRef}>
              <button
                className="account-trigger"
                aria-label="قائمة الحساب"
                aria-expanded={accountMenu}
                onClick={() => setAccountMenu(!accountMenu)}
              >
                <Avatar user={me} />
              </button>
              {accountMenu && (
                <div className="account-dropdown">
                  <strong>{me.name}</strong>
                  <button
                    onClick={() => {
                      setAccountMenu(false);
                      navigate("settings");
                    }}
                  >
                    <Settings size={17} />
                    الإعدادات
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setAccountMenu(false);
                      act({ action: "logout" });
                    }}
                  >
                    <LogOut size={17} />
                    تسجيل الخروج
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="main-content" key={page + (selectedUser || "")}>
          {error && !modal && (
            <div className="error page-error" role="alert">
              {error}
              <button aria-label="إغلاق الخطأ" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {inAdmin
                  ? "كل تفاصيل البيت، في مكان واحد"
                  : page === "settings" || onboarding
                    ? "معلوماتك، كما تحب"
                    : "أهلًا بك في بيتك"}
              </span>
              <h1>
                {onboarding
                  ? "لنُكمل بياناتك أولًا"
                  : inAdmin
                    ? selectedUser
                      ? "حساب " + currentUser?.name
                      : "إدارة مصاريف البيت"
                    : page === "settings"
                      ? "إعدادات حسابك"
                      : "أهلًا بك، " + me.name}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {onboarding
                  ? "أضف الآيبان واسم صاحب الحساب لتبدأ استخدام يوني هوم."
                  : inAdmin
                    ? "وزّع المصاريف، راجع الدفعات، وابقَ على اطّلاع."
                    : page === "settings"
                      ? "بياناتك البنكية وإعدادات الأمان في مكان واحد."
                      : "هنا كل ما يخص مصاريفك. بكل وضوح وبدون تعقيد."}
              </p>
            </div>
            {!onboarding && inAdmin ? (
              <button
                className="primary"
                onClick={() => {
                  setChosen(
                    selectedUser ? [selectedUser] : data.users.map((u) => u.id),
                  );
                  setAmount("");
                  showModal({ kind: "create" });
                }}
              >
                <Plus size={19} />
                إنشاء طلب
              </button>
            ) : (
              <span className="today">{date(new Date().toISOString())}</span>
            )}
          </div>
          {page === "settings" ? (
            settings
          ) : (
            <>
              {inAdmin && selectedUser && (
                <button
                  className="back-link"
                  onClick={() => {
                    setSelectedUser(null);
                    setFilter("all");
                  }}
                >
                  <ArrowLeft size={16} />
                  العودة لجميع أفراد البيت
                </button>
              )}
              <section
                className={inAdmin ? "stats-grid" : "stats-grid personal-stats"}
              >
                <div
                  className={
                    "balance-card " +
                    (!inAdmin
                      ? total === 0
                        ? "balance-clear"
                        : "balance-due"
                      : "")
                  }
                >
                  <div className="stat-title">
                    <span>
                      {inAdmin && !selectedUser
                        ? "إجمالي المبالغ المستحقة"
                        : "المبلغ المتراكم عليك"}
                    </span>
                    <Wallet size={22} />
                  </div>
                  <strong className="big-amount">{money(total)}</strong>
                  <div className="balance-bottom">
                    <span className="light-dot" />
                    {total === 0
                      ? "كل شيء مرتب، لا توجد مبالغ مستحقة"
                      : `${scoped.filter((p) => ["unpaid", "review"].includes(p.status)).length} طلبات تحتاج إلى المتابعة`}
                    <ArrowDownLeft size={18} />
                  </div>
                </div>
                {inAdmin && (
                  <>
                    <div className="stat-card">
                      <span className="stat-icon amber">
                        <Clock size={21} />
                      </span>
                      <div className="stat-title">قيد المراجعة</div>
                      <strong>
                        {money(pending.reduce((s, p) => s + p.amount, 0))}
                      </strong>
                      <p>
                        {pending.length
                          ? `${pending.length} طلب بانتظار تأكيد المسؤول`
                          : "لا توجد دفعات بانتظار التأكيد"}
                      </p>
                    </div>
                    <div className="stat-card">
                      <span className="stat-icon mint">
                        <CheckCheck size={21} />
                      </span>
                      <div className="stat-title">تم تسديده</div>
                      <strong>{money(paid)}</strong>
                      <p>
                        مجموع دفعاتك المؤكدة{inAdmin ? " في هذه الصفحة" : ""}
                      </p>
                    </div>
                  </>
                )}
              </section>
              {inAdmin && !selectedUser && (
                <section className="members-section">
                  <div className="section-title">
                    <h2>
                      أفراد البيت <span>٦</span>
                    </h2>
                    <span className="subtle">اضغط على أي فرد لعرض طلباته</span>
                  </div>
                  <div className="members-grid">
                    {data.users.map((u) => (
                      <button
                        className="member-card"
                        key={u.id}
                        onClick={() => {
                          setSelectedUser(u.id);
                          setFilter("all");
                        }}
                      >
                        <div className="member-top">
                          <Avatar user={u} />
                          <div>
                            <strong>{u.name}</strong>
                            <small>
                              {u.role === "admin"
                                ? "مشرف السكن"
                                : "أحد أفراد البيت"}
                            </small>
                          </div>
                          <ChevronLeft size={17} />
                        </div>
                        <div className="member-balance">
                          <span>المبلغ المتراكم</span>
                          <strong>{money(u.balance)}</strong>
                        </div>
                        <div className="bank-preview">
                          <span>
                            {u.bankName || "لم يُضف الحساب البنكي بعد"}
                          </span>
                          {u.iban && (
                            <small dir="ltr">
                              {u.iban.replace(/(.{4})/g, "$1 ")}
                            </small>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {inAdmin && selectedUser && (
                <div className="selected-bank">
                  <Building2 size={20} />
                  <span>
                    {currentUser?.bankName || "لم يُضف بياناته البنكية بعد"}
                  </span>
                  <span dir="ltr">{currentUser?.iban}</span>
                </div>
              )}
              <section className="panel requests-panel">
                <div className="requests-heading">
                  <div>
                    <h2>
                      {inAdmin
                        ? selectedUser
                          ? "طلبات " + currentUser?.name
                          : "جميع طلبات الدفع"
                        : "طلبات الدفع"}
                      <span className="count-pill">{scoped.length}</span>
                    </h2>
                    <p>تابع طلباتك ودفعاتك، خطوة بخطوة.</p>
                  </div>
                  <div className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="ابحث في الطلبات"
                      placeholder="ابحث عن طلب…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="filter-tabs">
                  {[
                    ["all", "الكل"],
                    ["unpaid", "بانتظار الدفع"],
                    ["review", "قيد المراجعة"],
                    ["paid", "تم الدفع"],
                    ["cancelled", "ملغى"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={filter === value ? "selected" : ""}
                      onClick={() => setFilter(value)}
                    >
                      {label}
                      <span>
                        {
                          scoped.filter(
                            (p) => value === "all" || p.status === value,
                          ).length
                        }
                      </span>
                    </button>
                  ))}
                </div>
                <div className="payments-list" key={filter}>
                  {visible.length ? (
                    visible.map(paymentCard)
                  ) : (
                    <div className="empty-state">
                      <span>
                        <FileText size={29} />
                      </span>
                      <h3>
                        {query
                          ? "لا توجد نتائج لهذا البحث"
                          : filter === "all"
                            ? "صفحة جديدة، وحسابات مرتّبة"
                            : "لا توجد طلبات هنا"}
                      </h3>
                      <p>
                        {query
                          ? "جرّب البحث بكلمة أخرى."
                          : inAdmin
                            ? "أنشئ طلبًا وحدّد الأشخاص لتوزيع مصاريف البيت."
                            : "ستظهر طلباتك هنا عندما يضيف المسؤول مصروفًا جديدًا."}
                      </p>
                      {inAdmin && filter === "all" && !query && (
                        <button
                          className="secondary"
                          onClick={() => {
                            setChosen(
                              selectedUser
                                ? [selectedUser]
                                : data.users.map((u) => u.id),
                            );
                            setAmount("");
                            showModal({ kind: "create" });
                          }}
                        >
                          <Plus size={16} />
                          إنشاء أول طلب
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="panel-footer">
                  <ShieldCheck size={15} />
                  <span>
                    يُخصم المبلغ من رصيدك بعد تأكيد المسؤول لاستلام الدفعة.
                  </span>
                </div>
              </section>
              <div className="how-banner">
                <span className="square-icon">
                  <CreditCard size={22} />
                </span>
                <div>
                  <strong>كيف أسدّد طلبًا؟</strong>
                  <p>
                    اطّلع على بيانات التحويل، حوّل المبلغ، ثم أرسل تنبيهًا
                    للمسؤول. بهذه البساطة.
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => showModal({ kind: "help" })}
                >
                  اعرف أكثر
                  <ArrowLeft size={16} />
                </button>
              </div>
            </>
          )}
          <footer className="app-footer">
            <span>
              يوني هوم <span>·</span> مصاريف مشتركة، براحة بال.
            </span>
            <span>
              <ShieldCheck size={14} />
              مساحتكم الخاصة
            </span>
          </footer>
        </main>
      </div>
      {onboarding && (
        <ModalBox title="أكمل بيانات حسابك البنكي" close={close} required>
          <p className="modal-intro">
            أدخل اسم صاحب الحساب والآيبان للمتابعة. يمكنك تعديلهما لاحقًا من
            الإعدادات.
          </p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <form
            onSubmit={(e) =>
              act(
                { action: "profile", ...formValues(e) },
                "تم حفظ بياناتك، أهلًا بك في بيتك",
              )
            }
          >
            <label>
              اسم صاحب الحساب
              <input
                name="bankName"
                defaultValue={me.bankName}
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                placeholder="الاسم كما يظهر في البنك"
              />
            </label>
            <label>
              رقم الآيبان (IBAN)
              <input
                name="iban"
                defaultValue={me.iban}
                required
                maxLength={42}
                dir="ltr"
                placeholder="TR00 0000 0000 0000 0000 0000 00"
              />
            </label>
            <button className="primary wide" disabled={busy}>
              {busy ? "جارٍ حفظ البيانات…" : "حفظ ومتابعة إلى الرئيسية"}
            </button>
          </form>
        </ModalBox>
      )}
      {modal && (
        <ModalBox
          close={close}
          title={
            modal.kind === "create"
              ? "إنشاء طلب دفع"
              : modal.kind === "notifications"
                ? "الإشعارات"
                : modal.kind === "help"
                  ? "من الطلب إلى تمام الدفع"
                  : modal.kind === "pay"
                    ? "بيانات التحويل البنكي"
                    : modal.kind === "notify"
                      ? "إرسال تنبيه للمسؤول"
                      : modal.kind === "reject"
                        ? "رفض تأكيد الدفع"
                        : modal.kind === "edit"
                          ? "تعديل طلب الدفع"
                          : "حذف طلب الدفع"
          }
        >
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {modal.kind === "create" && (
            <form
              onSubmit={(e) =>
                act(
                  { action: "create", ...formValues(e), userIds: chosen },
                  "تم إنشاء الطلبات وتوزيع المبلغ",
                )
              }
            >
              <p className="modal-intro">
                أضف المصروف واختر من يشاركك فيه. نتولى تقسيم المبلغ بالتساوي.
              </p>
              <label>
                المبلغ الإجمالي ({data.currency})
                <input
                  name="amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  placeholder="0.00"
                  pattern="[0-9]+(\.[0-9]{1,2})?"
                  dir="ltr"
                />
              </label>
              <label>
                سبب الطلب
                <input
                  name="reason"
                  required
                  minLength={2}
                  maxLength={300}
                  placeholder="مثلًا: فاتورة الكهرباء لشهر سبتمبر"
                />
              </label>
              <div className="people-label">
                <strong>تقسيم المبلغ على</strong>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setChosen(
                      chosen.length === data.users.length
                        ? []
                        : data.users.map((u) => u.id),
                    )
                  }
                >
                  {chosen.length === data.users.length
                    ? "إلغاء تحديد الكل"
                    : "تحديد الكل"}
                </button>
              </div>
              <div className="people-select">
                {data.users.map((u) => (
                  <label
                    className={chosen.includes(u.id) ? "checked" : ""}
                    key={u.id}
                  >
                    <input
                      type="checkbox"
                      checked={chosen.includes(u.id)}
                      onChange={(e) =>
                        setChosen(
                          e.target.checked
                            ? [...chosen, u.id]
                            : chosen.filter((id) => id !== u.id),
                        )
                      }
                    />
                    {u.name}
                  </label>
                ))}
              </div>
              {chosen.length > 0 && Number(amount) > 0 && (
                <div className="split-preview">
                  <span>حصة الفرد التقريبية</span>
                  <strong>
                    {money(Math.floor((Number(amount) * 100) / chosen.length))}
                  </strong>
                  <small>تُوزّع فروق القروش لضمان تطابق المجموع.</small>
                </div>
              )}
              <label>
                التحويل إلى
                <select
                  aria-label="التحويل إلى"
                  name="recipientId"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    اختر الحساب المستفيد
                  </option>
                  {data.users
                    .filter((u) => u.iban)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} — {u.bankName} — {u.iban.slice(-4)}
                      </option>
                    ))}
                </select>
              </label>
              {!data.users.some((u) => u.iban) && (
                <p className="error">
                  يجب أن يُكمل أحد الأفراد بيانات حسابه البنكي أولًا.
                </p>
              )}
              <button
                className="primary wide"
                disabled={busy || !chosen.length}
              >
                إنشاء الطلب وتوزيع المبلغ
                <ArrowLeft size={17} />
              </button>
            </form>
          )}
          {modal.kind === "pay" && (
            <>
              <p className="modal-intro">
                حوّل المبلغ إلى الحساب التالي باستخدام تطبيق البنك الخاص بك.
              </p>
              <div className="transfer-amount">
                {money(modal.payment.amount)}
                <small>{modal.payment.reason}</small>
              </div>
              <div className="transfer-details">
                <label>
                  اسم صاحب الحساب<strong>{modal.payment.bankName}</strong>
                </label>
                <label>
                  رقم الآيبان
                  <strong dir="ltr" className="iban">
                    {modal.payment.iban.replace(/(.{4})/g, "$1 ")}
                  </strong>
                </label>
                <button
                  className="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(modal.payment.iban);
                      setToast("تم نسخ الآيبان");
                    } catch {
                      setError(
                        "تعذر النسخ التلقائي. يمكنك تحديد الآيبان ونسخه يدويًا.",
                      );
                    }
                  }}
                >
                  <Copy size={15} />
                  نسخ الآيبان
                </button>
              </div>
              <p className="field-hint">
                هذا التطبيق ينظّم الدفعات. يتم التحويل من خلال البنك.
              </p>
              <button
                className="primary wide"
                onClick={() =>
                  showModal({ kind: "notify", payment: modal.payment })
                }
              >
                حوّلت المبلغ، تنبيه المسؤول
                <Bell size={17} />
              </button>
            </>
          )}
          {modal.kind === "notify" && (
            <>
              <div className="confirm-icon">
                <Bell size={28} />
              </div>
              <p className="confirm-text">
                هل ترغب بتنبيه المسؤول عن إتمامك لعملية الدفع؟
              </p>
              <p className="modal-intro centered">
                سيصبح الطلب قيد المراجعة، وسيبقى المبلغ ضمن رصيدك حتى يتم
                التأكيد.
              </p>
              <div className="modal-actions">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    act(
                      { action: "submit", id: modal.payment.id },
                      "تم إرسال التنبيه، طلبك الآن قيد المراجعة",
                    )
                  }
                >
                  نعم، أرسل التنبيه
                </button>
                <button className="secondary" onClick={close}>
                  لا، رجوع
                </button>
              </div>
            </>
          )}
          {modal.kind === "reject" && (
            <form
              onSubmit={(e) =>
                act(
                  { action: "reject", id: modal.payment.id, ...formValues(e) },
                  "تم رفض التأكيد وإشعار صاحب الطلب",
                )
              }
            >
              <p className="modal-intro">
                سيعود الطلب إلى «بانتظار الدفع». وضّح السبب لصاحب الطلب.
              </p>
              <label>
                سبب الرفض
                <textarea
                  name="rejection"
                  required
                  minLength={2}
                  maxLength={300}
                  placeholder="مثلًا: لم يصل التحويل إلى الحساب بعد"
                />
              </label>
              <button className="primary wide" disabled={busy}>
                رفض التأكيد وإرسال السبب
              </button>
            </form>
          )}
          {modal.kind === "edit" && (
            <form
              onSubmit={(e) =>
                act(
                  { action: "edit", id: modal.payment.id, ...formValues(e) },
                  "تم تعديل الطلب وتحديث الرصيد",
                )
              }
            >
              <label>
                المبلغ الجديد
                <input
                  name="amount"
                  defaultValue={(modal.payment.amount / 100).toFixed(2)}
                  inputMode="decimal"
                  dir="ltr"
                  required
                />
              </label>
              <label>
                سبب الطلب / التعديل
                <input
                  name="reason"
                  defaultValue={modal.payment.reason}
                  required
                  minLength={2}
                  maxLength={300}
                />
              </label>
              <p className="field-hint">
                يؤثر هذا التعديل على طلب هذا الشخص فقط، وسيصله إشعار.
              </p>
              <button className="primary wide" disabled={busy}>
                حفظ التعديل
              </button>
            </form>
          )}
          {modal.kind === "cancel" && (
            <>
              <p className="confirm-text">
                حذف طلب «{modal.payment.reason}» بقيمة{" "}
                {money(modal.payment.amount)}؟
              </p>
              <p className="modal-intro">
                سيُلغى الطلب ويُحذف المبلغ من الرصيد المتراكم. سيظل ظاهرًا في
                سجل الطلبات الملغاة.
              </p>
              <div className="modal-actions">
                <button
                  className="danger-button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      { action: "cancel", id: modal.payment.id },
                      "تم إلغاء الطلب وتحديث الرصيد",
                    )
                  }
                >
                  نعم، حذف الطلب
                </button>
                <button className="secondary" onClick={close}>
                  رجوع
                </button>
              </div>
            </>
          )}
          {modal.kind === "notifications" && (
            <div className="notices">
              {data.notices.length ? (
                <>
                  <button
                    className="text-button"
                    onClick={() =>
                      act({ action: "read" }, "تم تحديد الإشعارات كمقروءة")
                    }
                  >
                    تحديد الكل كمقروء
                    <CheckCheck size={16} />
                  </button>
                  {data.notices.map((n) => (
                    <button
                      key={n.id}
                      className={"notice " + (!n.read ? "unread" : "")}
                      onClick={() => openNotice(n)}
                    >
                      <span className="square-icon">
                        <Bell size={18} />
                      </span>
                      <span>
                        <strong>{n.text}</strong>
                        <small>{date(n.createdAt)}</small>
                      </span>
                      <ChevronLeft size={16} />
                    </button>
                  ))}
                </>
              ) : (
                <div className="empty-state">
                  <Bell size={30} />
                  <h3>أنت على اطّلاع بكل شيء</h3>
                  <p>ستظهر هنا إشعارات الطلبات وتأكيد الدفعات.</p>
                </div>
              )}
            </div>
          )}
          {modal.kind === "help" && (
            <div className="help-steps">
              {[
                [
                  "يُضاف طلبك",
                  "يقسّم المسؤول مصروف البيت بين المشاركين، ويظهر نصيبك في رصيدك.",
                ],
                [
                  "تحوّل المبلغ",
                  "اضغط «دفع» وانسخ بيانات الحساب، ثم حوّل عبر تطبيق البنك. يمكنك إرفاق وصل اختياري.",
                ],
                [
                  "تنبّه المسؤول",
                  "بعد إتمام التحويل، اضغط «تنبيه المسؤول» وأكّد الإرسال.",
                ],
                [
                  "يراجع ويؤكّد",
                  "بعد التأكيد يُخصم المبلغ من رصيدك، ويصلك إشعار باكتمال الدفع.",
                ],
              ].map(([title, body], i) => (
                <div key={title}>
                  <span>{i + 1}</span>
                  <section>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </section>
                </div>
              ))}
            </div>
          )}
        </ModalBox>
      )}
    </div>
  );
}
