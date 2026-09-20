import Link from "next/link";

export default function NotFound() {
  return (
    <main className="glass mx-auto mt-12 max-w-xl rounded-3xl p-8 text-center">
      <h1 className="text-xl font-bold text-text-primary">找不到這個頁面或 VTuber</h1>
      <p className="mt-3 text-sm text-text-secondary">請確認連結，或回到時間軸選擇 VTuber。</p>
      <Link href="/" className="mt-5 inline-block rounded-pill bg-[var(--bg-surface-muted)] px-5 py-3 text-sm font-semibold text-text-primary">回到直播時間軸</Link>
    </main>
  );
}
