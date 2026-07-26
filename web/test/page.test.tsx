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
});
