import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StreamCard from "@/app/components/StreamCard";
import MilestoneCard from "@/app/components/MilestoneCard";

const channel = { name: "水樹", handle: "@mizuki", avatar: null, group: "子午計畫", nationality: "TW", youtube_subs: 1, twvtuber_id: "t" };
const now = Date.parse("2026-07-21T12:00:00Z");

describe("StreamCard", () => {
  it("renders a live stream: link, status, viewers", () => {
    render(<StreamCard kind="live" nowMs={now} channel={channel}
      stream={{ videoId: "v", channelId: "c", title: "深夜雜談", thumbnail: null, url: "https://youtu.be/v", actualStart: "2026-07-21T11:40:00Z", concurrentViewers: 1234 }} />);
    expect(screen.getByText("水樹")).toBeInTheDocument();
    expect(screen.getByText("深夜雜談")).toBeInTheDocument();
    expect(screen.getByText("直播中")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://youtu.be/v");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
  it("upcoming without scheduledStart shows 即將開始", () => {
    render(<StreamCard kind="upcoming" nowMs={now} channel={channel}
      stream={{ videoId: "v", channelId: "c", title: "歌枠", thumbnail: null, url: "u" }} />);
    expect(screen.getByText("即將開始")).toBeInTheDocument();
  });
});

describe("MilestoneCard", () => {
  it("renders an anniversary with channel + label", () => {
    render(<MilestoneCard channel={channel} milestone={{ channelId: "c", type: "anniversary", date: "2026-07-24" }} />);
    expect(screen.getByText("水樹")).toBeInTheDocument();
    expect(screen.getByText(/週年/)).toBeInTheDocument();
  });
});
