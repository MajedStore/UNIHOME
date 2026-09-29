"use client";
import { Toaster } from "sonner";
export default function ToastProvider() {
  return (
    <Toaster
      dir="rtl"
      position="top-center"
      closeButton
      duration={4500}
      toastOptions={{
        className: "site-toast",
        style: {
          fontFamily: "var(--font)",
          background: "#fff",
          color: "#20352f",
          border: "1px solid #dce8e0",
          borderRadius: "9px",
          boxShadow: "0 4px 18px #20352f12",
        },
      }}
    />
  );
}
