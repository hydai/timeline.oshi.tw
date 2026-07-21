"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setIsDark(next);
  }

  if (!mounted) return <span className="inline-block h-8 w-8" aria-hidden />;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="切換深淺色模式"
      className="glass flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:text-accent-pink"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
