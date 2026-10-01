import { z } from "zod";
import type { Env } from "./types";

const id = z.string().regex(/^\d+$/);
const login = z.string().regex(/^[a-z0-9_]{1,25}$/i);
export const twitchStreamSchema = z.object({
  id, user_id: id, user_login: login, title: z.string(),
  game_id: z.string(), game_name: z.string(), started_at: z.iso.datetime({ offset: true }),
  thumbnail_url: z.string(), viewer_count: z.number().int().nonnegative(),
});
export type TwitchStream = z.infer<typeof twitchStreamSchema>;
const userSchema = z.object({ id, login });
const channelSchema = z.object({ broadcaster_id: id, title: z.string(), game_id: z.string(), game_name: z.string() });
export type TwitchChannel = z.infer<typeof channelSchema>;
const subscriptionSchema = z.object({
  id: z.string(), type: z.string(), version: z.string(), status: z.string(),
  condition: z.record(z.string(), z.string()),
  transport: z.object({ method: z.string(), callback: z.string().optional() }),
});
export type TwitchSubscription = z.infer<typeof subscriptionSchema>;

/** Bound the bytes actually read; Content-Length alone is not a size limit. */
export async function boundedText(response: Request | Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error("body too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}

export interface TwitchApi {
  users(logins: string[]): Promise<z.infer<typeof userSchema>[]>;
  usersById(ids: string[]): Promise<z.infer<typeof userSchema>[]>;
  streams(ids: string[]): Promise<TwitchStream[]>;
  channels(ids: string[]): Promise<TwitchChannel[]>;
  subscriptions(): Promise<TwitchSubscription[]>;
  subscribe(type: string, version: string, userId: string): Promise<void>;
  unsubscribe(id: string): Promise<void>;
}

export function twitchConfigured(env: Env): boolean {
  return !!(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET);
}

/** One client per invocation. Tokens stay in private D1, never the public bucket. */
export function twitchApi(env: Env): TwitchApi {
  let token: string | undefined;
  async function accessToken(): Promise<string> {
    if (token) return token;
    const now = new Date().toISOString();
    const cached = await env.DB.prepare("SELECT value FROM twitch_state WHERE key = 'app-token' AND expires_at > ?1")
      .bind(now).first<{ value: string }>();
    if (cached) return token = cached.value;
    const res = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST", signal: AbortSignal.timeout(8_000),
      body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID!, client_secret: env.TWITCH_CLIENT_SECRET!, grant_type: "client_credentials" }),
    });
    if (!res.ok) { await res.body?.cancel(); throw new Error(`Twitch token request failed (${res.status})`); }
    const value = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() })
      .parse(JSON.parse(await boundedText(res, 16_384)));
    // Reacquire within an hour; no long-lived user OAuth session is maintained.
    const expires = new Date(Date.now() + Math.max(1, Math.min(value.expires_in - 60, 3300)) * 1000).toISOString();
    await env.DB.prepare("INSERT OR REPLACE INTO twitch_state(key,value,expires_at) VALUES('app-token',?1,?2)")
      .bind(value.access_token, expires).run();
    return token = value.access_token;
  }
  async function request(path: string, init: RequestInit = {}, retry = true): Promise<unknown> {
    const res = await fetch(`https://api.twitch.tv/helix/${path}`, {
      ...init, signal: AbortSignal.timeout(8_000),
      headers: { "Client-Id": env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    });
    if (res.status === 401 && retry) {
      await res.body?.cancel();
      token = undefined;
      await env.DB.prepare("DELETE FROM twitch_state WHERE key = 'app-token'").run();
      return request(path, init, false);
    }
    if (!res.ok) { await res.body?.cancel(); throw new Error(`Twitch ${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status})`); }
    if (res.status === 204) return null;
    return JSON.parse(await boundedText(res, 1_048_576));
  }
  async function batch<T>(path: string, key: string, values: string[], schema: z.ZodType<T>, paginated = false): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; i < values.length; i += 100) {
      const query = new URLSearchParams();
      for (const value of values.slice(i, i + 100)) query.append(key, value);
      if (paginated) query.set("first", "100");
      out.push(...z.object({ data: z.array(schema) }).parse(await request(`${path}?${query}`)).data);
    }
    return out;
  }
  return {
    users: values => batch("users", "login", values, userSchema),
    usersById: values => batch("users", "id", values, userSchema),
    streams: values => batch("streams", "user_id", values, twitchStreamSchema, true),
    channels: values => batch("channels", "broadcaster_id", values, channelSchema),
    async subscriptions() {
      const out: TwitchSubscription[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 100; page++) {
        const query = new URLSearchParams();
        if (cursor) query.set("after", cursor);
        const data = z.object({ data: z.array(subscriptionSchema), pagination: z.object({ cursor: z.string().optional() }).optional() })
          .parse(await request(`eventsub/subscriptions?${query}`));
        out.push(...data.data);
        cursor = data.pagination?.cursor;
        if (!cursor) return out;
      }
      throw new Error("Twitch subscription pagination exceeded limit");
    },
    async subscribe(type, version, userId) {
      const url = new URL(env.TWITCH_WEBHOOK_URL!);
      if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password || url.hash) {
        throw new Error("Twitch callback must be HTTPS on port 443");
      }
      await request("eventsub/subscriptions", { method: "POST", body: JSON.stringify({
        type, version, condition: { broadcaster_user_id: userId },
        transport: { method: "webhook", callback: url.href, secret: env.TWITCH_WEBHOOK_SECRET },
      }) });
    },
    async unsubscribe(id) { await request(`eventsub/subscriptions?id=${encodeURIComponent(id)}`, { method: "DELETE" }); },
  };
}
