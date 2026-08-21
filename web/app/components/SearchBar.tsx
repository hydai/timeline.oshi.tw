"use client";
import { Search } from "lucide-react";

export default function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-[var(--bg-surface-muted)] px-3.5 sm:max-w-[288px]">
      <Search size={16} className="flex-none text-text-secondary" aria-hidden />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜尋 VTuber…"
        aria-label="搜尋 VTuber"
        className="w-full min-w-0 bg-transparent text-[13.5px] text-text-primary outline-none placeholder:text-text-tertiary"
      />
    </label>
  );
}
