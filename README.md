# Timeline — 台灣 VTuber 直播時間軸

**繁體中文** | [English](README-en.md)

以 Threads 河道式呈現台灣 VTuber 的直播動態——**正在直播、預定開台、已完成直播、里程碑**匯流成一條可搜尋的時間軸，並可透過與 VODs 一致的大頭貼列單選個別 VTuber。設計語言沿用姊妹專案 **prism.oshi.tw** 的水晶玻璃質感（glassmorphism），支援深／淺色模式。

**線上網站：** <https://timeline.oshi.tw>

## 特色

- **河道式時間軸**：四種泳道（直播中／預定開台／已完成／里程碑）依時間匯流成單一河道
- **搜尋與篩選**：可即時搜尋 VTuber，依內容類型快速切換，並透過與 VODs 一致的大頭貼列單選個別 VTuber
- **永久歷史**：已完成直播與里程碑保存在 D1，前端依月份從 R2 封存按需載入，不會再隨近期視窗滾動消失
- **深／淺色模式**：淺色以淺藍、淺粉、白為主體；深色為對應色調
- **前端全靜態**：Next.js 靜態輸出，執行期不需伺服器
- **後端零常駐**：資料由 Cron 觸發的 Worker 週期性產生當前快照與月份封存

## 運作方式

系統分成互相獨立的兩半——一個負責「累積永久紀錄並發布快照／封存」的後端 Worker，一個負責「呈現」的靜態前端。兩者只透過 R2 上的公開 JSON 溝通。

```
YouTube（RSS + Data API v3）─┐
                            ├─►  streams-cache Worker ─►  D1 永久紀錄 ─► R2
twvtuber REST API ──────────┘         （Cron 觸發）                  ├─ snapshot.json
                                                                    └─ archive/{index,YYYY-MM}.json
                                                                              │
                                                      瀏覽器按需讀取（Next.js 靜態站）◄─┘
```

- **`worker/` — streams-cache 後端**（Cloudflare Workers）
  - **Heavy 全量刷新**（每日 4 次，`0/6/12/18` UTC）：對每個頻道走 RSS 探索（0 API 配額）找出近期影片 → `videos.list` 取直播細節 → 從完整 [twvtuber](https://twvtuber.oshi.tw) 名冊回填出道、歷年週年與畢業里程碑 → 發布資料。
  - **Light 直播檢查**（每 30 分）：只更新直播中／即將開始的狀態。
  - 頻道、所有直播與里程碑永久存於 **D1**（`timeline-streams`）。私人／刪除影片以 tombstone 隱藏而不實體刪除；R2 同時提供輕量 `streams/v1/snapshot.json` 與 `streams/v1/archive/` 月份封存。
  - 另有 token 保護的手動觸發：`POST /refresh?mode=heavy|light`（帶 `X-Trigger-Token` 標頭），供除錯用。
- **`web/` — 前端**（Next.js 16 靜態輸出，部署於 Cloudflare Pages）
  - 於瀏覽器端抓取當前快照與輕量封存索引；選擇「已完成」或「里程碑」後才逐月載入永久紀錄。

## 技術棧

| | |
|---|---|
| **後端** | Cloudflare Workers · D1 · R2 · Cron Triggers · TypeScript · [zod](https://zod.dev) · Vitest（`@cloudflare/vitest-pool-workers`）· Wrangler 4 |
| **前端** | Next.js 16（App Router，`output: 'export'`）· React 19 · TypeScript · Tailwind CSS 3.4 · lucide-react · next/font（自架字型）· Vitest + Testing Library + jsdom |

## 快速開始

需求：Node.js 20+、[Wrangler](https://developers.cloudflare.com/workers/wrangler/) 4、一組 [YouTube Data API v3](https://developers.google.com/youtube/v3) 金鑰、一個 Cloudflare 帳號。

### 後端 Worker（`worker/`）

```bash
cd worker
npm install

# 本機密鑰：建立 worker/.dev.vars（此檔已被 .gitignore 排除）
#   YOUTUBE_API_KEY=你的金鑰
#   MANUAL_TRIGGER_TOKEN=自訂字串

# 套用資料庫結構到本機 D1
npm run db:migrate:local

# 灌入頻道種子。seed/seed.sql 已隨版控附上，直接套用即可（免 API 金鑰）：
wrangler d1 execute timeline-streams --local --file seed/seed.sql

npm run dev            # 本機開發（可用 --test-scheduled 觸發 cron）
npm test               # 跑測試
```

> **YouTube 金鑰務必用「HTTP 參照網址」限制**（`https://timeline.oshi.tw/*`），**不要用 IP 限制**——Worker 的邊緣節點 IP 不固定，IP 限制會導致 `403 API_KEY_IP_ADDRESS_BLOCKED`。Worker 會自動送出 `Referer: https://timeline.oshi.tw/`（由 `YT_REFERER` 變數設定）。

部署到 Cloudflare：

```bash
# 建立自己的資源，並把 id 填回 wrangler.jsonc（database_id）與 bucket_name
wrangler d1 create timeline-streams

# 設定遠端密鑰
wrangler secret put YOUTUBE_API_KEY
wrangler secret put MANUAL_TRIGGER_TOKEN

npm run db:migrate:remote
wrangler d1 execute timeline-streams --remote --file seed/seed.sql
npm run deploy
```

### 前端 Web（`web/`）

```bash
cd web
npm install
npm run dev            # http://localhost:3000（用內建的 public/streams-sample.json 當資料）
npm run build          # 靜態輸出到 out/
npm test
```

部署到 **Cloudflare Pages**：build 指令 `npm run build`、輸出目錄 `out/`。資料來源以 `NEXT_PUBLIC_SNAPSHOT_URL` 指定，未設定時預設回退到 `https://data.oshi.tw/streams/v1/snapshot.json`（見 [`web/.env.example`](web/.env.example)）。提供快照的主機必須送出 `Access-Control-Allow-Origin`，因為瀏覽器是跨來源抓取的。

## 資料契約（v1.0.0）

當前狀態使用輕量快照（欄位定義見 [`worker/src/types.ts`](worker/src/types.ts) 的 `Snapshot`）：

```jsonc
{
  "version": "1.0.0",
  "generated_at": "ISO 時間",
  "heavy_refreshed_at": "ISO 時間",
  "channels": { "<channelId>": { "name", "handle", "avatar", "group", "nationality", "youtube_subs", "twvtuber_id" } },
  "groups": ["團體名稱", ...],
  "live":      [ /* SnapshotStream */ ],
  "upcoming":  [ /* SnapshotStream */ ],
  "recent":    [ /* SnapshotStream */ ],
  "milestones":[ { "channelId", "type": "debut|anniversary|graduate", "date" } ]
}
```

`SnapshotStream` 的時間欄位（`actualStart` / `scheduledStart` / `actualEnd` / `concurrentViewers`）為選填，值為 null 時直接省略。

永久歷史另由 `streams/v1/archive/index.json` 列出每月筆數；各月 `streams/v1/archive/YYYY-MM.json` 包含該月的 `channels`、已完成 `streams` 與 `milestones`。月份檔只在使用者切換到歷史類型時按需載入。

## 專案結構

```
worker/                 # Cloudflare Worker — streams-cache 後端
  src/                  # index · refresh · archive · rss · youtube · twvtuber · db · r2 · snapshot · seed · types
  migrations/           # D1 結構與永久歷史 migration
  seed/                 # channels.json（38 個頻道）+ seed.sql
  scripts/              # build-seed（名冊→channels.json）· import-seed（channels.json→seed.sql）
  test/                 # Vitest（workers pool）
  wrangler.jsonc
web/                    # Next.js 靜態輸出前端 — 部署於 Pages
  app/                  # App Router：page.tsx · layout · components/ · globals.css
  lib/                  # 快照抓取 · 篩選 · 河道分組 · 時間格式 · 型別
  public/               # streams-sample.json（開發用假資料）
  test/                 # Vitest + Testing Library
```

## 新增／更新頻道

頻道種子在 [`worker/seed/channels.json`](worker/seed/channels.json)。有兩種方式：

1. **手動**：直接編輯 `channels.json`（`{ channelId, handle }`）。
2. **從 prism 名冊重建**：`YOUTUBE_API_KEY=... npm run build:seed`——解析 prism registry 的 YouTube 連結為 channel id 並自動去除 hololive。

接著重建 SQL 並套用到 D1：

```bash
npm run import:seed    # channels.json → seed/seed.sql（idempotent INSERT）
wrangler d1 execute timeline-streams --remote --file seed/seed.sql
```

新頻道會在下一次 heavy 刷新時自動被探索與補齊 metadata。

## 資料來源與致謝

- VTuber 名冊、所屬團體、里程碑資料來自 **[twvtuber](https://twvtuber.oshi.tw)**，其資料源自 **[TaiwanVtuberData](https://github.com/TaiwanVtuberData/TaiwanVTuberTrackingDataJson)**。
- 直播中／預定／近期的實況 metadata 來自 **YouTube Data API v3**（RSS 探索 + `videos.list`）。
- 設計語言取材自 **prism.oshi.tw** 的水晶玻璃質感。

## 授權

以 [Apache License 2.0](LICENSE) 授權。Copyright © 2026 hydai。
