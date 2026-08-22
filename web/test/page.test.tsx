import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import type { Snapshot } from "@/lib/types";
import { taipeiDayKey } from "@/lib/time";
import fixture from "./fixtures/snapshot.json";

afterEach(() => vi.restoreAllMocks());

const HOUR = 3_600_000;
/** ISO timestamp offset from the real clock, so fixtures always land on today's rail. */
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
/**
 * A fixed instant inside today's Taipei day (10:00). A plain "two hours ago" would
 * slide into yesterday whenever the suite runs just after midnight, and the forward
 * rail drops finished streams from previous days.
 */
const todayTaipei = () => `${taipeiDayKey(new Date().toISOString())}T02:00:00Z`;

const filterFixture = {
  version: "1.0.0",
  generated_at: "2026-07-21T18:40:41.302Z",
  heavy_refreshed_at: "2026-07-21T18:40:41.302Z",
  channels: {
    "channel-mizuki": {
      name: "水樹",
      handle: "@mizuki",
      avatar: null,
      group: "子午計畫",
      nationality: "TW",
      youtube_subs: 1,
      twvtuber_id: "mizuki",
    },
    "channel-gabu": {
      name: "Gabu",
      handle: "@gabu",
      avatar: null,
      group: null,
      nationality: "TW",
      youtube_subs: 1,
      twvtuber_id: "gabu",
    },
  },
  groups: ["子午計畫"],
  live: [],
  upcoming: [
    {
      videoId: "video-mizuki",
      channelId: "channel-mizuki",
      title: "水樹的直播",
      thumbnail: null,
      url: "https://example.com/mizuki",
      scheduledStart: at(3 * HOUR),
    },
    {
      videoId: "video-gabu",
      channelId: "channel-gabu",
      title: "Gabu 的直播",
      thumbnail: null,
      url: "https://example.com/gabu",
      scheduledStart: at(4 * HOUR),
    },
  ],
  recent: [],
  milestones: [],
} satisfies Snapshot;

/** Three days out, so it stays on the forward rail rather than falling into history. */
const FUTURE_MILESTONE_DATE = at(3 * 24 * HOUR).slice(0, 10);

const typeFilterFixture = {
  ...filterFixture,
  live: [{
    videoId: "video-live",
    channelId: "channel-mizuki",
    title: "現在正在直播",
    thumbnail: null,
    url: "https://example.com/live",
    actualStart: at(-HOUR),
  }],
  upcoming: [{
    videoId: "video-upcoming",
    channelId: "channel-gabu",
    title: "稍後預定直播",
    thumbnail: null,
    url: "https://example.com/upcoming",
    scheduledStart: at(3 * HOUR),
  }],
  recent: [{
    videoId: "video-completed",
    channelId: "channel-mizuki",
    title: "已完成的直播",
    thumbnail: null,
    url: "https://example.com/completed",
    actualStart: todayTaipei(),
    actualEnd: todayTaipei(),
  }],
  milestones: [{
    channelId: "channel-gabu",
    type: "anniversary",
    date: FUTURE_MILESTONE_DATE,
  }],
} satisfies Snapshot;

describe("Home page", () => {
  it("shows loading, then loads the snapshot and renders the river + controls", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 })));
    render(<Home />);
    expect(screen.getByText("載入中…")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("搜尋 VTuber")).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByRole("link").length).toBeGreaterThan(0));
  });

  it("shows an error state when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    render(<Home />);
    await waitFor(() => expect(screen.getByText(/載入失敗/)).toBeInTheDocument());
  });

  it("retries after an error and loads the river", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    render(<Home />);
    await waitFor(() => expect(screen.getByText(/載入失敗/)).toBeInTheDocument());
    const retryButton = screen.getByRole("button", { name: "重試" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 })));
    await userEvent.click(retryButton);

    await waitFor(() => expect(screen.getByLabelText("搜尋 VTuber")).toBeInTheDocument());
  });

  it("filters the river by search query", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 })));
    render(<Home />);
    await waitFor(() => expect(screen.getByLabelText("搜尋 VTuber")).toBeInTheDocument());
    const before = screen.getAllByRole("link").length;
    await userEvent.type(screen.getByLabelText("搜尋 VTuber"), "zzzznotarealname");
    await waitFor(() => expect(screen.queryByText(/沒有符合的直播動態/)).toBeInTheDocument());
    expect(screen.queryAllByRole("link").length).toBeLessThan(before);
  });

  it("filters the river by VTuber and restores every channel with 全部", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(filterFixture), { status: 200 })),
    );
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: "VTuber 篩選" })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /水樹的直播/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gabu 的直播/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "VTuber 篩選" }));
    await userEvent.click(screen.getByRole("button", { name: "水樹" }));

    expect(screen.getByRole("link", { name: /水樹的直播/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Gabu 的直播/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "VTuber 篩選" })).toHaveTextContent("水樹");

    await userEvent.click(screen.getByRole("button", { name: "VTuber 篩選" }));
    await userEvent.click(screen.getByRole("button", { name: "全部" }));

    expect(screen.getByRole("link", { name: /水樹的直播/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gabu 的直播/ })).toBeInTheDocument();
  });

  it("filters by company, narrows VTuber choices, and clears an incompatible VTuber selection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(filterFixture), { status: 200 })),
    );
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: "所屬團體篩選" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "所屬團體篩選" }));
    await userEvent.click(screen.getByRole("button", { name: "子午計畫" }));

    expect(screen.getByRole("link", { name: /水樹的直播/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Gabu 的直播/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "VTuber 篩選" }));
    expect(screen.getByRole("button", { name: "水樹" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gabu" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "水樹" }));
    expect(screen.getByRole("button", { name: "VTuber 篩選" })).toHaveTextContent("水樹");

    // Re-picking the same company must not disturb the channel selection.
    await userEvent.click(screen.getByRole("button", { name: "所屬團體篩選" }));
    await userEvent.click(screen.getByRole("button", { name: "子午計畫" }));
    expect(screen.getByRole("button", { name: "VTuber 篩選" })).toHaveTextContent("水樹");

    await userEvent.click(screen.getByRole("button", { name: "所屬團體篩選" }));
    await userEvent.click(screen.getByRole("button", { name: "個人勢" }));

    expect(screen.queryByRole("link", { name: /水樹的直播/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gabu 的直播/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "VTuber 篩選" })).toHaveTextContent("VTuber");

    await userEvent.click(screen.getByRole("button", { name: "所屬團體篩選" }));
    await userEvent.click(screen.getByRole("button", { name: "全部團體" }));
    expect(screen.getByRole("link", { name: /水樹的直播/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gabu 的直播/ })).toBeInTheDocument();
  });

  it("opens with today forward: live, upcoming and future milestones, finished streams folded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(typeFilterFixture), { status: 200 })),
    );
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: "正在直播" })).toBeInTheDocument());
    expect(screen.getByText("現在正在直播")).toBeInTheDocument();
    expect(screen.getByText("稍後預定直播")).toBeInTheDocument();
    expect(screen.getByText(`週年 · ${FUTURE_MILESTONE_DATE}`)).toBeInTheDocument();
    // Already over today, so it sits behind the fold rather than in the rail.
    expect(screen.queryByText("已完成的直播")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /今天稍早/ })).toHaveTextContent("1 場已結束");
  });

  it("reveals today's finished streams when the fold row is opened", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(typeFilterFixture), { status: 200 })),
    );
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: /今天稍早/ })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /今天稍早/ }));

    expect(screen.getByText("已完成的直播")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已完成直播" })).toHaveAttribute("aria-pressed", "true");
  });

  it("quickly filters the river by content type and restores it with 全部類型", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(typeFilterFixture), { status: 200 })),
    );
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: "正在直播" })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "正在直播" }));
    expect(screen.getByText("現在正在直播")).toBeInTheDocument();
    expect(screen.queryByText("稍後預定直播")).not.toBeInTheDocument();
    expect(screen.queryByText(`週年 · ${FUTURE_MILESTONE_DATE}`)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "重要里程碑" }));
    expect(screen.queryByText("現在正在直播")).not.toBeInTheDocument();
    expect(screen.getByText(`週年 · ${FUTURE_MILESTONE_DATE}`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "已完成直播" }));
    expect(screen.getByText("已完成的直播")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "全部類型" }));
    expect(screen.getByText("現在正在直播")).toBeInTheDocument();
    expect(screen.getByText("稍後預定直播")).toBeInTheDocument();
    expect(screen.getByText(`週年 · ${FUTURE_MILESTONE_DATE}`)).toBeInTheDocument();
  });

  const archiveMonth = (month: string, videoId: string, title: string, actualEnd: string) => ({
    version: "1.0.0",
    generated_at: "2026-07-21T19:00:00Z",
    month,
    channels: typeFilterFixture.channels,
    streams: [{
      videoId,
      channelId: "channel-mizuki",
      title,
      thumbnail: null,
      url: `https://example.com/${videoId}`,
      actualEnd,
    }],
    milestones: [],
  });

  /** Two archived months, so "one month at a time" is observable. */
  function stubArchive() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/archive/index.json")) {
        return new Response(JSON.stringify({
          version: "1.0.0",
          generated_at: "2026-07-21T19:00:00Z",
          months: [
            { month: "2026-07", streams: 1, milestones: 0 },
            { month: "2026-06", streams: 1, milestones: 0 },
          ],
        }), { status: 200 });
      }
      if (url.endsWith("/archive/2026-07.json")) {
        return new Response(JSON.stringify(archiveMonth(
          "2026-07", "archive-july", "七月封存直播", "2026-07-10T10:00:00Z",
        )), { status: 200 });
      }
      if (url.endsWith("/archive/2026-06.json")) {
        return new Response(JSON.stringify(archiveMonth(
          "2026-06", "archive-june", "六月封存直播", "2026-06-10T10:00:00Z",
        )), { status: 200 });
      }
      return new Response(JSON.stringify(typeFilterFixture), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const monthRequests = (fetchMock: ReturnType<typeof stubArchive>, month: string) =>
    fetchMock.mock.calls.filter(([input]) => String(input).endsWith(`/archive/${month}.json`)).length;

  it("opens completed history at the newest archived month, and loads only that month", async () => {
    const fetchMock = stubArchive();
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: "已完成直播" })).toHaveTextContent("2"));
    await userEvent.click(screen.getByRole("button", { name: "已完成直播" }));

    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "2026 年 7 月" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("六月封存直播")).not.toBeInTheDocument();
    expect(monthRequests(fetchMock, "2026-06")).toBe(0);
  });

  it("shows the chosen month alone, so the rail never grows past one month", async () => {
    stubArchive();
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: "已完成直播" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "已完成直播" }));
    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());
    // This month's finished stream comes from the snapshot, not the archive — a month
    // view that quietly kept it would not be one month.
    expect(screen.queryByText("已完成的直播")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "2026 年 6 月" }));

    await waitFor(() => expect(screen.getByText("六月封存直播")).toBeInTheDocument());
    expect(screen.queryByText("七月封存直播")).not.toBeInTheDocument();
  });

  it("carries on into the previous month from the end of the rail", async () => {
    stubArchive();
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: "已完成直播" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "已完成直播" }));
    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "看更早的 2026 年 6 月" }));

    await waitFor(() => expect(screen.getByText("六月封存直播")).toBeInTheDocument());
  });

  it("counts a milestone that has not happened yet, without going looking for its month", async () => {
    // The archive stops at what has passed; upcoming anniversaries arrive on the
    // snapshot. Both land on the rail, so a month cell that counted only the archive
    // would promise fewer than it opens — and its month has no file to fetch.
    const fetchMock = stubArchive();
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: "重要里程碑" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "重要里程碑" }));

    const month = FUTURE_MILESTONE_DATE.slice(0, 7);
    const label = `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月`;
    await waitFor(() => expect(screen.getByRole("button", { name: label })).toHaveTextContent("1 筆"));
    expect(screen.getByText(`週年 · ${FUTURE_MILESTONE_DATE}`)).toBeInTheDocument();
    expect(screen.queryByText("載入失敗")).not.toBeInTheDocument();
    expect(monthRequests(fetchMock, month)).toBe(0);
  });

  it("clears a month's failure once a month that does load is chosen", async () => {
    const fetchMock = stubArchive();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/archive/index.json")) {
        return new Response(JSON.stringify({
          version: "1.0.0",
          generated_at: "2026-07-21T19:00:00Z",
          months: [
            { month: "2026-07", streams: 1, milestones: 0 },
            { month: "2026-06", streams: 1, milestones: 0 },
          ],
        }), { status: 200 });
      }
      if (url.endsWith("/archive/2026-07.json")) {
        return new Response(JSON.stringify(archiveMonth(
          "2026-07", "archive-july", "七月封存直播", "2026-07-10T10:00:00Z",
        )), { status: 200 });
      }
      if (url.endsWith("/archive/2026-06.json")) return new Response("nope", { status: 500 });
      return new Response(JSON.stringify(typeFilterFixture), { status: 200 });
    });
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: "已完成直播" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "已完成直播" }));
    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "2026 年 6 月" }));
    await waitFor(() => expect(screen.getByText("載入失敗")).toBeInTheDocument());

    // July is already in hand, so nothing fetches — and nothing would clear the failure.
    await userEvent.click(screen.getByRole("button", { name: "2026 年 7 月" }));

    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());
    expect(screen.queryByText("載入失敗")).not.toBeInTheDocument();
  });

  it("keeps a month it has already read, so stepping back and forth is free", async () => {
    const fetchMock = stubArchive();
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: "已完成直播" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "已完成直播" }));
    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "更早的月份" }));
    await waitFor(() => expect(screen.getByText("六月封存直播")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "更新的月份" }));
    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());

    expect(monthRequests(fetchMock, "2026-07")).toBe(1);
  });
});
