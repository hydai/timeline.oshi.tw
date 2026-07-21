import ThemeToggle from "./ThemeToggle";

export default function Header({ updatedAt }: { updatedAt: string }) {
  return (
    <header className="mb-6 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold tracking-tight"
            style={{ backgroundImage: "linear-gradient(135deg, var(--accent-pink), var(--accent-blue))", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
          timeline.oshi.tw
        </h1>
        {updatedAt && <p className="text-xs text-text-tertiary">資料更新於 {updatedAt}</p>}
      </div>
      <ThemeToggle />
    </header>
  );
}
