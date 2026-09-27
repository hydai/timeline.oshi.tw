import { afterEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimelineTypeFilter from "@/app/components/TimelineTypeFilter";
import VTuberPicker, { type VTuberPickerProps } from "@/app/components/VTuberPicker";
import { UNGROUPED_FILTER_VALUE, type VTuberChoice } from "@/lib/filter";
import type { ChannelStatus } from "@/lib/channel-status";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// 2026-09-27 16:00 in Taipei.
const NOW = Date.parse("2026-09-27T08:00:00Z");

const mizuki: VTuberChoice = { channelId: "channel-mizuki", name: "水樹", avatar: "https://example.com/mizuki.png", group: "子午計畫", itemCount: 3, matches: true };
const kirali: VTuberChoice = { channelId: "channel-kirali", name: "煌Kirali", avatar: null, group: "子午計畫", itemCount: 0, matches: true };
const gabu: VTuberChoice = { channelId: "channel-gabu", name: "Gabu", avatar: null, group: null, itemCount: 1, matches: true };

const groups = [
  { value: "子午計畫", name: "子午計畫", memberCount: 2, size: 2 },
  { value: "空團體", name: "空團體", memberCount: 0, size: 0 },
  { value: UNGROUPED_FILTER_VALUE, name: "個人勢", memberCount: 1, size: 1 },
];

/** A screen whose size can change while the page is open, as when a phone is rotated. */
function mockResizableScreen() {
  let small = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => {
    const sized = query.includes("max-width");
    return {
      get matches() {
        return query.includes("pointer: fine") ? true : sized ? small : false;
      },
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (_type: string, listener: () => void) => {
        if (sized) listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        listeners.delete(listener);
      },
      dispatchEvent: vi.fn(),
    };
  });
  return {
    resize(toSmall: boolean) {
      small = toSmall;
      for (const listener of [...listeners]) listener();
    },
  };
}

/** jsdom has no media queries; answer the two the picker asks. */
function mockScreen({ small, touch }: { small: boolean; touch: boolean }) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("pointer: fine") ? !touch : query.includes("max-width") ? small : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const statuses = new Map<string, ChannelStatus>([
  ["channel-mizuki", { live: true, nextStart: null }],
  ["channel-gabu", { live: false, nextStart: "2026-09-27T12:00:00Z" }],
]);

function renderPicker(overrides: Partial<VTuberPickerProps> = {}) {
  const props: VTuberPickerProps = {
    query: "",
    onQueryChange: vi.fn(),
    groups,
    memberTotalCount: 3,
    selectedGroup: null,
    onGroupSelect: vi.fn(),
    vtubers: [mizuki, kirali, gabu],
    selectedChannelId: null,
    onChannelSelect: vi.fn(),
    onClear: vi.fn(),
    statuses,
    nowMs: NOW,
    ...overrides,
  };
  const view = render(<VTuberPicker {...props} />);
  return { props, ...view };
}

const trigger = () => screen.getByRole("button", { name: /^VTuber 篩選/ });
const dialog = () => screen.getByRole("dialog", { name: "選擇 VTuber 或團體" });
const searchBox = () => screen.getByRole("combobox", { name: "搜尋 VTuber" });

describe("VTuberPicker", () => {
  it("keeps its panel closed until the trigger is pressed", async () => {
    renderPicker();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(trigger());

    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(dialog()).toBeInTheDocument();
  });

  it("names the current VTuber, group, or search on the trigger", () => {
    const { rerender, props } = renderPicker({ selectedChannelId: "channel-gabu" });
    expect(trigger()).toHaveAccessibleName(/Gabu/);

    rerender(<VTuberPicker {...props} selectedChannelId={null} selectedGroup="子午計畫" />);
    expect(trigger()).toHaveAccessibleName(/子午計畫/);

    rerender(<VTuberPicker {...props} selectedChannelId={null} query="水" />);
    expect(trigger()).toHaveAccessibleName(/水/);
  });

  it("names a search that still narrows the selected VTuber, and leaves that VTuber out of its results", async () => {
    const excluded: VTuberChoice = { ...gabu, itemCount: 0, matches: false };
    renderPicker({ selectedChannelId: "channel-gabu", query: "水", vtubers: [excluded, mizuki] });

    expect(trigger()).toHaveAccessibleName(/Gabu/);
    expect(trigger()).toHaveAccessibleName(/「水」/);

    await userEvent.click(trigger());
    expect(screen.queryByRole("option", { name: "Gabu" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "水樹" })).toBeInTheDocument();
  });

  it("shows each chosen VTuber's own avatar on the trigger", () => {
    const pictured: VTuberChoice = { ...gabu, avatar: "https://example.com/gabu.png" };
    const { props, rerender } = renderPicker({ selectedChannelId: "channel-mizuki", vtubers: [mizuki, pictured] });
    fireEvent.error(trigger().querySelector("img")!);

    rerender(<VTuberPicker {...props} selectedChannelId="channel-gabu" />);

    expect(trigger().querySelector("img")).toHaveAttribute("src", "https://example.com/gabu.png");
  });

  it("lists VTubers under their groups with what each is doing", async () => {
    renderPicker();
    await userEvent.click(trigger());

    const company = within(dialog()).getByRole("group", { name: "子午計畫" });
    expect(within(company).getAllByRole("option").map((option) => option.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("水樹"), expect.stringContaining("煌Kirali")]),
    );
    expect(within(within(dialog()).getByRole("group", { name: "個人勢" })).getByRole("option", { name: "Gabu" }))
      .toBeInTheDocument();

    expect(screen.getByRole("option", { name: "水樹" })).toHaveAccessibleDescription("直播中");
    expect(screen.getByRole("option", { name: "Gabu" })).toHaveAccessibleDescription("今天 20:00 開台");
    // Nothing of the selected type: still offered, but flagged.
    expect(screen.getByRole("option", { name: "煌Kirali" })).toHaveAccessibleDescription("沒有符合的內容");
  });

  it("puts a company's live members first, and the rest in name order", async () => {
    // zh-TW collates by stroke count, so 一葉 and 小夜 both sort ahead of 水樹 by name.
    const ichiyo: VTuberChoice = { channelId: "channel-ichiyo", name: "一葉", avatar: null, group: "子午計畫", itemCount: 1, matches: true };
    const sayo: VTuberChoice = { channelId: "channel-sayo", name: "小夜", avatar: null, group: "子午計畫", itemCount: 1, matches: true };
    renderPicker({ vtubers: [sayo, mizuki, ichiyo] });
    await userEvent.click(trigger());

    const company = within(dialog()).getByRole("group", { name: "子午計畫" });
    expect(within(company).getAllByRole("option").map((option) => option.getAttribute("aria-label")))
      .toEqual(["水樹", "一葉", "小夜"]);
  });

  it("tells a screen reader when a live VTuber has nothing of the selected type", async () => {
    renderPicker({ vtubers: [{ ...mizuki, itemCount: 0 }] });
    await userEvent.click(trigger());

    // Sighted readers see the row dimmed; the description has to say the same.
    expect(screen.getByRole("option", { name: "水樹" })).toHaveAccessibleDescription("直播中，沒有符合的內容");
  });

  it("picks a VTuber and closes", async () => {
    const { props } = renderPicker();
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("option", { name: "Gabu" }));

    expect(props.onChannelSelect).toHaveBeenCalledWith("channel-gabu");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers every VTuber again", async () => {
    const { props } = renderPicker({ selectedChannelId: "channel-gabu" });
    await userEvent.click(trigger());

    expect(screen.getByRole("option", { name: "Gabu" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("option", { name: "全部 VTuber" }));

    expect(props.onChannelSelect).toHaveBeenCalledWith(null);
  });

  it("filters by group from the chips and stays open to show the members", async () => {
    const { props } = renderPicker({ selectedGroup: "子午計畫" });
    await userEvent.click(trigger());

    expect(screen.getByRole("button", { name: "子午計畫" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "子午計畫" })).toHaveAccessibleDescription("2位");
    expect(screen.getByRole("button", { name: "全部團體" })).toHaveAccessibleDescription("3位");
    await userEvent.click(screen.getByRole("button", { name: "個人勢" }));
    expect(props.onGroupSelect).toHaveBeenCalledWith(UNGROUPED_FILTER_VALUE);
    await userEvent.click(screen.getByRole("button", { name: "全部團體" }));
    expect(props.onGroupSelect).toHaveBeenLastCalledWith(null);

    expect(dialog()).toBeInTheDocument();
  });

  it("searches as the user types", async () => {
    const { props } = renderPicker();
    await userEvent.click(trigger());
    await userEvent.type(searchBox(), "Ga");

    expect(searchBox()).toHaveValue("Ga");
    expect(props.onQueryChange).toHaveBeenLastCalledWith("Ga");
  });

  it("keeps searching while an IME composes, but leaves its keys to the IME", async () => {
    const { props } = renderPicker({ query: "G", vtubers: [gabu] });
    await userEvent.click(trigger());
    const input = searchBox();

    // Android keyboards compose even plain letters, so a search that waited for the
    // composition to end would not narrow anything until a word was committed.
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "Ga" } });
    expect(props.onQueryChange).toHaveBeenLastCalledWith("Ga");

    // Enter confirms the IME candidate and Escape cancels it; neither may act on the panel.
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Escape", keyCode: 229 });
    expect(props.onChannelSelect).not.toHaveBeenCalled();
    expect(dialog()).toBeInTheDocument();
  });

  it("starts clean after a composition was cut short", async () => {
    const { props, rerender } = renderPicker();
    await userEvent.click(trigger());
    fireEvent.compositionStart(searchBox());
    fireEvent.change(searchBox(), { target: { value: "ㄕ" } });
    // Clicking away mid-composition removes the input before compositionend arrives.
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(<VTuberPicker {...props} query="Gabu" />);
    await userEvent.click(trigger());
    expect(searchBox()).toHaveValue("Gabu");
    await userEvent.type(searchBox(), "x");
    expect(props.onQueryChange).toHaveBeenLastCalledWith("Gabux");
  });

  it("suggests a company whose name matches the search, and switches to it", async () => {
    const { props } = renderPicker({ query: "子午", vtubers: [] });
    await userEvent.click(trigger());

    const suggestion = screen.getByRole("option", { name: "子午計畫" });
    expect(suggestion).toHaveAccessibleDescription("團體 · 2 位");
    await userEvent.click(suggestion);

    // The search is dropped before the company is chosen, so Back returns to neither.
    expect(props.onQueryChange).toHaveBeenLastCalledWith("");
    expect(props.onGroupSelect).toHaveBeenCalledWith("子午計畫");
    expect(vi.mocked(props.onQueryChange).mock.invocationCallOrder.at(-1))
      .toBeLessThan(vi.mocked(props.onGroupSelect).mock.invocationCallOrder[0]!);
    expect(dialog()).toBeInTheDocument();
  });

  it("offers to look in every company when the chosen one has no match", async () => {
    const { props } = renderPicker({ query: "gab", selectedGroup: "子午計畫", vtubers: [], memberTotalCount: 1 });
    await userEvent.click(trigger());

    await userEvent.click(screen.getByRole("button", { name: /在全部團體中搜尋/ }));
    expect(props.onGroupSelect).toHaveBeenCalledWith(null);
  });

  it("announces how many VTubers match the search", async () => {
    renderPicker({ query: "i", vtubers: [kirali, gabu, mizuki] });
    await userEvent.click(trigger());

    expect(within(dialog()).getByRole("status")).toHaveTextContent("找到 3 位");
  });

  it("brings the current VTuber into view when opened, and returns to the top on a new company", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    renderPicker({ selectedChannelId: "channel-gabu" });
    await userEvent.click(trigger());

    expect(scroll.mock.contexts).toContain(screen.getByRole("option", { name: "Gabu" }));

    await userEvent.click(screen.getByRole("button", { name: "子午計畫" }));
    expect(searchBox()).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: "全部 VTuber" }).id,
    );
  });

  it("opens as a modal sheet on a small screen, and keeps focus inside it", async () => {
    mockScreen({ small: true, touch: true });
    renderPicker();
    await userEvent.click(trigger());

    expect(dialog()).toHaveAttribute("aria-modal", "true");
    expect(document.documentElement.style.overflow).toBe("hidden");
    // A touch screen gets no keyboard until someone asks to type.
    expect(searchBox()).not.toHaveFocus();

    screen.getByRole("button", { name: "個人勢" }).focus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "完成" })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "個人勢" })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "完成" }));
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("becomes a modal sheet when the screen shrinks while it is open, and lets go when it grows", async () => {
    const screenSize = mockResizableScreen();
    renderPicker();
    await userEvent.click(trigger());
    expect(dialog()).not.toHaveAttribute("aria-modal");

    act(() => screenSize.resize(true));
    expect(dialog()).toHaveAttribute("aria-modal", "true");
    expect(document.documentElement.style.overflow).toBe("hidden");

    act(() => screenSize.resize(false));
    expect(dialog()).not.toHaveAttribute("aria-modal");
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("on a touch screen, lets the keyboard's search key only put the keyboard away", async () => {
    mockScreen({ small: true, touch: true });
    const { props } = renderPicker({ query: "ga", vtubers: [gabu] });
    await userEvent.click(trigger());
    searchBox().focus();

    await userEvent.keyboard("{Enter}");

    expect(props.onChannelSelect).not.toHaveBeenCalled();
    expect(searchBox()).not.toHaveFocus();
  });

  it("orders search results by what is happening now, and picks with the keyboard", async () => {
    const { props } = renderPicker({ query: "i", vtubers: [kirali, gabu, mizuki] });
    await userEvent.click(trigger());

    expect(screen.getAllByRole("option").map((option) => option.getAttribute("aria-label")))
      .toEqual(["水樹", "Gabu", "煌Kirali"]);
    expect(screen.queryByRole("option", { name: "全部 VTuber" })).not.toBeInTheDocument();

    searchBox().focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}{Enter}");
    expect(props.onChannelSelect).toHaveBeenCalledWith("channel-gabu");
  });

  it("explains a search with no match and offers to clear it", async () => {
    const { props } = renderPicker({ query: "zzz", vtubers: [] });
    await userEvent.click(trigger());

    expect(within(dialog()).getByText(/找不到「zzz」/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "清除搜尋" }));
    expect(props.onQueryChange).toHaveBeenLastCalledWith("");
  });

  it("closes on Escape and hands focus back to the trigger", async () => {
    renderPicker();
    await userEvent.click(trigger());
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("closes on an outside click", async () => {
    render(
      <div>
        <VTuberPicker
          query="" onQueryChange={vi.fn()} groups={groups} memberTotalCount={3}
          selectedGroup={null} onGroupSelect={vi.fn()} vtubers={[gabu]}
          selectedChannelId={null} onChannelSelect={vi.fn()} onClear={vi.fn()}
          statuses={statuses} nowMs={NOW}
        />
        <button type="button">別的地方</button>
      </div>,
    );
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("button", { name: "別的地方" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clears the VTuber, group, and search at once from the trigger", async () => {
    const { props, rerender } = renderPicker();
    expect(screen.queryByRole("button", { name: "清除 VTuber 與團體篩選" })).not.toBeInTheDocument();

    rerender(<VTuberPicker {...props} selectedGroup="子午計畫" query="水" />);
    await userEvent.click(screen.getByRole("button", { name: "清除 VTuber 與團體篩選" }));
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  it("falls back to the name initial when an avatar is missing or fails to load", async () => {
    renderPicker();
    await userEvent.click(trigger());

    const mizukiOption = screen.getByRole("option", { name: "水樹" });
    const gabuOption = screen.getByRole("option", { name: "Gabu" });
    const mizukiAvatar = mizukiOption.querySelector("img");

    expect(mizukiAvatar).toHaveAttribute("src", "https://example.com/mizuki.png");
    expect(gabuOption.querySelector("img")).not.toBeInTheDocument();
    expect(within(gabuOption).getByText("G")).toBeInTheDocument();

    fireEvent.error(mizukiAvatar!);

    expect(mizukiOption.querySelector("img")).not.toBeInTheDocument();
    expect(within(mizukiOption).getByText("水")).toBeInTheDocument();
  });
});

describe("TimelineTypeFilter", () => {
  it("counts what is live and upcoming, but not the whole archive", () => {
    render(
      <TimelineTypeFilter
        counts={{ live: 2, upcoming: 4, recent: 16930, milestone: 123 }}
        selected={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "正在直播" })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: "預定直播" })).toHaveTextContent("4");
    // The label names the button; the count still has to reach a screen reader.
    expect(screen.getByRole("button", { name: "正在直播" })).toHaveAccessibleDescription("2場");
    expect(screen.getByRole("button", { name: "預定直播" })).toHaveAccessibleDescription("4場");
    // Lifetime totals such as 16,930 finished streams say nothing about what to open next.
    for (const name of ["全部類型", "已完成直播", "重要里程碑"]) {
      expect(screen.getByRole("button", { name })).not.toHaveTextContent(/\d/);
    }
  });

  it("reflects the selection and emits the selected kind", async () => {
    const onSelect = vi.fn();
    render(
      <TimelineTypeFilter
        counts={{ live: 2, upcoming: 4, recent: 8, milestone: 1 }}
        selected="upcoming"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole("button", { name: "預定直播" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "全部類型" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: "重要里程碑" }));
    expect(onSelect).toHaveBeenCalledWith("milestone");

    await userEvent.click(screen.getByRole("button", { name: "全部類型" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
