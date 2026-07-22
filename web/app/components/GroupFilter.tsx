"use client";

export default function GroupFilter({ groups, selected, onToggle }: {
  groups: string[]; selected: string[]; onToggle: (g: string) => void;
}) {
  const sel = new Set(selected);
  return (
    <div className="flex flex-wrap gap-2">
      {groups.map((g) => {
        const on = sel.has(g);
        return (
          <button
            key={g}
            type="button"
            onClick={() => onToggle(g)}
            aria-pressed={on}
            className="rounded-pill px-3 py-1 text-xs font-medium transition-colors"
            style={on
              ? { background: "var(--bg-accent-pink-muted)", color: "var(--text-primary)", border: "1px solid var(--accent-pink)" }
              : { background: "var(--bg-surface-muted)", color: "var(--text-secondary)", border: "1px solid transparent" }}
          >
            {g}
          </button>
        );
      })}
    </div>
  );
}
