import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GroupFilter from "@/app/components/GroupFilter";
import SearchBar from "@/app/components/SearchBar";
import TimelineTypeFilter from "@/app/components/TimelineTypeFilter";
import VTuberFilter from "@/app/components/VTuberFilter";
import { UNGROUPED_FILTER_VALUE } from "@/lib/filter";

const vtubers = [
  { channelId: "channel-mizuki", name: "水樹", avatar: "https://example.com/mizuki.png", itemCount: 3 },
  { channelId: "channel-gabu", name: "Gabu", avatar: null, itemCount: 1 },
];

const groups = [
  { value: UNGROUPED_FILTER_VALUE, name: "個人勢", itemCount: 3 },
  { value: "子午計畫", name: "子午計畫", itemCount: 5 },
  { value: "空團體", name: "空團體", itemCount: 0 },
];

describe("SearchBar", () => {
  it("calls onChange as the user types", async () => {
    const onChange = vi.fn();
    render(<SearchBar value="" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("搜尋 VTuber"), "水");
    expect(onChange).toHaveBeenCalledWith("水");
  });
});

describe("GroupFilter", () => {
  const trigger = () => screen.getByRole("button", { name: "所屬團體篩選" });

  it("keeps the group list behind a trigger until it is opened", async () => {
    render(<GroupFilter options={groups} selected={null} totalCount={8} onSelect={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "子午計畫" })).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(trigger());

    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "子午計畫" })).toBeInTheDocument();
  });

  it("names the active group on the trigger", () => {
    render(<GroupFilter options={groups} selected="子午計畫" totalCount={8} onSelect={vi.fn()} />);
    expect(trigger()).toHaveTextContent("子午計畫");
  });

  it("renders counts, including the total and empty groups", async () => {
    render(<GroupFilter options={groups} selected={null} totalCount={8} onSelect={vi.fn()} />);
    await userEvent.click(trigger());

    expect(screen.getByRole("button", { name: "全部團體" })).toHaveTextContent("8");
    expect(screen.getByRole("button", { name: "個人勢" })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: "空團體" })).toHaveTextContent("0");
  });

  it("emits the chosen group and closes", async () => {
    const onSelect = vi.fn();
    render(<GroupFilter options={groups} selected={null} totalCount={8} onSelect={onSelect} />);
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("button", { name: "個人勢" }));

    expect(onSelect).toHaveBeenCalledWith(UNGROUPED_FILTER_VALUE);
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("dismisses the popover on an outside click", async () => {
    render(
      <div>
        <GroupFilter options={groups} selected={null} totalCount={8} onSelect={vi.fn()} />
        <button type="button">別的地方</button>
      </div>,
    );
    await userEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(screen.getByRole("button", { name: "別的地方" }));

    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("dismisses the popover on Escape", async () => {
    render(<GroupFilter options={groups} selected={null} totalCount={8} onSelect={vi.fn()} />);
    await userEvent.click(trigger());

    await userEvent.keyboard("{Escape}");

    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("emits null to clear the group", async () => {
    const onSelect = vi.fn();
    render(<GroupFilter options={groups} selected="子午計畫" totalCount={8} onSelect={onSelect} />);
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("button", { name: "全部團體" }));

    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

describe("TimelineTypeFilter", () => {
  it("renders counts, reflects selection, and emits the selected kind", async () => {
    const onSelect = vi.fn();
    render(
      <TimelineTypeFilter
        counts={{ live: 2, upcoming: 4, recent: 8, milestone: 1 }}
        selected="upcoming"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole("button", { name: "全部類型" })).toHaveTextContent("15");
    expect(screen.getByRole("button", { name: "正在直播" })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: "預定直播" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "已完成直播" })).toHaveTextContent("8");
    expect(screen.getByRole("button", { name: "重要里程碑" })).toHaveTextContent("1");

    await userEvent.click(screen.getByRole("button", { name: "重要里程碑" }));
    expect(onSelect).toHaveBeenCalledWith("milestone");

    await userEvent.click(screen.getByRole("button", { name: "全部類型" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

describe("VTuberFilter", () => {
  const trigger = () => screen.getByRole("button", { name: "VTuber 篩選" });

  it("keeps the channel grid behind a trigger until it is opened", async () => {
    render(<VTuberFilter options={vtubers} selected={null} totalCount={4} onSelect={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "水樹" })).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(trigger());

    expect(screen.getByRole("button", { name: "水樹" })).toBeInTheDocument();
  });

  it("names the active VTuber on the trigger", () => {
    render(<VTuberFilter options={vtubers} selected="channel-gabu" totalCount={4} onSelect={vi.fn()} />);
    expect(trigger()).toHaveTextContent("Gabu");
  });

  it("reflects the selection and emits the channel ID on click", async () => {
    const onSelect = vi.fn();
    render(<VTuberFilter options={vtubers} selected="channel-gabu" totalCount={4} onSelect={onSelect} />);
    await userEvent.click(trigger());

    expect(screen.getByRole("button", { name: "Gabu" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "水樹" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: "水樹" }));
    expect(onSelect).toHaveBeenCalledWith("channel-mizuki");
  });

  it("renders names and item counts, and resets the selection with 全部", async () => {
    const onSelect = vi.fn();
    render(<VTuberFilter options={vtubers} selected="channel-mizuki" totalCount={4} onSelect={onSelect} />);
    await userEvent.click(trigger());

    const allButton = screen.getByRole("button", { name: "全部" });
    const mizukiButton = screen.getByRole("button", { name: "水樹" });
    const gabuButton = screen.getByRole("button", { name: "Gabu" });

    expect(within(allButton).getByText("4")).toBeInTheDocument();
    expect(within(mizukiButton).getByText("3")).toBeInTheDocument();
    expect(within(gabuButton).getByText("1")).toBeInTheDocument();

    await userEvent.click(allButton);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("falls back to the name initial when an avatar is missing or fails to load", async () => {
    render(<VTuberFilter options={vtubers} selected={null} totalCount={4} onSelect={vi.fn()} />);
    await userEvent.click(trigger());

    const mizukiButton = screen.getByRole("button", { name: "水樹" });
    const gabuButton = screen.getByRole("button", { name: "Gabu" });
    const mizukiAvatar = mizukiButton.querySelector("img");

    expect(mizukiAvatar).toHaveAttribute("src", "https://example.com/mizuki.png");
    expect(gabuButton.querySelector("img")).not.toBeInTheDocument();
    expect(within(gabuButton).getByText("G")).toBeInTheDocument();

    fireEvent.error(mizukiAvatar!);

    expect(mizukiButton.querySelector("img")).not.toBeInTheDocument();
    expect(within(mizukiButton).getByText("水")).toBeInTheDocument();
  });
});
