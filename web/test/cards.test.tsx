import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StreamCard from "@/app/components/StreamCard";
import MilestoneCard from "@/app/components/MilestoneCard";
import MilestoneList from "@/app/components/MilestoneList";

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
  it("shows Twitch history without a replay link and labels its estimated end", () => {
    const { container } = render(<StreamCard kind="recent" nowMs={now} channel={channel}
      stream={{ platform: "twitch", videoId: "twitch:42", channelId: "c", title: "開台時的標題", categoryName: "Just Chatting", thumbnail: null, url: null, channelUrl: "https://www.twitch.tv/example", actualStart: "2026-07-21T10:00:00Z", estimatedEnd: "2026-07-21T11:00:00Z" }} />);
    expect(screen.getByText("直播紀錄 · 無重播")).toBeInTheDocument();
    expect(screen.getByText("Just Chatting")).toBeInTheDocument();
    expect(screen.getByText("約 1 小時前")).toBeInTheDocument();
    expect(screen.getByText(/開台 2026-07-21 18:00/)).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "前往 Twitch 頻道" })).toHaveAttribute("href", "https://www.twitch.tv/example");
    expect(container.querySelector("article")).not.toBeNull();
    expect(container.querySelector("a a")).toBeNull();
  });
  it("links a live Twitch session directly to the channel", () => {
    render(<StreamCard kind="live" nowMs={now} channel={channel}
      stream={{ platform: "twitch", videoId: "twitch:42", channelId: "c", title: "Twitch live", thumbnail: null, url: "https://www.twitch.tv/example" }} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://www.twitch.tv/example");
    expect(screen.queryByText("直播紀錄 · 無重播")).not.toBeInTheDocument();
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

describe("MilestoneList", () => {
  const milestoneItem = (channelId: string, name: string, type: "debut" | "anniversary", date: string) => ({
    kind: "milestone" as const,
    sortAt: 0,
    milestone: { channelId, type, date },
    channel: { ...channel, name },
  });

  it("gives each milestone its day, what it is, and how long until it", () => {
    render(
      <MilestoneList
        upcoming
        nowMs={now}
        debutYears={new Map([["mizuki", 2023]])}
        items={[
          milestoneItem("mizuki", "水樹", "anniversary", "2026-07-21"),
          milestoneItem("gabu", "Gabu", "debut", "2026-07-24"),
        ]}
      />,
    );

    const [today, later] = screen.getAllByRole("listitem");
    expect(today).toHaveTextContent("7/21");
    expect(today).toHaveTextContent("週二");
    expect(today).toHaveTextContent("水樹");
    expect(today).toHaveTextContent("出道 3 週年");
    expect(today).toHaveTextContent("今天");
    expect(later).toHaveTextContent("Gabu");
    expect(later).toHaveTextContent("出道");
    expect(later).toHaveTextContent("還有 3 天");
  });

  it("leaves the countdown off milestones already past", () => {
    render(
      <MilestoneList
        upcoming={false}
        nowMs={now}
        debutYears={new Map()}
        items={[milestoneItem("gabu", "Gabu", "anniversary", "2026-06-10")]}
      />,
    );

    expect(screen.getByRole("listitem")).toHaveTextContent("6/10");
    expect(screen.getByRole("listitem")).toHaveTextContent("出道週年");
    expect(screen.getByRole("listitem")).not.toHaveTextContent(/天/);
  });
});
