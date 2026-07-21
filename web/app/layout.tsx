import "./globals.css";
import type { ReactNode } from "react";
import { DM_Sans } from "next/font/google";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "900"], variable: "--font-dm-sans", display: "swap" });

export const metadata = {
  title: "timeline.oshi.tw — 台 V 直播時間軸",
  description: "台灣 VTuber 直播動態河道",
};

const noFlashScript = `(function(){try{var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme:dark)').matches;if(t==='dark'||(!t&&d))document.documentElement.classList.add('dark')}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant" className={dmSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
