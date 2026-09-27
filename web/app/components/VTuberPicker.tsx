"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Building2, CalendarClock, Check, ChevronDown, Search, Users, X } from "lucide-react";
import {
  UNGROUPED_FILTER_VALUE,
  type GroupChoice,
  type GroupFilterValue,
  type VTuberChoice,
} from "@/lib/filter";
import { describeChannelStatus, type ChannelStatus } from "@/lib/channel-status";
import ChannelAvatar from "./ChannelAvatar";
import { usePopover } from "./usePopover";

export interface VTuberPickerProps {
  query: string;
  onQueryChange: (query: string) => void;
  groups: GroupChoice[];
  memberTotalCount: number;
  selectedGroup: GroupFilterValue;
  onGroupSelect: (group: GroupFilterValue) => void;
  vtubers: VTuberChoice[];
  selectedChannelId: string | null;
  onChannelSelect: (channelId: string | null) => void;
  onClear: () => void;
  statuses: Map<string, ChannelStatus>;
  nowMs: number;
}

type Option =
  | { type: "all" }
  | { type: "group"; group: GroupChoice }
  | { type: "vtuber"; vtuber: VTuberChoice };

interface Section {
  key: string;
  label: string | null;
  options: Option[];
}

/**
 * The panel is a bottom sheet on a narrow screen and on a short one (a phone held
 * sideways), where a dropdown would leave no room for the list. The `dropdown:` variant
 * in globals.css is this query's complement.
 */
const SHEET_MEDIA = "(max-width: 639.98px), (max-height: 559.98px)";

/** A mouse can aim and type; a touch screen should not get a keyboard it did not ask for. */
const finePointer = () => typeof window.matchMedia !== "function" || window.matchMedia("(pointer: fine)").matches;

const byName = (left: VTuberChoice, right: VTuberChoice) => left.name.localeCompare(right.name, "zh-TW");

/** Live members lead their company; everyone else keeps a stable alphabetical place. */
function liveFirst(statuses: Map<string, ChannelStatus>) {
  return (left: VTuberChoice, right: VTuberChoice) =>
    Number(Boolean(statuses.get(right.channelId)?.live)) - Number(Boolean(statuses.get(left.channelId)?.live)) ||
    byName(left, right);
}

/** While searching, whoever is live or on next outranks the alphabet. */
function byActivity(statuses: Map<string, ChannelStatus>) {
  const rank = (vtuber: VTuberChoice): [number, number] => {
    const status = statuses.get(vtuber.channelId);
    if (status?.live) return [0, 0];
    if (status?.nextStart) return [1, Date.parse(status.nextStart)];
    return [2, 0];
  };
  return (left: VTuberChoice, right: VTuberChoice) => {
    const [leftTier, leftAt] = rank(left);
    const [rightTier, rightAt] = rank(right);
    return leftTier - rightTier || leftAt - rightAt || byName(left, right);
  };
}

/**
 * Browsing reads company by company, live members first and the rest in a stable order,
 * so a face is where it was last time; searching collapses that into one list, most
 * relevant first, led by any company whose name was typed.
 */
function buildSections(
  vtubers: VTuberChoice[],
  groups: GroupChoice[],
  selectedGroup: GroupFilterValue,
  statuses: Map<string, ChannelStatus>,
  query: string,
): Section[] {
  const toOptions = (list: VTuberChoice[]): Option[] => list.map((vtuber) => ({ type: "vtuber", vtuber }));
  const q = query.trim().toLowerCase();
  if (q) {
    const companies: Option[] = groups
      .filter((group) => group.value !== selectedGroup && group.name.toLowerCase().includes(q))
      .map((group) => ({ type: "group", group }));
    return [{ key: "results", label: null, options: [...companies, ...toOptions([...vtubers].sort(byActivity(statuses)))] }];
  }
  const everyone: Section = { key: "all", label: null, options: [{ type: "all" }] };
  if (selectedGroup) {
    return [everyone, { key: "members", label: null, options: toOptions([...vtubers].sort(liveFirst(statuses))) }];
  }
  const members = new Map<string, VTuberChoice[]>();
  for (const vtuber of vtubers) {
    const key = vtuber.group ?? UNGROUPED_FILTER_VALUE;
    members.set(key, [...(members.get(key) ?? []), vtuber]);
  }
  return [
    everyone,
    ...groups
      .filter((group) => members.has(group.value))
      .map((group) => ({
        key: group.value,
        label: group.name,
        options: toOptions(members.get(group.value)!.sort(liveFirst(statuses))),
      })),
  ];
}

function GroupChip({ id, label, count, active, onSelect }: {
  id: string; label: string; count: number; active: boolean; onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-describedby={`${id}-count`}
      aria-pressed={active}
      onClick={onSelect}
      className={[
        "inline-flex h-8 max-w-full items-center gap-1.5 rounded-pill border px-3 text-[12.5px] font-bold",
        "transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-pink",
        active
          ? "border-[var(--accent-pink)] bg-[var(--bg-accent-pink-muted)] text-[var(--text-accent-pink)]"
          : "border-[var(--border-default)] text-text-secondary hover:bg-[var(--bg-popover-hover)] hover:text-text-primary",
      ].join(" ")}
    >
      <span className="truncate">{label}</span>
      <span id={`${id}-count`} className="text-[11px] font-semibold tabular-nums opacity-80">
        {count}<span className="sr-only">位</span>
      </span>
    </button>
  );
}

type Status = { text: string; tone: "live" | "upcoming" | "neutral" };

function OptionRow({ id, label, status, secondary, avatar, live, selected, active, muted, onSelect, onHover }: {
  id: string;
  label: string;
  status: Status | null;
  secondary: string | null;
  avatar: ReactNode;
  live: boolean;
  selected: boolean;
  active: boolean;
  muted: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  // Spelled out for screen readers in one string: the visible line runs its parts
  // together, and a dimmed row says "nothing of this type" only to the eye.
  const description = [status?.text, secondary, muted ? "沒有符合的內容" : null].filter(Boolean).join("，");
  const descriptionId = description ? `${id}-description` : undefined;
  const tone = status?.tone === "live"
    ? "text-[var(--text-accent-pink)]"
    : status?.tone === "upcoming" ? "text-[var(--text-accent-blue)]" : "text-text-secondary";
  return (
    <div
      id={id}
      role="option"
      aria-label={label}
      aria-selected={selected}
      aria-describedby={descriptionId}
      onClick={onSelect}
      onMouseMove={onHover}
      className={[
        "flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors",
        selected ? "bg-[var(--bg-accent-pink-muted)]" : active ? "bg-[var(--bg-popover-hover)]" : "",
        active && selected ? "ring-1 ring-inset ring-[var(--accent-pink)]" : "",
      ].join(" ")}
    >
      <span className={`flex-none rounded-full ${live ? "ring-2 ring-[var(--accent-pink)] ring-offset-2 ring-offset-[var(--bg-surface)]" : ""} ${muted ? "opacity-50" : ""}`}>
        {avatar}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[13.5px] font-bold ${muted ? "text-text-secondary" : "text-text-primary"}`}>{label}</span>
        {descriptionId && <span id={descriptionId} className="sr-only">{description}</span>}
        {(status || secondary) && (
          <span className="flex min-w-0 items-center gap-1 text-[11.5px] font-semibold" aria-hidden>
            {status?.tone === "live" && (
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-[var(--accent-pink)] motion-safe:animate-pulse" />
            )}
            {status?.tone === "upcoming" && <CalendarClock size={12} strokeWidth={2.4} className={`flex-none ${tone}`} />}
            {status && <span className={`truncate ${tone}`}>{status.text}</span>}
            {status && secondary && <span className="text-text-tertiary">·</span>}
            {secondary && <span className="truncate text-text-secondary">{secondary}</span>}
          </span>
        )}
      </span>
      {selected && <Check size={16} strokeWidth={2.6} className="flex-none text-[var(--text-accent-pink)]" aria-hidden />}
    </div>
  );
}

/**
 * One place to find a VTuber: search by name or handle, narrow by company, and see at a
 * glance who is live or on next. It replaces three separate controls — a search box, a
 * company dropdown and an avatar grid — that each answered part of the same question.
 */
export default function VTuberPicker({
  query,
  onQueryChange,
  groups,
  memberTotalCount,
  selectedGroup,
  onGroupSelect,
  vtubers,
  selectedChannelId,
  onChannelSelect,
  onClear,
  statuses,
  nowMs,
}: VTuberPickerProps) {
  const { open, setOpen, close, sheet, ref, panelRef, triggerRef } = usePopover<HTMLDivElement>({
    maxHeight: 560,
    sheetMedia: SHEET_MEDIA,
  });
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const listId = `${baseId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);

  // The input keeps its own text so an IME composition is never cut short by a re-render.
  const [draft, setDraft] = useState(query);
  const composing = useRef(false);
  useEffect(() => {
    if (!composing.current) setDraft(query);
  }, [query]);

  const searching = query.trim() !== "";
  // The selected VTuber rides along even when the search excludes it, only to be named.
  const listed = useMemo(() => vtubers.filter((vtuber) => vtuber.matches), [vtubers]);
  const sections = useMemo(
    () => buildSections(listed, groups, selectedGroup, statuses, query),
    [groups, listed, query, selectedGroup, statuses],
  );
  const options = useMemo(() => sections.flatMap((section) => section.options), [sections]);
  const optionId = (option: Option) =>
    `${baseId}-${option.type === "all" ? "all" : option.type === "group" ? `group-${groups.indexOf(option.group)}` : option.vtuber.channelId}`;
  const isSelected = (option: Option) =>
    option.type === "all" ? selectedChannelId === null
      : option.type === "vtuber" && option.vtuber.channelId === selectedChannelId;
  const matchCount = options.filter((option) => option.type === "vtuber").length;
  const companyCount = options.length - matchCount;

  // The keyboard cursor. It moves only when the panel opens, the search or company
  // changes, or an arrow key is pressed — never because results refreshed underneath it.
  const [activeIndex, setActiveIndex] = useState(0);
  const active = options.length > 0 ? Math.min(activeIndex, options.length - 1) : -1;
  const scrollOnOpen = useRef<string | null>(null);
  const moveTo = (index: number) => {
    setActiveIndex(index);
    document.getElementById(optionId(options[index]!))?.scrollIntoView({ block: "nearest" });
  };
  const search = (text: string) => {
    setActiveIndex(0);
    onQueryChange(text);
  };

  useEffect(() => {
    if (!open) return;
    if (finePointer()) inputRef.current?.focus();
    else panelRef.current?.focus();
    if (scrollOnOpen.current) document.getElementById(scrollOnOpen.current)?.scrollIntoView({ block: "nearest" });
    scrollOnOpen.current = null;
  }, [open, panelRef]);

  const choose = (option: Option) => {
    if (option.type === "group") {
      // Drop the search first so Back does not land on it after the company.
      setDraft("");
      search("");
      onGroupSelect(option.group.value);
      return;
    }
    onChannelSelect(option.type === "all" ? null : option.vtuber.channelId);
    close(true);
  };

  const pickGroup = (group: GroupFilterValue) => {
    setActiveIndex(0);
    onGroupSelect(group);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter and arrows during an IME composition belong to the IME.
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter" && !finePointer()) {
      // A phone's search key should reveal the results, not jump to the first of them.
      event.preventDefault();
      inputRef.current?.blur();
      return;
    }
    if (options.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveTo((active + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveTo((active - 1 + options.length) % options.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(options[active]!);
    }
  };

  // The sheet covers the page, so Tab cycles inside it rather than into what it hides.
  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!sheet || event.key !== "Tab" || !panelRef.current) return;
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("button, input")]
      .filter((element) => !element.hasAttribute("disabled"));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    const current = document.activeElement;
    if (event.shiftKey && (current === first || current === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const toggle = () => {
    if (!open) {
      // A composition cut short by closing never reports its end; start the input afresh.
      composing.current = false;
      setDraft(query);
      // Open on the current choice while browsing, and on the best match while searching.
      const index = searching ? 0 : Math.max(0, options.findIndex(isSelected));
      setActiveIndex(index);
      scrollOnOpen.current = options[index] ? optionId(options[index]) : null;
    }
    setOpen(!open);
  };

  const clearSearch = () => {
    setDraft("");
    search("");
    inputRef.current?.focus();
  };

  const groupName = selectedGroup === UNGROUPED_FILTER_VALUE
    ? "個人勢"
    : groups.find((group) => group.value === selectedGroup)?.name ?? selectedGroup;
  const selectedVTuber = selectedChannelId
    ? vtubers.find((vtuber) => vtuber.channelId === selectedChannelId)
    : undefined;
  const filtered = Boolean(query || selectedGroup || selectedChannelId);

  let leading: ReactNode = <Search size={16} className="flex-none text-text-secondary" aria-hidden />;
  let label = "搜尋 VTuber、團體";
  let detail: string | null = null;
  // A search still narrowing the chosen VTuber must stay visible, or the rail looks empty for no reason.
  let narrowing: string | null = null;
  if (selectedChannelId) {
    label = selectedVTuber?.name ?? "VTuber";
    if (query) narrowing = `「${query}」`;
    else detail = selectedVTuber ? selectedVTuber.group ?? "個人勢" : null;
    leading = <ChannelAvatar key={selectedChannelId} src={selectedVTuber?.avatar ?? null} name={label} size={26} />;
  } else if (query) {
    label = `「${query}」`;
    detail = groupName;
  } else if (selectedGroup) {
    label = groupName ?? "";
    detail = `${groups.find((group) => group.value === selectedGroup)?.size ?? listed.length} 位`;
    leading = (
      <span className="flex flex-none items-center" aria-hidden>
        {[...listed].sort(byName).slice(0, 3).map((vtuber, index) => (
          <span key={vtuber.channelId} style={index > 0 ? { marginLeft: -8 } : undefined}>
            <ChannelAvatar src={vtuber.avatar} name={vtuber.name} size={24} className="border-2 border-[var(--bg-surface)]" />
          </span>
        ))}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative min-w-0 flex-1 md:max-w-[340px] md:flex-none md:basis-[260px] lg:basis-[340px]">
      <div
        className={[
          "flex h-11 items-center rounded-2xl transition-colors",
          filtered ? "bg-[var(--bg-accent-pink-muted)]" : "bg-[var(--bg-surface-muted)]",
        ].join(" ")}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={toggle}
          className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-2xl pl-3 pr-2 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-pink"
        >
          <span className="sr-only">VTuber 篩選：</span>
          {leading}
          <span className={`min-w-0 truncate text-[13.5px] ${filtered ? "font-bold text-text-primary" : "text-text-secondary"}`}>
            {label}
          </span>
          {narrowing && (
            <span className="max-w-[45%] flex-none truncate text-xs font-bold text-[var(--text-accent-pink)]">{narrowing}</span>
          )}
          {detail && <span className="hidden flex-none text-xs font-semibold text-text-secondary sm:inline">{detail}</span>}
          <ChevronDown size={14} strokeWidth={2.4} className="ml-auto flex-none text-text-secondary" aria-hidden />
        </button>
        {filtered && (
          <button
            type="button"
            aria-label="清除 VTuber 與團體篩選"
            title="清除 VTuber 與團體篩選"
            onClick={onClear}
            className="mr-1 grid h-9 w-9 flex-none place-items-center rounded-xl text-text-secondary transition-colors hover:bg-[var(--bg-popover-hover)] hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-pink"
          >
            <X size={16} strokeWidth={2.4} aria-hidden />
          </button>
        )}
      </div>

      {open && (
        <>
          {/* The sheet's backdrop; as a dropdown the panel needs none. */}
          <div className="fixed inset-0 z-40 bg-black/40 dropdown:hidden" aria-hidden onClick={() => close(true)} />
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label="選擇 VTuber 或團體"
            aria-modal={sheet || undefined}
            tabIndex={-1}
            onKeyDown={onPanelKeyDown}
            className={[
              "picker-panel popover-surface fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col rounded-t-3xl outline-hidden",
              "pb-[env(safe-area-inset-bottom)]",
              "dropdown:absolute dropdown:inset-x-auto dropdown:bottom-auto dropdown:left-0 dropdown:top-[calc(100%+8px)]",
              "dropdown:h-auto dropdown:max-h-[560px] dropdown:w-[460px] dropdown:rounded-2xl dropdown:pb-0",
            ].join(" ")}
          >
            <div className="flex flex-none items-center justify-between px-4 pt-3 dropdown:hidden">
              <span className="text-[15px] font-extrabold text-text-primary">篩選 VTuber</span>
              <button
                type="button"
                onClick={() => close(true)}
                className="rounded-pill px-3 py-1.5 text-sm font-bold text-[var(--text-accent-pink)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-pink"
              >
                完成
              </button>
            </div>

            <div className="flex-none border-b border-[var(--border-default)] p-3 pb-2.5">
              <div className="flex h-10 items-center gap-2 rounded-xl bg-[var(--bg-surface-muted)] px-3 ring-1 ring-inset ring-[var(--border-default)] focus-within:ring-2 focus-within:ring-accent-pink">
                <Search size={16} className="flex-none text-text-secondary" aria-hidden />
                <input
                  ref={inputRef}
                  role="combobox"
                  aria-label="搜尋 VTuber"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={active >= 0 ? optionId(options[active]!) : undefined}
                  type="text"
                  enterKeyHint="search"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="名字、@handle 或團體"
                  value={draft}
                  onChange={(event) => {
                    // Searched even mid-composition: Android keyboards compose plain letters
                    // too, and a search that waited would not narrow until a word was done.
                    setDraft(event.target.value);
                    search(event.target.value);
                  }}
                  onCompositionStart={() => {
                    composing.current = true;
                  }}
                  onCompositionEnd={() => {
                    composing.current = false;
                  }}
                  onKeyDown={onInputKeyDown}
                  className="w-full min-w-0 bg-transparent text-[14px] text-text-primary outline-hidden placeholder:text-text-secondary"
                />
                {draft && (
                  <button
                    type="button"
                    aria-label="清除搜尋"
                    onClick={clearSearch}
                    className="grid h-7 w-7 flex-none place-items-center rounded-lg text-text-secondary hover:bg-[var(--bg-popover-hover)] hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-pink"
                  >
                    <X size={14} strokeWidth={2.4} aria-hidden />
                  </button>
                )}
              </div>
              <div role="group" aria-label="所屬團體" className="mt-2.5 flex flex-wrap gap-1.5">
                <GroupChip
                  id={`${baseId}-chip-all`}
                  label="全部團體"
                  count={memberTotalCount}
                  active={!selectedGroup}
                  onSelect={() => pickGroup(null)}
                />
                {groups.map((group, index) => (
                  <GroupChip
                    key={group.value}
                    id={`${baseId}-chip-${index}`}
                    label={group.name}
                    count={group.memberCount}
                    active={selectedGroup === group.value}
                    onSelect={() => pickGroup(group.value)}
                  />
                ))}
              </div>
            </div>

            <p role="status" className="sr-only">
              {searching
                ? matchCount + companyCount > 0
                  ? `找到 ${matchCount} 位 VTuber${companyCount ? `、${companyCount} 個團體` : ""}`
                  : `找不到符合「${query}」的 VTuber`
                : ""}
            </p>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
              {searching && options.length === 0 && (
                <div className="px-4 pb-6 pt-5 text-center">
                  <p className="text-sm font-bold text-text-primary">找不到「{query}」</p>
                  {selectedGroup && memberTotalCount > 0 ? (
                    <>
                      <p className="mt-1 text-xs text-text-secondary">{groupName}沒有符合的成員。</p>
                      <button
                        type="button"
                        onClick={() => pickGroup(null)}
                        className="mt-3 rounded-pill bg-[var(--bg-surface-muted)] px-4 py-2 text-sm font-semibold text-text-primary hover:bg-[var(--bg-popover-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-pink"
                      >
                        在全部團體中搜尋（{memberTotalCount} 位符合）
                      </button>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-text-secondary">試試名字的一部分、頻道的 @handle，或團體名稱。</p>
                  )}
                </div>
              )}
              <div id={listId} role="listbox" aria-label="VTuber">
                {sections.map((section) => {
                  const rows = section.options.map((option) => {
                    const index = options.indexOf(option);
                    const shared = {
                      id: optionId(option),
                      selected: isSelected(option),
                      active: index === active,
                      onSelect: () => choose(option),
                      onHover: () => setActiveIndex(index),
                    };
                    if (option.type === "all") {
                      return (
                        <OptionRow
                          key="all"
                          {...shared}
                          label={selectedGroup ? `${groupName} 全部成員` : "全部 VTuber"}
                          status={null}
                          secondary={`${selectedGroup ? listed.length : memberTotalCount} 位`}
                          avatar={(
                            <span
                              className="grid h-9 w-9 place-items-center rounded-full text-white"
                              style={{ background: "linear-gradient(135deg, var(--accent-pink), var(--accent-purple))" }}
                              aria-hidden
                            >
                              <Users size={16} strokeWidth={2.4} />
                            </span>
                          )}
                          live={false}
                          muted={false}
                        />
                      );
                    }
                    if (option.type === "group") {
                      return (
                        <OptionRow
                          key={`group-${option.group.value}`}
                          {...shared}
                          label={option.group.name}
                          status={{ tone: "neutral", text: `團體 · ${option.group.size} 位` }}
                          secondary={null}
                          avatar={(
                            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--bg-accent-pink-muted)] text-[var(--text-accent-pink)]" aria-hidden>
                              <Building2 size={16} strokeWidth={2.2} />
                            </span>
                          )}
                          live={false}
                          muted={false}
                        />
                      );
                    }
                    const { vtuber } = option;
                    const status = describeChannelStatus(statuses.get(vtuber.channelId), nowMs);
                    const muted = vtuber.itemCount === 0;
                    return (
                      <OptionRow
                        key={vtuber.channelId}
                        {...shared}
                        label={vtuber.name}
                        status={status}
                        secondary={searching ? vtuber.group ?? "個人勢" : null}
                        avatar={<ChannelAvatar src={vtuber.avatar} name={vtuber.name} size={36} />}
                        live={Boolean(statuses.get(vtuber.channelId)?.live)}
                        muted={muted}
                      />
                    );
                  });
                  return section.label ? (
                    <div key={section.key} role="group" aria-label={section.label}>
                      <div className="px-2.5 pb-1 pt-3 text-[11px] font-bold tracking-wide text-[var(--text-filter-muted)]" aria-hidden>
                        {section.label}
                        <span className="ml-1.5 font-semibold tabular-nums opacity-80">{section.options.length} 位</span>
                      </div>
                      {rows}
                    </div>
                  ) : (
                    <div key={section.key}>{rows}</div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
