import { describe, it, expect } from "vitest";
import worker, { routeCron } from "../src/index";
import type { Env } from "../src/types";

describe("routeCron", () => {
  it("maps the heavy cron", () => expect(routeCron("0 0,6,12,18 * * *")).toBe("heavy"));
  it("maps the light cron", () => expect(routeCron("*/30 * * * *")).toBe("light"));
  it("ignores unknown crons", () => expect(routeCron("0 3 * * *")).toBe("none"));
});

describe("manual trigger auth", () => {
  const env = { MANUAL_TRIGGER_TOKEN: "secret" } as unknown as Env;

  it("rejects missing/wrong token with 403", async () => {
    const res = await worker.fetch(new Request("https://x/refresh", { method: "POST" }), env);
    expect(res.status).toBe(403);
  });

  it("rejects a backfill without a token too", async () => {
    const res = await worker.fetch(
      new Request("https://x/refresh?mode=backfill&channel=UCaaa", { method: "POST" }), env);
    expect(res.status).toBe(403);
  });

  it("refuses a backfill that names no channel", async () => {
    const res = await worker.fetch(
      new Request("https://x/refresh?mode=backfill", { method: "POST", headers: { "X-Trigger-Token": "secret" } }), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it("refuses a channel id that is not a channel id", async () => {
    const res = await worker.fetch(
      new Request("https://x/refresh?mode=backfill&channel=not-a-channel", {
        method: "POST", headers: { "X-Trigger-Token": "secret" },
      }), env);
    expect(res.status).toBe(400);
  });

  it("returns 404 for other paths", async () => {
    const res = await worker.fetch(new Request("https://x/other"), env);
    expect(res.status).toBe(404);
  });
});
