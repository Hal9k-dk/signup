// Optional real-VM authoring test. Requires Playwright and xorriso on PATH.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const base = (process.env.BASE_URL || "http://localhost:8080").replace(/\/$/, "") + "/";
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hal9k-vm-tools-"));
  let browser;
  try {
    await fs.mkdir(path.join(dir, "cd"));
    await fs.writeFile(path.join(dir, "cd/README.TXT"), "HAL9K installer CD test\r\n");
    const iso = path.join(dir, "test.iso");
    execFileSync("xorriso", ["-as", "mkisofs", "-o", iso, path.join(dir, "cd")], { stdio: "pipe" });
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base);
    await page.waitForSelector('#screen-container[data-ready="true"]', { timeout: 90000 });
    await page.waitForSelector('#cd-drive[data-state="inserted"]');
    await page.locator("details.vm-tools:not(#disk-panel):not(#publishing-panel) summary").click();
    await page.click("#eject-iso");
    await page.waitForSelector('#cd-drive[data-state="empty"]');
    await page.click("#mount-iso");
    await page.waitForFunction(() => document.getElementById("tools-status").textContent.includes("Vælg en ISO"));
    await page.setInputFiles("#iso-file", iso);
    await page.click("#mount-iso");
    await page.waitForFunction(() => document.getElementById("cd-status").textContent.includes("test.iso"));
    await page.click("#save-state");
    await page.waitForFunction(() => document.getElementById("tools-status").textContent.includes("Skub CD"));
    await page.click("#eject-iso");
    await page.waitForFunction(() => document.getElementById("cd-status").textContent.includes("skubbet"));
    async function download(button, name) {
      const pending = page.waitForEvent("download", { timeout: 120000 });
      await page.click(button);
      const result = await pending;
      assert.equal(result.suggestedFilename(), name);
      const dest = path.join(dir, name);
      await result.saveAs(dest);
      await page.waitForFunction(() => !document.getElementById("vm-tools").disabled);
      assert.equal(await page.locator("#pause").textContent(), "Fortsæt");
      return dest;
    }
    const state = await download("#save-state", "hal9k-windows98-state.bin");
    assert((await fs.stat(state)).size > 1024 * 1024);
    const disk = await download("#export-disk", "hal9k-windows98-disk.img");
    assert.equal((await fs.stat(disk)).size, 512 * 1024 * 1024);
    page.on("dialog", dialog => dialog.accept());
    await page.setInputFiles("#state-file", state);
    await page.click("#load-state");
    await page.waitForFunction(() => document.getElementById("tools-status").textContent.includes("Snapshot indlæst"));
    assert.equal(await page.locator("#pause").textContent(), "Fortsæt");
    await page.click("#pause");
    await page.waitForFunction(() => document.getElementById("pause").textContent === "Pause");
    assert.deepEqual(errors, []);
    console.log("PASS: real ISO mount/eject, invalid ISO, export guard, snapshot/disk download, snapshot restore and resume");
  } finally {
    await browser?.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
