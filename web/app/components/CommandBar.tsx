"use client";

import type { ReactNode } from "react";

/**
 * The sticky filter row: who (the VTuber picker) and what (the content type). On a phone
 * they stack into two short rows, so the bar never costs more than a sliver of the rail.
 * The document order is the wide-screen order, so Tab walks it left to right; a phone
 * only moves the types onto their own row below.
 */
export default function CommandBar({ picker, typeFilter, actions }: {
  picker: ReactNode;
  typeFilter: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="glass-toolbar sticky top-2 z-30 rounded-3xl p-1.5 shadow-lg">
      <div className="flex flex-wrap items-center gap-1.5 md:flex-nowrap">
        {picker}
        <div className="order-last w-full min-w-0 md:order-none md:w-auto">{typeFilter}</div>
        {actions && <div className="flex flex-none items-center gap-1.5 md:ml-auto">{actions}</div>}
      </div>
    </div>
  );
}
