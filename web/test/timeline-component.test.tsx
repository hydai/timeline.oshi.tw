import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Timeline from "@/app/components/Timeline";
import type { SnapshotChannel, TimelineItem } from "@/lib/types";

const channel: SnapshotChannel = {
  name: "水樹",
  handle: null,
  avatar: null,
  group: "子午計畫",
  nationality: "TW",
  youtube_subs: 1,
  twvtuber_id: "t",
};

// 2026-08-22T12:40:00Z === 8/22 20:40 in Taipei
const NOW = Date.parse("2026-08-22T12:40:00Z");

function stream(
  kind: "live" | "upcoming" | "recent",
  videoId: string,
  title: string,
  times: { actualStart?: string; scheduledStart?: string; actualEnd?: string },
): TimelineItem {
  return {
    kind,
    sortAt: 0,
    channel,
    stream: { videoId, channelId: "c", title, thumbnail: null, url: "https://example.com/" + videoId, ...times },
  } as TimelineItem;
}

const finishedToday = stream("recent", "done", "已經播完", {
  actualStart: "2026-08-22T05:00:00Z",
  actualEnd: "2026-08-22T06:00:00Z",
});
const liveNow = stream("live", "live", "正在直播", { actualStart: "2026-08-22T11:50:00Z" });
const laterToday = stream("upcoming", "later", "晚點開台", { scheduledStart: "2026-08-22T13:00:00Z" });
const nextWeek = stream("upcoming", "far", "下週開台", { scheduledStart: "2026-08-28T12:00:00Z" });

const noop = () => {};

describe("Timeline", () => {
  it("renders a day divider naming the Taipei day", () => {
    render(<Timeline items={[liveNow]} nowMs={NOW} mode="forward" onShowFinished={noop} />);

    expect(screen.getByText("今天")).toBeInTheDocument();
    expect(screen.getByText("8/22 週六")).toBeInTheDocument();
  });

  it("marks the present with a now row carrying the live count", () => {
    render(<Timeline items={[liveNow, laterToday]} nowMs={NOW} mode="forward" onShowFinished={noop} />);

    expect(screen.getByText("現在 20:40")).toBeInTheDocument();
    expect(screen.getByText("1 個頻道正在直播")).toBeInTheDocument();
  });

  it("says so when nobody is streaming", () => {
    render(<Timeline items={[laterToday]} nowMs={NOW} mode="forward" onShowFinished={noop} />);

    expect(screen.getByText("目前沒有人開台")).toBeInTheDocument();
  });

  it("puts the clock beside each item", () => {
    render(<Timeline items={[liveNow]} nowMs={NOW} mode="forward" onShowFinished={noop} />);

    expect(screen.getByText("19:50")).toBeInTheDocument();
  });

  it("marks a stream with no announced time as 待定, not as an all-day event", () => {
    const undated = stream("upcoming", "tbd", "時間未定", {});
    render(<Timeline items={[undated]} nowMs={NOW} mode="forward" onShowFinished={noop} />);

    expect(screen.getByText("待定")).toBeInTheDocument();
    expect(screen.queryByText("全天")).not.toBeInTheDocument();
  });

  it("folds streams that already finished today out of the rail", () => {
    render(<Timeline items={[finishedToday, liveNow]} nowMs={NOW} mode="forward" onShowFinished={noop} />);

    expect(screen.queryByText("已經播完")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /今天稍早/ })).toHaveTextContent("1 場已結束");
  });

  it("offers a way into the finished filter when every stream is from an earlier day", async () => {
    const onShowFinished = vi.fn();
    const older = stream("recent", "older", "上週的直播", {
      actualStart: "2026-08-20T05:00:00Z",
      actualEnd: "2026-08-20T06:00:00Z",
    });
    render(<Timeline items={[older]} nowMs={NOW} mode="forward" onShowFinished={onShowFinished} />);

    // Without this the rail would look empty while the 已完成 badge still counted them.
    expect(screen.queryByText(/沒有符合的直播動態/)).not.toBeInTheDocument();
    const fold = screen.getByRole("button", { name: /更早/ });
    expect(fold).toHaveTextContent("1 場已結束");

    await userEvent.click(fold);
    expect(onShowFinished).toHaveBeenCalledTimes(1);
  });

  it("asks for the finished filter when the fold row is opened", async () => {
    const onShowFinished = vi.fn();
    render(
      <Timeline items={[finishedToday, liveNow]} nowMs={NOW} mode="forward" onShowFinished={onShowFinished} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /今天稍早/ }));

    expect(onShowFinished).toHaveBeenCalledTimes(1);
  });

  it("collapses a run of empty days into one gap row", () => {
    render(<Timeline items={[laterToday, nextWeek]} nowMs={NOW} mode="forward" onShowFinished={noop} />);

    expect(screen.getByText("8/23 – 8/27")).toBeInTheDocument();
    expect(screen.getByText("5 天沒有安排")).toBeInTheDocument();
  });

  it("shows the empty state when nothing survives the filters", () => {
    render(<Timeline items={[]} nowMs={NOW} mode="forward" onShowFinished={noop} />);

    expect(screen.getByText(/沒有符合的直播動態/)).toBeInTheDocument();
    expect(screen.queryByText("現在 20:40")).not.toBeInTheDocument();
  });

  it("drops the now row in history mode, where the rail reads backwards", () => {
    render(<Timeline items={[finishedToday]} nowMs={NOW} mode="history" onShowFinished={noop} />);

    expect(screen.getByText("已經播完")).toBeInTheDocument();
    expect(screen.queryByText("現在 20:40")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /今天稍早/ })).not.toBeInTheDocument();
  });

  it("keeps React keys unique when a video appears in more than one status", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const repeated: TimelineItem[] = [
      stream("live", "same", "live copy", { actualStart: "2026-08-22T11:50:00Z" }),
      stream("recent", "same", "recent copy", {
        actualStart: "2026-08-22T05:00:00Z",
        actualEnd: "2026-08-22T06:00:00Z",
      }),
    ];

    try {
      render(<Timeline items={repeated} nowMs={NOW} mode="history" onShowFinished={noop} />);
      expect(consoleError.mock.calls.flat().join(" ")).not.toContain("same key");
    } finally {
      consoleError.mockRestore();
    }
  });
});
