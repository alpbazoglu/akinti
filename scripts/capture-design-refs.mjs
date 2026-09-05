// One-off design-research capture. Run: node scripts/capture-design-refs.mjs
// Saves reference screenshots to docs/design/refs/. Not part of the app build.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'docs', 'design', 'refs');
mkdirSync(outDir, { recursive: true });

const targets = [
  { file: 'ref-02-teenage-engineering', url: 'https://teenage.engineering/', w: 1440, h: 900 },
  { file: 'ref-03-teenage-engineering-op1', url: 'https://teenage.engineering/products/op-1/field', w: 1440, h: 900 },
  { file: 'ref-04-ableton-note', url: 'https://www.ableton.com/en/note/', w: 1440, h: 900 },
  { file: 'ref-05-koala-sampler', url: 'https://www.koalasampler.com/', w: 1440, h: 900 },
  { file: 'ref-06-linear', url: 'https://linear.app/', w: 1440, h: 900 },
  { file: 'ref-07-cosmos', url: 'https://www.cosmos.so/', w: 1440, h: 900 },
  { file: 'ref-08-arena', url: 'https://www.are.na/', w: 1440, h: 900 },
  { file: 'ref-09-suno', url: 'https://suno.com/', w: 1440, h: 900 },
  { file: 'ref-10-soundcloud', url: 'https://soundcloud.com/discover', w: 390, h: 844 },
  { file: 'ref-11-bandlab', url: 'https://www.bandlab.com/', w: 390, h: 844 },
  { file: 'ref-12-family', url: 'https://family.co/', w: 390, h: 844 },
];

const browser = await chromium.launch();
for (const t of targets) {
  const ctx = await browser.newContext({
    viewport: { width: t.w, height: t.h },
    deviceScaleFactor: 2,
    isMobile: t.w < 500,
    hasTouch: t.w < 500,
    userAgent:
      t.w < 500
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : undefined,
  });
  const page = await ctx.newPage();
  try {
    await page.goto(t.url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: resolve(outDir, `${t.file}.png`) });
    console.log('ok  ', t.file);
  } catch (err) {
    console.log('fail', t.file, String(err).split('\n')[0]);
    try {
      await page.screenshot({ path: resolve(outDir, `${t.file}.png`) });
      console.log('     (partial screenshot saved)');
    } catch {}
  }
  await ctx.close();
}
await browser.close();
