import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from "cloudflare:test";
import { upsertChannelId } from "../src/db";
import worker from "../src/index";
import { publishCurrentSnapshot } from "../src/refresh";
import { archiveMonthKey, ARCHIVE_INDEX_KEY, readArchiveIndex, readSnapshot, SNAPSHOT_KEY } from "../src/r2";
import { acquireTwitchLease, endTwitchStream, observeTwitchStream, releaseTwitchLease, setTwitchHistoryPermission } from "../src/twitch-db";
import { publishTwitchChanges } from "../src/twitch-publish";

const NOW = "2026-10-01T10:00:00.000Z";
const adminEnv = { ...env, MANUAL_TRIGGER_TOKEN: "test-token" };

function revoke() {
  return worker.fetch(new Request("https://worker.example/twitch/history", {
    method: "POST", headers: { "X-Trigger-Token": "test-token" },
    body: JSON.stringify({ userId: "42", granted: false, evidence: "Broadcaster withdrawal" }),
  }), adminEnv);
}

function pending() {
  return env.DB.prepare("SELECT value FROM twitch_state WHERE key='consent-publication-pending'").first<{ value: string }>();
}

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function expectUnpublished() {
  expect((await readSnapshot(env.DATA_PUBLIC))?.recent).toEqual([]);
  expect((await readArchiveIndex(env.DATA_PUBLIC))?.months).toEqual([]);
  for (const month of ["2026-09", "2026-10"]) {
    expect(await (await env.DATA_PUBLIC.get(archiveMonthKey(month)))!.json()).toMatchObject({ streams: [] });
  }
  expect(await pending()).toBeNull();
}

beforeEach(async () => {
  await env.DB.exec("DELETE FROM twitch_inbox; DELETE FROM twitch_state; DELETE FROM streams; DELETE FROM milestones; DELETE FROM channels;");
  await env.DATA_PUBLIC.delete([SNAPSHOT_KEY, ARCHIVE_INDEX_KEY, archiveMonthKey("2026-09"), archiveMonthKey("2026-10")]);
  await upsertChannelId(env.DB, "UCtest", NOW);
  await env.DB.prepare(`INSERT INTO twitch_accounts(channel_id,login,user_id,source,status,history_granted_at)
    VALUES('UCtest','example','42','both','verified',?1)`).bind(NOW).run();
  for (const [id, started_at, ended] of [
    ["123", "2026-09-01T09:00:00.000Z", "2026-09-01T10:00:00.000Z"],
    ["456", "2026-10-01T09:00:00.000Z", NOW],
  ] as const) {
    await observeTwitchStream(env.DB, { id, user_id: "42", user_login: "example", title: "開台雜談",
      game_id: "1", game_name: "Just Chatting", started_at, viewer_count: 12, thumbnail_url: "" }, started_at);
    await endTwitchStream(env.DB, "42", ended);
  }
  await publishCurrentSnapshot(env, new Map(), NOW, NOW, "full");
});

afterEach(() => vi.restoreAllMocks());

describe("Twitch consent publication", () => {
  it("waits for an in-flight stale snapshot and rewrites it before reporting success", async () => {
    const paused = signal();
    const resume = signal();
    const put = env.DATA_PUBLIC.put.bind(env.DATA_PUBLIC);
    vi.spyOn(env.DATA_PUBLIC, "put").mockImplementationOnce(async (...args) => {
      paused.resolve();
      await resume.promise;
      return put(...args);
    });
    const stalePublisher = publishCurrentSnapshot(env, new Map(), NOW, NOW);
    await paused.promise; // D1 rows have been read, but the old snapshot is not yet written.
    const response = revoke();
    try {
      await vi.waitFor(async () => {
        expect(await env.DB.prepare("SELECT status FROM twitch_accounts WHERE user_id='42'").first()).toEqual({ status: "disabled" });
      });
    } finally { resume.resolve(); }
    await stalePublisher;
    expect((await response).status).toBe(200);
    await expectUnpublished();
  });

  it("returns 503 for a busy lease and retries durably on the light cron without Twitch credentials", async () => {
    const owner = await acquireTwitchLease(env.DB, "publication-lock", new Date().toISOString(), 300);
    const response = await revoke();
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(await response.json()).toMatchObject({ ok: false, permissionSaved: true, publicationPending: true });
    expect(await pending()).not.toBeNull();
    expect((await readSnapshot(env.DATA_PUBLIC))?.recent).toHaveLength(1);
    expect(await env.DB.prepare("SELECT 1 FROM twitch_streams").first()).toBeNull();
    await releaseTwitchLease(env.DB, "publication-lock", owner!);
    // Publication happens before any YouTube fetch, even if light refresh then fails.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("upstream unavailable"));
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: "*/5 * * * *" }), adminEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(fetchSpy).toHaveBeenCalled();
    await expectUnpublished();
  });

  it("keeps a timed-out withdrawal pending when the older publisher finishes and allows the same request to retry", async () => {
    const paused = signal();
    const resume = signal();
    const put = env.DATA_PUBLIC.put.bind(env.DATA_PUBLIC);
    vi.spyOn(env.DATA_PUBLIC, "put").mockImplementationOnce(async (...args) => {
      paused.resolve();
      await resume.promise;
      return put(...args);
    });
    const stalePublisher = publishCurrentSnapshot(env, new Map(), NOW, NOW);
    await paused.promise;
    let response: Response;
    try { response = await revoke(); }
    finally { resume.resolve(); await stalePublisher; }
    expect(response.status).toBe(503);
    expect((await readSnapshot(env.DATA_PUBLIC))?.recent).toHaveLength(1);
    // The older publisher may have consumed archive-rewrite, but it cannot clear
    // the full-publication marker because it read streams before withdrawal.
    expect(await pending()).not.toBeNull();
    expect((await revoke()).status).toBe(200);
    await expectUnpublished();
  });

  it.each([SNAPSHOT_KEY, archiveMonthKey("2026-09"), ARCHIVE_INDEX_KEY])("keeps publication pending after an R2 failure writing %s", async (failedKey) => {
    const put = env.DATA_PUBLIC.put.bind(env.DATA_PUBLIC);
    vi.spyOn(env.DATA_PUBLIC, "put").mockImplementation(async (...args) => {
      if (args[0] === failedKey) throw new Error("R2 unavailable");
      return put(...args);
    });
    const response = await revoke();
    expect(response.status).toBe(503);
    expect(await pending()).not.toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM twitch_state WHERE key='publication-lock'").first()).toBeNull();
    vi.restoreAllMocks();
    await publishTwitchChanges(env, "2026-11-01T00:00:00.000Z");
    await expectUnpublished();
  });

  it("does not treat a missing snapshot as successful publication", async () => {
    await env.DATA_PUBLIC.delete(SNAPSHOT_KEY);
    expect((await revoke()).status).toBe(200);
    await expectUnpublished();
  });

  it("does not clear a newer withdrawal marker even if both withdrawals share a timestamp", async () => {
    await setTwitchHistoryPermission(env.DB, "42", false, "first withdrawal", NOW);
    const first = await pending();
    const put = env.DATA_PUBLIC.put.bind(env.DATA_PUBLIC);
    vi.spyOn(env.DATA_PUBLIC, "put").mockImplementationOnce(async (...args) => {
      await setTwitchHistoryPermission(env.DB, "42", false, "second withdrawal", NOW);
      return put(...args);
    });
    await publishTwitchChanges(env, NOW);
    expect(await pending()).not.toBeNull();
    expect(await pending()).not.toEqual(first);
    await publishTwitchChanges(env, NOW);
    await expectUnpublished();
  });
});
