import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Static export can finish successfully while an alias contains a prerendered 404.
// Check the actual HTML that social crawlers and a cold browser request will receive.
const profiles = JSON.parse(await readFile(new URL("../data/channel-aliases.json", import.meta.url), "utf8"));
const assertShell = (html, route) => {
  // Strip scripts so an RSC payload mentioning the header cannot satisfy this check.
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  assert(/<header\b[^>]*>[\s\S]*?<a\b[^>]*href="\/"[^>]*>[\s\S]*?timeline\.oshi\.tw/.test(markup), `${route}: missing prerendered home link`);
};
assertShell(await readFile(new URL("../out/index.html", import.meta.url), "utf8"), "/");
let count = 0;
for (const profile of Object.values(profiles)) {
  const canonical = `https://timeline.oshi.tw/v/${encodeURIComponent(profile.slug)}`;
  for (const slug of [profile.slug, ...profile.aliases]) {
    const file = new URL(`../out/v/${encodeURIComponent(slug)}.html`, import.meta.url);
    const html = await readFile(file, "utf8");
    assertShell(html, `/v/${slug}`);
    assert(!/<meta name="robots" content="[^"]*noindex/.test(html), `${slug}: exported a not-found page`);
    assert(html.includes(`<link rel="canonical" href="${canonical}"`), `${slug}: incorrect canonical URL`);
    assert(html.includes(`<meta property="og:url" content="${canonical}"`), `${slug}: missing personal Open Graph metadata`);
    assert(/<meta property="og:image" content="https:\/\//.test(html), `${slug}: missing preview image`);
    count += 1;
  }
}
console.log(`Verified static HTML and preview metadata for ${count} aliases.`);
