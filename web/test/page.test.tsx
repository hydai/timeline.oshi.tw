import "./next-navigation";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import type { Snapshot } from "@/lib/types";
import { taipeiDayKey } from "@/lib/time";
import fixture from "./fixtures/snapshot.json";
import { channelProfiles } from "@/lib/channel-aliases";

beforeEach(() => localStorage.clear());
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

  it("shows current activity and expanded history together in all types", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(typeFilterFixture), { status: 200 })),
    );
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: "正在直播" })).toBeInTheDocument());
    expect(screen.getByText("現在正在直播")).toBeInTheDocument();
    expect(screen.getByText("稍後預定直播")).toBeInTheDocument();
    expect(screen.getByText(`週年 · ${FUTURE_MILESTONE_DATE}`)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("已完成的直播")).toBeInTheDocument());
    expect(screen.getByRole("region", { name: /直播與預定活動/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /今天稍早/ })).not.toBeInTheDocument();
  });

  it("loads archive history even when recent snapshot streams already match the selected channel", async () => {
    const fetchMock = stubArchive({ ...typeFilterFixture, live: [], upcoming: [], milestones: [] });
    window.history.replaceState(null, "", "/?channel=channel-mizuki");
    render(<Home />);

    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());
    expect(monthRequests(fetchMock, "2026-07")).toBe(1);
    expect(screen.getByRole("button", { name: "全部類型" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /場已結束/ })).not.toBeInTheDocument();
    expect(screen.queryByText("目前沒有人開台")).not.toBeInTheDocument();
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

  const archiveMonth = (
    month: string,
    videoId: string,
    title: string,
    actualEnd: string,
    channelId = "channel-mizuki",
  ) => ({
    version: "1.0.0",
    generated_at: "2026-07-21T19:00:00Z",
    month,
    channels: typeFilterFixture.channels,
    streams: [{
      videoId,
      channelId,
      title,
      thumbnail: null,
      url: `https://example.com/${videoId}`,
      actualEnd,
    }],
    milestones: [],
  });

  /** Two archived months, so "one month at a time" is observable. */
  function stubArchive(snapshot: Snapshot = typeFilterFixture) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/archive/index.json")) {
        return new Response(JSON.stringify({
          version: "1.0.0",
          generated_at: "2026-07-21T19:00:00Z",
          facets: "channel",
          months: [
            {
              month: "2026-07", streams: 1, milestones: 0,
              by_channel: { "channel-mizuki": { streams: 1, milestones: 0 } },
            },
            {
              month: "2026-06", streams: 1, milestones: 0,
              by_channel: { "channel-gabu": { streams: 1, milestones: 0 } },
            },
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
          "2026-06", "archive-june", "六月封存直播", "2026-06-10T10:00:00Z", "channel-gabu",
        )), { status: 200 });
      }
      return new Response(JSON.stringify(snapshot), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const monthRequests = (fetchMock: ReturnType<typeof stubArchive>, month: string) =>
    fetchMock.mock.calls.filter(([input]) => String(input).endsWith(`/archive/${month}.json`)).length;

  it("restores the shared month from persistent cache after the entire page remounts", async () => {
    const fetchMock = stubArchive();
    window.history.replaceState(null, "", "/?channel=channel-gabu&month=2026-06");
    const firstPage = render(<Home />);
    await waitFor(() => expect(screen.getByText("六月封存直播")).toBeInTheDocument());
    firstPage.unmount();
    fetchMock.mockClear();

    render(<Home />);
    await waitFor(() => expect(screen.getByText("六月封存直播")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "全部類型" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "VTuber 篩選" })).toHaveTextContent("Gabu");
    expect(screen.queryByText("七月封存直播")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows cached activity while revalidating, then updates it without a loading screen", async () => {
    const fetchMock = stubArchive();
    window.history.replaceState(null, "", "/?type=upcoming");
    const firstPage = render(<Home />);
    await waitFor(() => expect(screen.getByText("稍後預定直播")).toBeInTheDocument());
    firstPage.unmount();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61_000);
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));

    render(<Home />);
    await waitFor(() => expect(screen.getByText("稍後預定直播")).toBeInTheDocument());
    expect(screen.queryByText("載入中…")).not.toBeInTheDocument();
    await act(async () => finish(new Response(JSON.stringify({
      ...typeFilterFixture,
      upcoming: [{ ...typeFilterFixture.upcoming[0], title: "更新後的預定直播" }],
    }))));
    await waitFor(() => expect(screen.getByText("更新後的預定直播")).toBeInTheDocument());
    expect(screen.queryByText("稍後預定直播")).not.toBeInTheDocument();
  });

  it("keeps stale history visible after a background failure and replaces it on retry", async () => {
    const fetchMock = stubArchive();
    const originalFetch = fetchMock.getMockImplementation()!;
    const firstPage = render(<Home />);
    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());
    firstPage.unmount();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61 * 60_000);
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation((input) => String(input).endsWith("/archive/2026-07.json")
      ? new Promise((resolve) => { finish = resolve; }) : originalFetch(input));

    render(<Home />);
    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());
    expect(screen.queryByText("正在讀取歷史紀錄…")).not.toBeInTheDocument();
    await act(async () => finish(new Response("failed", { status: 503 })));
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入這個月" })).toBeInTheDocument());
    expect(screen.getByText("七月封存直播")).toBeInTheDocument();
    expect(screen.queryByText("歷史紀錄暫時無法載入，請稍後重試。")).not.toBeInTheDocument();

    fetchMock.mockImplementation(async (input) => String(input).endsWith("/archive/2026-07.json")
      ? new Response(JSON.stringify(archiveMonth("2026-07", "corrected", "更正後的封存直播", "2026-07-10T10:00:00Z")))
      : originalFetch(input));
    await userEvent.click(screen.getByRole("button", { name: "重新載入這個月" }));
    await waitFor(() => expect(screen.getByText("更正後的封存直播")).toBeInTheDocument());
    expect(screen.queryByText("七月封存直播")).not.toBeInTheDocument();
  });

  it("opens a channel's latest history in all types when it has no current activity", async () => {
    const fetchMock = stubArchive({ ...typeFilterFixture, upcoming: [], milestones: [] });
    render(<Home />);
    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());
    expect(screen.getByText("現在正在直播")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "VTuber 篩選" }));
    await userEvent.click(screen.getByRole("button", { name: "Gabu" }));

    await waitFor(() => expect(screen.getByText("六月封存直播")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "全部類型" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("region", { name: "歷史封存" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "歷史紀錄2026 年 6 月" })).toBeInTheDocument();
    expect(screen.queryByText("目前沒有符合的直播動態")).not.toBeInTheDocument();
    expect(screen.queryByText("現在正在直播")).not.toBeInTheDocument();
    expect(monthRequests(fetchMock, "2026-07")).toBe(1);
    expect(window.location.search).not.toContain("type=");
  });

  it("navigates, shares, and restores months without changing the all-types filter", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const fetchMock = stubArchive({ ...filterFixture, upcoming: [] });
    render(<Home />);
    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());
    expect(monthRequests(fetchMock, "2026-06")).toBe(0);

    await user.click(screen.getByRole("button", { name: "分享目前篩選" }));
    expect(write).toHaveBeenLastCalledWith(`${window.location.origin}/?month=2026-07`);
    await user.click(screen.getByRole("button", { name: "看更早的 2026 年 6 月" }));
    await waitFor(() => expect(screen.getByText("六月封存直播")).toBeInTheDocument());
    expect(screen.queryByText("七月封存直播")).not.toBeInTheDocument();
    expect(window.location.search).toBe("?month=2026-06");
    expect(screen.getByRole("button", { name: "全部類型" })).toHaveAttribute("aria-pressed", "true");
    await act(async () => window.history.back());
    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());
    expect(monthRequests(fetchMock, "2026-07")).toBe(1);
  });

  it("opens an explicit all-types month even when current activity is available", async () => {
    const fetchMock = stubArchive();
    window.history.replaceState(null, "", "/?channel=channel-gabu&month=2026-06");
    render(<Home />);
    await waitFor(() => expect(screen.getByText("六月封存直播")).toBeInTheDocument());
    expect(screen.getByText("稍後預定直播")).toBeInTheDocument();
    expect(screen.getByText(`週年 · ${FUTURE_MILESTONE_DATE}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部類型" })).toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).toBe("?channel=channel-gabu&month=2026-06");
    expect(monthRequests(fetchMock, "2026-07")).toBe(0);

    await userEvent.click(screen.getByRole("button", { name: "預定直播" }));
    expect(screen.getByText("稍後預定直播")).toBeInTheDocument();
    expect(window.location.search).not.toContain("month=");
  });

  it("includes archived milestones when all types has no current activity", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith("/archive/index.json") ? {
        version: "1.0.0", generated_at: "2026-07-21T19:00:00Z", facets: "channel",
        months: [{ month: "2026-06", streams: 0, milestones: 1,
          by_channel: { "channel-gabu": { streams: 0, milestones: 1 } } }],
      } : url.endsWith("/archive/2026-06.json") ? {
        version: "1.0.0", month: "2026-06", channels: filterFixture.channels,
        streams: [], milestones: [{ channelId: "channel-gabu", type: "anniversary", date: "2026-06-10" }],
      } : { ...filterFixture, upcoming: [],
        // A past milestone is not visible on the forward rail either.
        milestones: [{ channelId: "channel-gabu", type: "anniversary", date: "2026-06-10" }],
      };
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    window.history.replaceState(null, "", "/?channel=channel-gabu");
    render(<Home />);
    await waitFor(() => expect(screen.getByText("週年 · 2026-06-10")).toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "歷史封存" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "歷史紀錄2026 年 6 月" })).toBeInTheDocument();
    expect(screen.queryByText("目前沒有符合的直播動態")).not.toBeInTheDocument();
  });

  it("shows loading and retry states instead of an empty result while all-types history loads", async () => {
    const fetchMock = stubArchive(filterFixture);
    const originalFetch = fetchMock.getMockImplementation()!;
    let releaseMonth!: (response: Response) => void;
    fetchMock.mockImplementation((input: RequestInfo | URL) => String(input).endsWith("/archive/2026-07.json")
      ? new Promise<Response>((resolve) => { releaseMonth = resolve; }) : originalFetch(input));
    render(<Home />);
    await waitFor(() => expect(monthRequests(fetchMock, "2026-07")).toBe(1));
    expect(screen.getByText("正在讀取歷史紀錄…")).toBeInTheDocument();
    expect(screen.getByText("水樹的直播")).toBeInTheDocument();
    expect(screen.queryByText("目前沒有符合的直播動態")).not.toBeInTheDocument();

    await act(async () => releaseMonth(new Response("failed", { status: 500 })));
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入這個月" })).toBeInTheDocument());
    expect(screen.getByText("水樹的直播")).toBeInTheDocument();
    expect(screen.queryByText("目前沒有符合的直播動態")).not.toBeInTheDocument();
    fetchMock.mockImplementation(originalFetch);
    await userEvent.click(screen.getByRole("button", { name: "重新載入這個月" }));
    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());
  });

  it("keeps live activity visible while navigating history and does not open a future milestone month", async () => {
    const futureMilestone = { channelId: "channel-mizuki", type: "anniversary" as const, date: "2099-01-01" };
    const fetchMock = stubArchive({ ...typeFilterFixture, milestones: [futureMilestone] });
    render(<Home />);
    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());
    expect(screen.getByText("現在正在直播")).toBeInTheDocument();
    expect(screen.getByText("週年 · 2099-01-01")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2099 年" })).not.toBeInTheDocument();
    expect(monthRequests(fetchMock, "2099-01")).toBe(0);
    const counts = screen.getByRole("region", { name: "依內容類型篩選" }).textContent;

    await userEvent.click(screen.getByRole("button", { name: "看更早的 2026 年 6 月" }));
    await waitFor(() => expect(screen.getByText("六月封存直播")).toBeInTheDocument());
    expect(screen.getByText("現在正在直播")).toBeInTheDocument();
    expect(screen.getByText("稍後預定直播")).toBeInTheDocument();
    expect(screen.queryByText("七月封存直播")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "依內容類型篩選" }).textContent).toBe(counts);
    expect(screen.getByRole("button", { name: "全部類型" })).toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).toBe("?month=2026-06");
  });

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

  it("scopes type badges and archive month totals to the selected VTuber", async () => {
    stubArchive();
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: "VTuber 篩選" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "VTuber 篩選" }));
    await userEvent.click(screen.getByRole("button", { name: "水樹" }));

    expect(screen.getByRole("button", { name: "正在直播" })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "預定直播" })).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: "已完成直播" })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "重要里程碑" })).toHaveTextContent("0");

    await userEvent.click(screen.getByRole("button", { name: "已完成直播" }));

    await waitFor(() => expect(screen.getByText(/^共 1 場/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "2026 年 7 月" })).toHaveTextContent("1 場");
    expect(screen.getByRole("button", { name: "2026 年 6 月" })).toBeDisabled();
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

  it("opens a shared channel and month without fetching or resetting to the latest month", async () => {
    const fetchMock = stubArchive();
    window.history.replaceState(null, "", "/?channel=channel-gabu&type=recent&month=2026-06");
    render(<Home />);

    await waitFor(() => expect(screen.getByText("六月封存直播")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "VTuber 篩選" })).toHaveTextContent("Gabu");
    expect(monthRequests(fetchMock, "2026-07")).toBe(0);
    expect(window.location.search).toContain("month=2026-06");
  });

  it("restores a previous and next month through browser history", async () => {
    stubArchive();
    window.history.replaceState(null, "", "/?type=recent&month=2026-07");
    render(<Home />);
    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "2026 年 6 月" }));
    await waitFor(() => expect(screen.getByText("六月封存直播")).toBeInTheDocument());
    await act(async () => window.history.back());
    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());
    await act(async () => window.history.forward());
    await waitFor(() => expect(screen.getByText("六月封存直播")).toBeInTheDocument());
  });

  it("explains a missing or invalid requested month without substituting another month", async () => {
    const fetchMock = stubArchive();
    window.history.replaceState(null, "", "/?channel=channel-mizuki&type=recent&month=2026-06");
    render(<Home />);
    await waitFor(() => expect(screen.getByText("2026 年 6 月 沒有符合篩選的封存。")).toBeInTheDocument());
    expect(monthRequests(fetchMock, "2026-06")).toBe(0);
    expect(monthRequests(fetchMock, "2026-07")).toBe(0);
    act(() => window.history.replaceState(null, "", "/?type=recent&month=2026-99"));
    expect(screen.getByText("連結中的月份格式無效，請重新選擇月份。")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "查看最新月份" }));
    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());
  });

  it("keeps an unknown channel selected and explains the invalid link", async () => {
    stubArchive();
    window.history.replaceState(null, "", "/?channel=unknown");
    render(<Home />);
    await waitFor(() => expect(screen.getByText(/找不到這個 VTuber/)).toBeInTheDocument());
    expect(screen.queryByText("稍後預定直播")).not.toBeInTheDocument();
    expect(window.location.search).toBe("?channel=unknown");
    await userEvent.click(screen.getByRole("button", { name: "查看全部 VTuber" }));
    expect(screen.getByText("稍後預定直播")).toBeInTheDocument();
  });

  it("pins the displayed archive month in a copied link and offers a clean channel link", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    stubArchive();
    window.history.replaceState(null, "", "/?channel=channel-mizuki&type=recent");
    render(<Home />);
    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "分享目前篩選" }));
    expect(write).toHaveBeenLastCalledWith(`${window.location.origin}/?channel=channel-mizuki&type=recent&month=2026-07`);
    await user.click(screen.getByRole("button", { name: "分享這位 VTuber" }));
    expect(write).toHaveBeenLastCalledWith(`${window.location.origin}/?channel=channel-mizuki`);
  });

  it("prioritizes an alias over a conflicting channel query and clears it when selecting all", async () => {
    const channelId = "UCjv4bfP_67WLuPheS-Z8Ekg";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ...filterFixture,
      channels: { ...filterFixture.channels, [channelId]: { ...filterFixture.channels["channel-mizuki"], ...channelProfiles[channelId] } },
      upcoming: [{ ...filterFixture.upcoming[0], channelId }, filterFixture.upcoming[1]],
    }), { status: 200 })));
    window.history.replaceState(null, "", "/v/mizuki?channel=channel-gabu&type=upcoming");
    render(<Home />);
    await waitFor(() => expect(screen.getByText("水樹的直播")).toBeInTheDocument());
    expect(screen.queryByText("Gabu 的直播")).not.toBeInTheDocument();
    expect(window.location.search).toBe("?type=upcoming");
    await userEvent.click(screen.getByRole("button", { name: "VTuber 篩選" }));
    await userEvent.click(screen.getByRole("button", { name: "全部" }));
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?type=upcoming");
    expect(screen.getByText("Gabu 的直播")).toBeInTheDocument();
  });

  it("updates search using replace and preserves spaces and unrelated query parameters", async () => {
    stubArchive();
    window.history.replaceState(null, "", "/?utm_source=campaign");
    render(<Home />);
    await waitFor(() => expect(screen.getByLabelText("搜尋 VTuber")).toBeInTheDocument());
    const length = window.history.length;
    await userEvent.type(screen.getByLabelText("搜尋 VTuber"), "Gabu ch");
    expect(screen.getByLabelText("搜尋 VTuber")).toHaveValue("Gabu ch");
    expect(new URLSearchParams(window.location.search).get("q")).toBe("Gabu ch");
    expect(new URLSearchParams(window.location.search).get("utm_source")).toBe("campaign");
    expect(window.history.length).toBe(length);
  });

  it("keeps a known channel visible even when it has no activity", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(
      String(input).endsWith("/archive/index.json")
        ? { version: "1.0.0", months: [] }
        : { ...filterFixture, upcoming: [] },
    ), { status: 200 })));
    window.history.replaceState(null, "", "/?channel=channel-mizuki");
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "VTuber 篩選" })).toHaveTextContent("水樹"));
    expect(screen.getByText("目前沒有符合的直播動態")).toBeInTheDocument();
    expect(screen.queryByText(/找不到這個 VTuber/)).not.toBeInTheDocument();
  });

  it("offers a selectable URL when clipboard access is denied", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    stubArchive();
    window.history.replaceState(null, "", "/?channel=channel-mizuki&type=upcoming");
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "分享這位 VTuber" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "分享這位 VTuber" }));
    expect(screen.getByLabelText("分享連結")).toHaveValue(`${window.location.origin}/?channel=channel-mizuki`);
    await user.click(screen.getByRole("button", { name: "全部類型" }));
    expect(screen.queryByLabelText("分享連結")).not.toBeInTheDocument();
  });
});
