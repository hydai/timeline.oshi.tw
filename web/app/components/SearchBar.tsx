"use client";
import { Search } from "lucide-react";

export default function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="glass flex items-center gap-2 rounded-pill px-4 py-2">
      <Search size={16} className="text-text-tertiary" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜尋 VTuber…"
        aria-label="搜尋 VTuber"
        className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
      />
    </div>
  );
}
