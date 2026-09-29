import type { Metadata } from "next";
import "./globals.css";
import ToastProvider from "@/components/toast-provider";
export const metadata: Metadata = {
  title: "يوني هوم | مصاريف البيت، بكل بساطة",
  description: "مكان واحد لتنظيم مصاريف السكن المشترك ومتابعة الدفعات.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
