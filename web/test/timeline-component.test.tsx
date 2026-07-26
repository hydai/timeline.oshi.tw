import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Timeline from "@/app/components/Timeline";
import type { TimelineItem } from "@/lib/types";

const channel = { name: "水樹", handle: null, avatar: null, group: "G", nationality: "TW", youtube_subs: 1, twvtuber_id: "t" };
const now = Date.parse("2026-07-21T12:00:00Z");

const items: TimelineItem[] = [
  { kind: "live", sortAt: 0, channel, stream: { videoId: "L", channelId: "c", title: "live t", thumbnail: null, url: "u" } },
  { kind: "milestone", sortAt: 0, channel, milestone: { channelId: "c", type: "anniversary", date: "2026-07-24" } },
];

describe("Timeline", () => {
  it("renders a card per item", () => {
    render(<Timeline items={items} nowMs={now} />);
    expect(screen.getByText("live t")).toBeInTheDocument();
    expect(screen.getByText(/週年/)).toBeInTheDocument();
  });
  it("shows empty state when there are no items", () => {
    render(<Timeline items={[]} nowMs={now} />);
    expect(screen.getByText(/沒有符合的直播動態/)).toBeInTheDocument();
  });
  it("renders a section header per zone (live, upcoming, past)", () => {
    const spanning: TimelineItem[] = [
      { kind: "live", sortAt: 0, channel, stream: { videoId: "L", channelId: "c", title: "live t", thumbnail: null, url: "u" } },
      { kind: "upcoming", sortAt: 0, channel, stream: { videoId: "U", channelId: "c", title: "up t", thumbnail: null, url: "u2" } },
      { kind: "milestone", sortAt: 0, channel, milestone: { channelId: "c", type: "anniversary", date: "2026-07-24" } },
    ];
    render(<Timeline items={spanning} nowMs={now} />);
    expect(screen.getByText("🔴 正在直播")).toBeInTheDocument();
    expect(screen.getByText("📅 預定開台")).toBeInTheDocument();
    expect(screen.getByText("⏮️ 近期動態")).toBeInTheDocument();
  });
  it("renders exactly one section header for a zone with multiple items (not one per item)", () => {
    const spanning: TimelineItem[] = [
      { kind: "live", sortAt: 0, channel, stream: { videoId: "L", channelId: "c", title: "live t", thumbnail: null, url: "u" } },
      { kind: "recent", sortAt: 0, channel, stream: { videoId: "R1", channelId: "c", title: "recent one", thumbnail: null, url: "u3" } },
      { kind: "recent", sortAt: -1, channel, stream: { videoId: "R2", channelId: "c", title: "recent two", thumbnail: null, url: "u4" } },
      { kind: "upcoming", sortAt: 0, channel, stream: { videoId: "U", channelId: "c", title: "up t", thumbnail: null, url: "u2" } },
    ];
    render(<Timeline items={spanning} nowMs={now} />);
    // Two "recent" items share the "past" zone; the header must appear once at the
    // zone transition, not once per item. getByText throws on 2+ matches.
    expect(screen.getByText("⏮️ 近期動態")).toBeInTheDocument();
    expect(screen.getAllByText("⏮️ 近期動態")).toHaveLength(1);
    expect(screen.getByText("recent one")).toBeInTheDocument();
    expect(screen.getByText("recent two")).toBeInTheDocument();
    expect(screen.getByText("🔴 正在直播")).toBeInTheDocument();
    expect(screen.getByText("📅 預定開台")).toBeInTheDocument();
  });

  it("keeps React keys unique when a video appears in more than one status", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const repeatedVideo: TimelineItem[] = [
      {
        kind: "live",
        sortAt: 1,
        channel,
        stream: { videoId: "same", channelId: "c", title: "live copy", thumbnail: null, url: "u" },
      },
      {
        kind: "recent",
        sortAt: 0,
        channel,
        stream: { videoId: "same", channelId: "c", title: "recent copy", thumbnail: null, url: "u" },
      },
    ];

    try {
      render(<Timeline items={repeatedVideo} nowMs={now} />);
      expect(screen.getByText("live copy")).toBeInTheDocument();
      expect(screen.getByText("recent copy")).toBeInTheDocument();
      expect(consoleError.mock.calls.flat().join(" ")).not.toContain("same key");
    } finally {
      consoleError.mockRestore();
    }
  });
});
