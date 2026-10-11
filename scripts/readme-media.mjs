// Builds the README's carousel, docs/media/carousel.webp: each slide is one
// gallery example as BB renders it (the plugin installed and running), framed
// on a plain background with its name, light or dark. Needs a running BB with
// this plugin loaded, and img2webp (`brew install webp`).
//
//   node scripts/readme-media.mjs [--url http://127.0.0.1:38886] [--keep /tmp/slides]
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const base = option("--url") ?? process.env.BB_URL ?? "http://127.0.0.1:38886";
const keep = option("--keep");

/** Gallery example, theme, caption. Order is the carousel's. */
const SLIDES = [
  ["Chart-funnel", "light", "Chart · funnel"],
  ["Diagram", "dark", "Diagram · click a part to read about it"],
  ["Map", "light", "Map · places looked up and routed"],
  ["Decision", "light", "Decision · you tune the weights"],
  ["Board", "dark", "Board · bb tasks or GitHub issues"],
  ["Roadmap", "light", "Roadmap"],
  ["Transcript", "light", "Transcript · aligned word by word, with WER"],
  ["Compare", "dark", "Compare · wipe, blink or pixel difference"],
  ["Findings", "light", "Findings · ESLint, tsc, SARIF or a review"],
  ["Tests", "dark", "Tests · a vitest, jest or JUnit report"],
  ["Quiz", "light", "Quiz"],
  ["Entity-list", "light", "Entity · places and products"],
];
const SLIDE_MS = 2600;
/** CSS pixels of a slide; captured at 2x. */
const SLIDE = { width: 800, height: 500 };
const THEMES = {
  light: { page: "#f4f4f2", caption: "#6b6b68" },
  dark: { page: "#151515", caption: "#9a9a96" },
};

const work = keep ?? mkdtempSync(path.join(tmpdir(), "genui-slides-"));
mkdirSync(work, { recursive: true });
const browser = await chromium.launch();
const frames = [];
try {
  for (const [example, theme, caption] of SLIDES) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 1200 }, deviceScaleFactor: 2, colorScheme: theme });
    const page = await context.newPage();
    await page.goto(`${base}/plugins/genui/gallery/${encodeURIComponent(example)}`, { waitUntil: "domcontentloaded" });
    const entry = page.locator(`[data-gallery-entry="${example}"]`);
    const ui = entry.locator(".group\\/genui > :first-child").first();
    await ui.waitFor({ timeout: 30_000 });
    // Images, map tiles, diagrams and entrances settle.
    await page.waitForTimeout(3500);
    await page.evaluate(() => {
      const gallery = document.querySelector("[data-gallery-entry]")?.closest("[class*=overflow-y-auto]");
      for (const element of document.querySelectorAll("body *")) {
        const { position } = getComputedStyle(element);
        // Floating windows from other plugins, and the gallery's own sticky header, would cover the example.
        const floating = position === "fixed" && gallery != null && !element.contains(gallery) && !gallery.contains(element);
        const header = position === "sticky" && gallery?.contains(element);
        if (floating || header) element.style.visibility = "hidden";
      }
    });
    await ui.scrollIntoViewIfNeeded();
    const shot = await ui.screenshot();
    await context.close();

    const slide = await browser.newContext({ viewport: SLIDE, deviceScaleFactor: 2 });
    const canvas = await slide.newPage();
    const { page: background, caption: ink } = THEMES[theme];
    await canvas.setContent(`<!doctype html><html><body style="margin:0;width:${SLIDE.width}px;height:${SLIDE.height}px;background:${background};display:flex;flex-direction:column;font-family:-apple-system,'SF Pro Text','Inter',system-ui,sans-serif">
      <div style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:28px 40px 8px">
        <img src="data:image/png;base64,${shot.toString("base64")}" style="max-width:100%;max-height:100%;object-fit:contain">
      </div>
      <p style="margin:0;padding:0 40px 22px;font-size:13px;letter-spacing:.01em;color:${ink}">${caption}</p>
    </body></html>`);
    await canvas.waitForFunction(() => document.images[0]?.complete);
    const file = path.join(work, `${String(frames.length + 1).padStart(2, "0")}-${example}.png`);
    await canvas.screenshot({ path: file });
    await slide.close();
    frames.push(file);
    console.log(`slide ${frames.length}/${SLIDES.length}: ${example} (${theme})`);
  }
} finally {
  await browser.close();
}

const out = path.join(root, "docs", "media", "carousel.webp");
mkdirSync(path.dirname(out), { recursive: true });
execFileSync("img2webp", ["-loop", "0", "-lossy", "-q", "82", "-m", "6", "-d", String(SLIDE_MS), ...frames, "-o", out], { stdio: "inherit" });
console.log(`${path.relative(root, out)}: ${(statSync(out).size / 1024).toFixed(0)} KB, ${frames.length} slides`);
if (keep === undefined) rmSync(work, { recursive: true, force: true });
