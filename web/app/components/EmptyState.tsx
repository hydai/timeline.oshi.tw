import type { ReactNode } from "react";

/** Nothing matched. `actions` are the ways out: each one loosens a filter that is on. */
export default function EmptyState({ actions }: { actions?: ReactNode }) {
  return (
    <div role="status" className="glass rounded-2xl p-8 text-center text-text-secondary">
      <div className="text-3xl" aria-hidden>🌙</div>
      <p className="mt-2 text-sm">目前沒有符合的直播動態</p>
      {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
