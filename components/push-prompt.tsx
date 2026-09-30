"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
export default function PushPrompt({ userId }: { userId: string }) {
  const [status, setStatus] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  async function save(subscription: PushSubscription, action?: string) {
    const response = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...subscription.toJSON(), action }),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error);
  }
  useEffect(() => {
    let active = true;
    (async () => {
      const ios =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (ios && !matchMedia("(display-mode: standalone)").matches) {
        if (active) setStatus("install");
        return;
      }
      if (
        !isSecureContext ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (active) setStatus("unsupported");
        return;
      }
      const response = await fetch("/api/push");
      if (!response.ok) throw Error();
      const config = await response.json();
      if (!config.enabled) {
        if (active) setStatus("unconfigured");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription && Notification.permission === "granted")
        await save(subscription);
      if (active) {
        setKey(config.publicKey);
        setStatus(
          Notification.permission === "denied"
            ? "denied"
            : subscription
              ? "enabled"
              : "ready",
        );
      }
    })().catch(() => {
      if (active) setStatus("error");
    });
    return () => {
      active = false;
    };
  }, [userId]);
  async function toggle() {
    setBusy(true);
    try {
      if (
        status !== "enabled" &&
        (await Notification.requestPermission()) !== "granted"
      ) {
        setStatus(Notification.permission === "denied" ? "denied" : "ready");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (status === "enabled") {
        if (sub) {
          await save(sub, "unsubscribe");
          await sub.unsubscribe();
        }
        setStatus("ready");
        toast.success("تم إيقاف إشعارات هذا الجهاز");
        return;
      }
      const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      sub ??= await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      });
      await save(sub);
      setStatus("enabled");
      toast.success("تم تفعيل إشعارات الهاتف");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تفعيل الإشعارات");
    } finally {
      setBusy(false);
    }
  }
  if (status === "loading") return null;
  return (
    <section className="push-prompt">
      <Bell size={21} />
      <div>
        <strong>
          {status === "enabled" ? "إشعارات الهاتف مفعّلة" : "إشعارات الهاتف"}
        </strong>
        <p>
          {status === "install"
            ? "على iPhone: أضف الموقع إلى الشاشة الرئيسية ثم افتحه لتفعيل الإشعارات."
            : status === "denied"
              ? "اسمح بالإشعارات من إعدادات الموقع في المتصفح ثم حدّث الصفحة."
              : status === "unsupported"
                ? "استخدم متصفحًا يدعم إشعارات الهاتف وافتح الموقع عبر HTTPS."
                : status === "unconfigured"
                  ? "سيصبح التفعيل متاحًا بعد تجهيز خدمة الإشعارات."
                  : status === "error"
                    ? "تعذر تحميل إعدادات الإشعارات. حدّث الصفحة للمحاولة."
                    : status === "enabled"
                      ? "ستصلك الطلبات وتحديثات الدفع على هذا الجهاز."
                      : "فعّلها لتصلك الطلبات وتحديثات الدفع حتى بعد إغلاق الموقع."}
        </p>
      </div>
      {["ready", "enabled"].includes(status) && (
        <button
          className={status === "enabled" ? "text-button" : "primary"}
          disabled={busy}
          onClick={toggle}
        >
          {busy
            ? "جارٍ الحفظ…"
            : status === "enabled"
              ? "إيقاف"
              : "تفعيل الإشعارات"}
        </button>
      )}
    </section>
  );
}
