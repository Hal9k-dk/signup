// Real v86 BIOS boot/save/restore regression with a tiny non-Windows raw disk.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
(async () => {
  const root = path.resolve(__dirname, "../public");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "win98-raw-test-"));
  const server = http.createServer(async (req, res) => {
    try {
      const name = new URL(req.url, "http://localhost").pathname;
      const file = path.resolve(root, "." + (name === "/" ? "/index.html" : name));
      if (!file.startsWith(root + path.sep)) throw new Error("Invalid path");
      const data = await fs.readFile(file);
      res.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".html") ? "text/html" : "application/octet-stream");
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const requests = [];
    page.on("request", request => requests.push(request.url()));
    const url = `http://127.0.0.1:${server.address().port}/?author=1`;
    await page.goto(url);
    const disk = Buffer.alloc(1024 * 1024);
    // BIOS boots an infinite loop: EB FE; 55 AA boot signature.
    disk[0] = 0xeb; disk[1] = 0xfe; disk[510] = 0x55; disk[511] = 0xaa;
    await page.setInputFiles("#disk-file", { name: "test.img", mimeType: "application/octet-stream", buffer: disk });
    await page.locator('#disk-form button[type="submit"]').click();
    await page.waitForSelector('#screen-container[data-ready="true"]', { timeout: 90000 });
    await page.waitForTimeout(1500);
    assert.equal(await page.locator("#pause").textContent(), "Pause");
    assert.equal(await page.locator('#tools-panel').evaluate(el => el.open), true);
    let confirmation;
    page.once("dialog", async dialog => { confirmation = dialog.message(); await dialog.dismiss(); });
    await page.click("#reboot-vm");
    assert(confirmation.includes("filsystemet"));
    page.once("dialog", dialog => dialog.accept());
    await page.click("#reboot-vm");
    await page.waitForFunction(() => document.getElementById("tools-status").textContent.includes("Hård genstart udført"));
    assert.equal(await page.locator("#pause").textContent(), "Pause");
    const pending = page.waitForEvent("download", { timeout: 120000 });
    await page.click("#export-handover");
    const download = await pending;
    const archive = path.join(dir, "handover.tar");
    await download.saveAs(archive);
    const bytes = await fs.readFile(archive);
    let offset = 0;
    const extracted = {};
    while (bytes[offset]) {
      const name = bytes.subarray(offset, offset + 100).toString().split("\0")[0];
      const size = parseInt(bytes.subarray(offset + 124, offset + 136).toString(), 8);
      extracted[name] = path.join(dir, name);
      await fs.writeFile(extracted[name], bytes.subarray(offset + 512, offset + 512 + size));
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    assert.equal(await page.locator("#pause").textContent(), "Fortsæt");
    assert.equal((await fs.stat(extracted["disk.img"])).size, disk.length);
    await page.goto(url);
    await page.setInputFiles("#disk-file", extracted["disk.img"]);
    await page.setInputFiles("#disk-state-file", extracted["state.bin"]);
    await page.setInputFiles("#disk-metadata-file", extracted["handover.json"]);
    await page.locator('#disk-form button[type="submit"]').click();
    await page.waitForSelector('#screen-container[data-ready="true"]', { timeout: 90000 });
    assert.equal(await page.locator("#pause").textContent(), "Fortsæt");
    await page.click("#pause");
    assert.equal(await page.locator("#pause").textContent(), "Pause");
    assert(!requests.some(url => url.includes("/images/windows98") || url.includes("hal9k-test.iso")));
    const { run } = require('../publish.cjs');
    const version = 'test-' + Date.now();
    const finalVersion = version + '-final';
    const previousDraft = await fs.readFile(path.join(root, 'publishing/draft.json')).catch(() => null);
    try {
      run('prepare', archive, version, false);
      await page.goto(url.replace('?author=1', '?publish=1'));
      await page.waitForSelector('#screen-container[data-ready="true"]', { timeout: 90000 });
      await page.waitForTimeout(1500);
      await page.locator('#tools-panel > summary').click();
      const capturePending = page.waitForEvent('download', { timeout: 120000 });
      await page.click('#export-handover');
      const capture = await capturePending;
      const capturePath = path.join(dir, 'capture.tar');
      await capture.saveAs(capturePath);
      run('finalize', capturePath, finalVersion, false);
      const manifest = JSON.parse(await fs.readFile(path.join(root, 'publishing', finalVersion, 'manifest.json')));
      assert(manifest.compressed_state_size < 1024 * 1024, 'Tiny disk test should yield small compressed snapshot');
      const restoredRequests = [];
      page.on('request', request => restoredRequests.push(request.url()));
      await page.goto(url.replace('?author=1', '?published=' + finalVersion));
      await page.waitForSelector('#screen-container[data-ready="true"]', { timeout: 90000 });
      assert(!restoredRequests.some(url => url.endsWith('/images/disk.img') || url.endsWith('/images/state.bin')));
      console.log('PASS: prepare -> real async BIOS boot -> publishing capture -> finalize/zstd -> compressed lazy restore');
    } finally {
      await fs.rm(path.join(root, 'publishing', version), { recursive: true, force: true });
      await fs.rm(path.join(root, 'publishing', finalVersion), { recursive: true, force: true });
      if (previousDraft) await fs.writeFile(path.join(root, 'publishing/draft.json'), previousDraft);
      else await fs.rm(path.join(root, 'publishing/draft.json'), { force: true });
    }
    assert.deepEqual(errors, []);
    console.log("PASS: real raw BIOS boot, handover export, checksum-verified disk/state restore paused, resume; no demo asset requests");
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
