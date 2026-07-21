import { describe, it, expect } from "vitest";
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
});
