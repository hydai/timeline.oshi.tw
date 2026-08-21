import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import type { Snapshot } from "@/lib/types";
import fixture from "./fixtures/snapshot.json";

afterEach(() => vi.restoreAllMocks());

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
  upcoming: [],
  recent: [
    {
      videoId: "video-mizuki",
      channelId: "channel-mizuki",
      title: "水樹的直播",
      thumbnail: null,
      url: "https://example.com/mizuki",
      actualEnd: "2026-07-21T18:00:00Z",
    },
    {
      videoId: "video-gabu",
      channelId: "channel-gabu",
      title: "Gabu 的直播",
      thumbnail: null,
      url: "https://example.com/gabu",
      actualEnd: "2026-07-21T17:00:00Z",
    },
  ],
  milestones: [],
} satisfies Snapshot;

const typeFilterFixture = {
  ...filterFixture,
  live: [{
    videoId: "video-live",
    channelId: "channel-mizuki",
    title: "現在正在直播",
    thumbnail: null,
    url: "https://example.com/live",
    actualStart: "2026-07-21T19:00:00Z",
  }],
  upcoming: [{
    videoId: "video-upcoming",
    channelId: "channel-gabu",
    title: "稍後預定直播",
    thumbnail: null,
    url: "https://example.com/upcoming",
    scheduledStart: "2026-07-22T12:00:00Z",
  }],
  recent: [{
    videoId: "video-completed",
    channelId: "channel-mizuki",
    title: "已完成的直播",
    thumbnail: null,
    url: "https://example.com/completed",
    actualEnd: "2026-07-21T18:00:00Z",
  }],
  milestones: [{
    channelId: "channel-gabu",
    type: "anniversary",
    date: "2026-07-24",
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

    await waitFor(() => expect(screen.getByRole("button", { name: "水樹" })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /水樹的直播/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gabu 的直播/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "水樹" }));

    expect(screen.getByRole("link", { name: /水樹的直播/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Gabu 的直播/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "水樹" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "全部" }));

    expect(screen.getByRole("link", { name: /水樹的直播/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gabu 的直播/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true");
  });

  it("filters by company, narrows VTuber choices, and clears an incompatible VTuber selection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(filterFixture), { status: 200 })),
    );
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: "子午計畫" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "子午計畫" }));

    expect(screen.getByRole("link", { name: /水樹的直播/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Gabu 的直播/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "水樹" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gabu" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "水樹" }));
    expect(screen.getByRole("button", { name: "水樹" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "子午計畫" }));
    expect(screen.getByRole("button", { name: "水樹" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "個人勢" }));

    expect(screen.queryByRole("link", { name: /水樹的直播/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gabu 的直播/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gabu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "全部團體" }));
    expect(screen.getByRole("link", { name: /水樹的直播/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gabu 的直播/ })).toBeInTheDocument();
  });

  it("quickly filters the river by content type and restores it with 全部類型", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(typeFilterFixture), { status: 200 })),
    );
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: "正在直播" })).toBeInTheDocument());
    expect(screen.getByText("現在正在直播")).toBeInTheDocument();
    expect(screen.getByText("稍後預定直播")).toBeInTheDocument();
    expect(screen.getByText("已完成的直播")).toBeInTheDocument();
    expect(screen.getByText("週年 · 2026-07-24")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "正在直播" }));
    expect(screen.getByText("現在正在直播")).toBeInTheDocument();
    expect(screen.queryByText("稍後預定直播")).not.toBeInTheDocument();
    expect(screen.queryByText("已完成的直播")).not.toBeInTheDocument();
    expect(screen.queryByText("週年 · 2026-07-24")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "重要里程碑" }));
    expect(screen.queryByText("現在正在直播")).not.toBeInTheDocument();
    expect(screen.getByText("週年 · 2026-07-24")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "全部類型" }));
    expect(screen.getByText("現在正在直播")).toBeInTheDocument();
    expect(screen.getByText("稍後預定直播")).toBeInTheDocument();
    expect(screen.getByText("已完成的直播")).toBeInTheDocument();
    expect(screen.getByText("週年 · 2026-07-24")).toBeInTheDocument();
  });

  it("lazy-loads permanent history one month at a time after choosing completed streams", async () => {
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
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
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
    }));
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: "已完成直播" })).toHaveTextContent("2"));
    await userEvent.click(screen.getByRole("button", { name: "已完成直播" }));

    await waitFor(() => expect(screen.getByText("七月封存直播")).toBeInTheDocument());
    expect(screen.queryByText("六月封存直播")).not.toBeInTheDocument();
    expect(screen.getByText(/已載入 1 \/ 2 筆歷史封存/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "載入更早紀錄" }));

    await waitFor(() => expect(screen.getByText("六月封存直播")).toBeInTheDocument());
    expect(screen.getByText("已載入全部永久紀錄。")).toBeInTheDocument();
  });
});
