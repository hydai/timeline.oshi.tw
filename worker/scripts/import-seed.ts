// Turn seed/channels.json into idempotent INSERTs. Apply with wrangler d1 execute.
import { readFileSync, writeFileSync } from "node:fs";

const rows = JSON.parse(readFileSync("seed/channels.json", "utf8")) as Array<{ channelId: string; handle: string | null }>;
const now = new Date().toISOString();
const esc = (s: string) => s.replace(/'/g, "''");
const sql = rows
  .map((r) =>
    `INSERT INTO channels (channel_id, handle, enabled, added_at) VALUES ('${esc(r.channelId)}', ${r.handle ? `'${esc(r.handle)}'` : "NULL"}, 1, '${now}') ON CONFLICT(channel_id) DO NOTHING;`,
  )
  .join("\n");
writeFileSync("seed/seed.sql", sql + "\n");
console.log(`wrote seed/seed.sql (${rows.length} rows)`);
