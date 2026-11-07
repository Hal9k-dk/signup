// Offline layout regression, not an emulator/Windows integration test.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const page = await browser.newPage();
    const root = path.join(__dirname, "../public");
    const html = readFileSync(path.join(root, "index.html"), "utf8")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
      .replace(/<link\b[^>]*>/g, "");
    await page.setContent(html);
    await page.addStyleTag({ path: path.join(root, "styles.css") });
    for (const size of [{ width: 320, height: 640 }, { width: 480, height: 720 }, { width: 800, height: 600 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(size);
      for (const [width, height, scale] of [[640, 480, 1], [640, 480, 2], [800, 600, 1], [1024, 768, 1]]) {
        await page.evaluate(({ width, height, scale }) => {
          const canvas = document.querySelector("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.hidden = false;
          canvas.style.display = "block";
          canvas.style.width = `${width * scale}px`;
          canvas.style.height = `${height * scale}px`;
          document.querySelector(".text-screen").style.display = "none";
        }, { width, height, scale });
        const result = await page.evaluate(() => {
          const viewport = document.getElementById("viewport").getBoundingClientRect();
          const canvas = document.querySelector("canvas");
          const rect = canvas.getBoundingClientRect();
          return { fits: rect.left >= viewport.left - 1 && rect.right <= viewport.right + 1,
            pageFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
            ratio: rect.width / rect.height, nativeRatio: canvas.width / canvas.height };
        });
        assert(result.fits, `Guest ${width}x${height} scale ${scale} clips at page width ${size.width}`);
        assert(result.pageFits, `Page overflows at ${size.width}`);
        assert(Math.abs(result.ratio - result.nativeRatio) < 0.01, "Guest aspect ratio changed");
      }
    }
    console.log("PASS: normal viewport fits 640/800/1024 guest widths, including v86 2x inline scaling, on 320–1280px pages");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
