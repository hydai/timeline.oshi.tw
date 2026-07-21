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
              ? { background: "linear-gradient(135deg, var(--accent-pink-light), var(--accent-blue-light))", color: "var(--text-on-accent)" }
              : { background: "var(--bg-surface-muted)", color: "var(--text-secondary)" }}
          >
            {g}
          </button>
        );
      })}
    </div>
  );
}
