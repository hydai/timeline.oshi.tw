import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "timeline.oshi.tw — 台 V 直播時間軸",
  description: "台灣 VTuber 直播動態河道",
};

const noFlashScript = `(function(){try{var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme:dark)').matches;if(t==='dark'||(!t&&d))document.documentElement.classList.add('dark')}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
