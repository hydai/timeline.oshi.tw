import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "timeline.oshi.tw" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
