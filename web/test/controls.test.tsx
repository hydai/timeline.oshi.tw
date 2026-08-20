import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchBar from "@/app/components/SearchBar";
import TimelineTypeFilter from "@/app/components/TimelineTypeFilter";
import VTuberFilter from "@/app/components/VTuberFilter";

const vtubers = [
  {
    channelId: "channel-mizuki",
    name: "水樹",
    avatar: "https://example.com/mizuki.png",
    itemCount: 3,
  },
  {
    channelId: "channel-gabu",
    name: "Gabu",
    avatar: null,
    itemCount: 1,
  },
];

describe("SearchBar", () => {
  it("calls onChange as the user types", async () => {
    const onChange = vi.fn();
    render(<SearchBar value="" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("搜尋 VTuber"), "水");
    expect(onChange).toHaveBeenCalledWith("水");
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
  it("reflects the selected VTuber and emits its channel ID on click", async () => {
    const onSelect = vi.fn();
    render(
      <VTuberFilter
        options={vtubers}
        selected="channel-gabu"
        totalCount={4}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole("button", { name: "Gabu" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "水樹" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: "水樹" }));

    expect(onSelect).toHaveBeenCalledWith("channel-mizuki");
  });

  it("renders names and item counts, and resets the selection with 全部", async () => {
    const onSelect = vi.fn();
    render(
      <VTuberFilter
        options={vtubers}
        selected="channel-mizuki"
        totalCount={4}
        onSelect={onSelect}
      />,
    );

    const allButton = screen.getByRole("button", { name: "全部" });
    const mizukiButton = screen.getByRole("button", { name: "水樹" });
    const gabuButton = screen.getByRole("button", { name: "Gabu" });

    expect(within(allButton).getByText("4")).toBeInTheDocument();
    expect(within(mizukiButton).getByText("水樹")).toBeInTheDocument();
    expect(within(mizukiButton).getByText("3")).toBeInTheDocument();
    expect(within(gabuButton).getByText("Gabu")).toBeInTheDocument();
    expect(within(gabuButton).getByText("1")).toBeInTheDocument();

    await userEvent.click(allButton);

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("falls back to the name initial when an avatar is missing or fails to load", () => {
    render(
      <VTuberFilter
        options={vtubers}
        selected={null}
        totalCount={4}
        onSelect={vi.fn()}
      />,
    );

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
