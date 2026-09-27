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
  it("names which anniversary it is and counts down to it", () => {
    // `now` is 7/21 20:00 in Taipei.
    render(<MilestoneCard channel={channel} milestone={{ channelId: "c", type: "anniversary", date: "2026-07-24" }} debutYear={2023} nowMs={now} />);
    expect(screen.getByText("水樹")).toBeInTheDocument();
    expect(screen.getByText("出道 3 週年")).toBeInTheDocument();
    expect(screen.getByText("還有 3 天")).toBeInTheDocument();
    // The rail's day divider already says which day it is.
    expect(screen.queryByText(/2026-07-24/)).not.toBeInTheDocument();
  });

  it("leaves 今天 and 明天 to the day header above it", () => {
    render(<MilestoneCard channel={channel} milestone={{ channelId: "c", type: "anniversary", date: "2026-07-22" }} debutYear={2023} nowMs={now} />);
    expect(screen.getByText("出道 3 週年")).toBeInTheDocument();
    expect(screen.queryByText("明天")).not.toBeInTheDocument();
  });

  it("stops counting once the day has passed", () => {
    render(<MilestoneCard channel={channel} milestone={{ channelId: "c", type: "debut", date: "2026-07-01" }} nowMs={now} />);
    expect(screen.getByText("出道")).toBeInTheDocument();
    expect(screen.queryByText(/天/)).not.toBeInTheDocument();
  });
});
