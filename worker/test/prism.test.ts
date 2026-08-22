import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  PRISM_MANIFEST_KEY,
  applyPrismGroups,
  normalizeGroupName,
  prismSnapshotKey,
  readPrismGroups,
} from "../src/prism";
import type { RosterEntry } from "../src/types";

function entry(youtubeId: string, name: string, group: string | null): RosterEntry {
  return { youtubeId, name, group, nationality: "TW", youtubeSubs: null, avatar: null, twvtuberId: "t-" + youtubeId };
}

const SHA = "a".repeat(64);

beforeEach(async () => {
  await env.DATA_PUBLIC.delete([PRISM_MANIFEST_KEY, prismSnapshotKey(SHA)]);
});

describe("normalizeGroupName", () => {
  it("folds stylised unicode back to plain letters", () => {
    // Prism ships this as mathematical-bold letters; they break search, sorting and
    // screen readers, and many fonts have no glyphs for them.
    expect(normalizeGroupName("𝖶𝖤𝖱𝖧𝖠𝖴𝖲 𝖬𝖴𝖲𝖨𝖢")).toBe("WERHAUS MUSIC");
  });
  it("trims but otherwise leaves ordinary names alone", () => {
    expect(normalizeGroupName("  春魚創意 ")).toBe("春魚創意");
  });
});

describe("applyPrismGroups", () => {
  it("lets prism rename a company", () => {
    const roster = new Map([["UCa", entry("UCa", "Earendel", "SquareLive")]]);
    const merged = applyPrismGroups(roster, new Map([["UCa", "春魚創意"]]));

    expect(merged.get("UCa")!.group).toBe("春魚創意");
  });

  it("never downgrades a channel we already have a company for", () => {
    // Prism has no affiliation on file for 銀河 Galaxy; twvtuber says 靛堂. Letting
    // prism's 個人勢 win would delete a whole company from the filter bar.
    const roster = new Map([["UCg", entry("UCg", "銀河 Galaxy", "靛堂")]]);
    const merged = applyPrismGroups(roster, new Map([["UCg", "個人勢"]]));

    expect(merged.get("UCg")!.group).toBe("靛堂");
  });

  it("keeps the better-cased existing name when both mean the same company", () => {
    const roster = new Map([["UCk", entry("UCk", "心咲", "Werhaus Music")]]);
    const merged = applyPrismGroups(roster, new Map([["UCk", "𝖶𝖤𝖱𝖧𝖠𝖴𝖲 𝖬𝖴𝖲𝖨𝖢"]]));

    expect(merged.get("UCk")!.group).toBe("Werhaus Music");
  });

  it("fills in a company prism knows and twvtuber does not", () => {
    const roster = new Map([["UCn", entry("UCn", "someone", null)]]);
    const merged = applyPrismGroups(roster, new Map([["UCn", "春魚創意"]]));

    expect(merged.get("UCn")!.group).toBe("春魚創意");
  });

  it("leaves channels prism has never heard of untouched", () => {
    const roster = new Map([["UCz", entry("UCz", "音魂ヒビク", "芥川組")]]);
    const merged = applyPrismGroups(roster, new Map());

    expect(merged.get("UCz")!.group).toBe("芥川組");
  });

  it("does not mutate the roster it was given", () => {
    const roster = new Map([["UCa", entry("UCa", "Earendel", "SquareLive")]]);
    applyPrismGroups(roster, new Map([["UCa", "春魚創意"]]));

    expect(roster.get("UCa")!.group).toBe("SquareLive");
  });
});

describe("readPrismGroups", () => {
  it("follows the manifest to the content-addressed snapshot", async () => {
    await env.DATA_PUBLIC.put(PRISM_MANIFEST_KEY, JSON.stringify({ schemaVersion: "1.0.0", sha256: SHA }));
    await env.DATA_PUBLIC.put(prismSnapshotKey(SHA), JSON.stringify({
      schemaVersion: "1.0.0",
      streamers: [
        { youtubeChannelId: "UCa", displayName: "Earendel", group: "春魚創意" },
        { youtubeChannelId: "UCb", displayName: "solo", group: "個人勢" },
        { youtubeChannelId: "UCc", displayName: "no group", group: null },
      ],
    }));

    const groups = await readPrismGroups(env.DATA_PUBLIC);

    expect(groups.get("UCa")).toBe("春魚創意");
    // 個人勢 and null carry no affiliation, so they are not overrides at all.
    expect(groups.has("UCb")).toBe(false);
    expect(groups.has("UCc")).toBe(false);
  });

  it("returns nothing when the manifest is missing, rather than wiping groups", async () => {
    expect((await readPrismGroups(env.DATA_PUBLIC)).size).toBe(0);
  });

  it("returns nothing when the snapshot the manifest points at is gone", async () => {
    await env.DATA_PUBLIC.put(PRISM_MANIFEST_KEY, JSON.stringify({ schemaVersion: "1.0.0", sha256: SHA }));

    expect((await readPrismGroups(env.DATA_PUBLIC)).size).toBe(0);
  });

  it("reads from the vod/ prefix, which prism owns and we only ever read", () => {
    expect(PRISM_MANIFEST_KEY).toBe("vod/v1/manifest.json");
    expect(prismSnapshotKey(SHA)).toBe(`vod/v1/snapshots/${SHA}.json`);
  });
});
