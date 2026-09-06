// Isolated Playwright screenshot script for desktop UI research.
// Launches its own chromium.launch() instance -- NOT the shared MCP browser,
// per repo rule (see app/CLAUDE.md "Multi-agent discipline"). Does not log
// into anything, does not buy anything. Public pages only, best-effort: a
// failed page still gets a screenshot of whatever rendered (or is skipped
// with a logged reason) so one dead site does not block the rest.
//
// Usage: node docs/research/desktop/shot.mjs

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("docs/research/desktop/refs");
mkdirSync(OUT, { recursive: true });

const targets = [
  { name: "bandcamp-discover", url: "https://bandcamp.com/discover" },
  { name: "soundcloud-discover", url: "https://soundcloud.com/discover" },
  { name: "apple-music-browse", url: "https://music.apple.com/us/browse" },
  { name: "deezer-home", url: "https://www.deezer.com/en/" },
  { name: "spotify-open", url: "https://open.spotify.com/" },
  { name: "youtube-music", url: "https://music.youtube.com/" },
  { name: "tiktok-home", url: "https://www.tiktok.com/en/" },
  { name: "instagram-home", url: "https://www.instagram.com/" },
  { name: "x-home", url: "https://x.com/" },
  { name: "threads-home", url: "https://www.threads.net/" },
  { name: "discord-marketing", url: "https://discord.com/" },
  { name: "linear-marketing", url: "https://linear.app/" },
  { name: "vercel-marketing", url: "https://vercel.com/" },
  { name: "smule-home", url: "https://www.smule.com/" },
  { name: "bandlab-home", url: "https://www.bandlab.com/" },
  { name: "suno-home", url: "https://suno.com/" },
  { name: "udio-home", url: "https://www.udio.com/" },
];

const browser = await chromium.launch({ headless: true });
const results = [];

for (const t of targets) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  });
  const page = await context.newPage();
  try {
    await page.goto(t.url, { waitUntil: "domcontentloaded", timeout: 25000 });
    // Give client-side apps a moment to paint without hanging on networkidle
    // (many of these are long-poll / websocket apps that never go idle).
    await page.waitForTimeout(4500);
    await page.screenshot({
      path: path.join(OUT, `${t.name}.png`),
      fullPage: false,
    });
    results.push({ ...t, ok: true });
    console.log(`OK   ${t.name}`);
  } catch (err) {
    try {
      await page.screenshot({
        path: path.join(OUT, `${t.name}-partial.png`),
        fullPage: false,
      });
    } catch {}
    results.push({ ...t, ok: false, error: String(err).slice(0, 200) });
    console.log(`FAIL ${t.name}: ${String(err).slice(0, 150)}`);
  } finally {
    await context.close();
  }
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
