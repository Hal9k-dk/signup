const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = (process.env.BASE_URL || "http://localhost:8080").replace(/\/$/, "") + "/";
const entry = base + (process.env.PUBLISHED_VERSION ? "?published=" + encodeURIComponent(process.env.PUBLISHED_VERSION) : "");
(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.testEscapeCodes = [];
      let wrappedV86;
      Object.defineProperty(window, "V86", {
        get: () => wrappedV86,
        set: Real => { wrappedV86 = function (options) {
          const emulator = new Real(options);
          const send = emulator.keyboard_send_scancodes.bind(emulator);
          emulator.keyboard_send_scancodes = (codes, ...args) => {
            window.testEscapeCodes.push(Array.from(codes));
            return send(codes, ...args);
          };
          return emulator;
        }; },
      });
      window.testAudioContexts = [];
      window.AudioContext = new Proxy(window.AudioContext, {
        construct(target, args) {
          const context = Reflect.construct(target, args);
          window.testAudioContexts.push(context);
          return context;
        },
      });
    });
    const errors = [];
    page.on("console", message => {
      if (message.type() === "error") errors.push(message.text());
    });
    const external = [];
    await page.route("**/*", route => {
      if (new URL(route.request().url()).origin !== new URL(base).origin) {
        external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    page.on("pageerror", (error) => errors.push(error.message));
    const requests = [];
    page.on("request", request => requests.push(request.url()));
    const started = Date.now();
    await page.goto(entry);
    await page.waitForSelector('#screen-container[data-ready="true"]', { timeout: 90000 });
    console.log(`VM ready in ${Date.now() - started} ms (local unthrottled server)`);
    if (process.env.PUBLISHED_VERSION) {
      assert(!requests.some(url => /\/images\/(disk.img|state.bin)$/.test(url)), "Lazy startup must not download the full raw disk/state");
    }
    await page.waitForFunction(() => {
      const canvas = document.querySelector("canvas");
      return canvas.width >= 640 && canvas.height >= 480 && getComputedStyle(canvas).display !== "none";
    });
    await page.waitForSelector('#cd-drive[data-state="inserted"]');
    await page.waitForFunction(() => !document.getElementById("insert-bundled").disabled);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: process.env.SCREENSHOT || "/tmp/hal9k-windows98.png", fullPage: true });
    assert.equal(await page.locator("#send-escape").isDisabled(), false);
    await page.click("#send-escape");
    assert.deepEqual(await page.evaluate(() => window.testEscapeCodes), [[0x01, 0x81]], "Toolbar Esc sends guest make/break scancodes without input capture");
    assert.equal(await page.evaluate(() => document.pointerLockElement), null);
    assert.equal(await page.locator("#mute").isDisabled(), false);
    await page.click("#mute");
    assert.equal(await page.locator("#mute").getAttribute("aria-pressed"), "true");
    await page.waitForFunction(() => window.testAudioContexts.some(context => context.state === "running"));
    await page.click("#mute");
    assert.equal(await page.locator("#mute").getAttribute("aria-pressed"), "false");
    for (const size of [{ width: 800, height: 600 }, { width: 480, height: 720 }, { width: 320, height: 640 }]) {
      await page.setViewportSize(size);
      await page.waitForFunction(() => {
        const viewport = document.getElementById("viewport").getBoundingClientRect();
        const canvas = document.querySelector("canvas");
        const rect = canvas.getBoundingClientRect();
        return rect.left >= viewport.left - 1 && rect.right <= viewport.right + 1 &&
          document.documentElement.scrollWidth <= window.innerWidth + 1 &&
          Math.abs(rect.width / rect.height - canvas.width / canvas.height) < 0.01;
      });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    const normalSize = await page.locator("canvas").boundingBox();
    await page.click("#fullscreen");
    await page.waitForFunction(() => {
      const viewport = document.getElementById("viewport");
      const canvas = document.querySelector("canvas");
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(viewport.clientWidth / canvas.width, viewport.clientHeight / canvas.height);
      return document.fullscreenElement === viewport &&
        Math.abs(rect.width - canvas.width * scale) < 2 &&
        Math.abs(rect.height - canvas.height * scale) < 2;
    });
    const scaledSize = await page.locator("canvas").boundingBox();
    assert(scaledSize.width > normalSize.width, "Fullscreen should enlarge the VM");
    assert(Math.abs(scaledSize.width / scaledSize.height - normalSize.width / normalSize.height) < 0.01);
    for (const size of [{ width: 1920, height: 600 }, { width: 600, height: 1000 }, { width: 480, height: 320 }]) {
      await page.setViewportSize(size);
      await page.waitForFunction(() => {
        const viewport = document.getElementById("viewport").getBoundingClientRect();
        const canvas = document.querySelector("canvas");
        const rect = canvas.getBoundingClientRect();
        const scale = Math.min(viewport.width / canvas.width, viewport.height / canvas.height);
        return rect.left >= viewport.left - 1 && rect.top >= viewport.top - 1 &&
          rect.right <= viewport.right + 1 && rect.bottom <= viewport.bottom + 1 &&
          Math.abs(rect.width - canvas.width * scale) < 2 &&
          Math.abs(rect.height - canvas.height * scale) < 2;
      });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(width => !document.fullscreenElement &&
      Math.abs(document.querySelector("canvas").getBoundingClientRect().width - width) < 2, normalSize.width);
    await page.click("#pause");
    await page.waitForFunction(() => document.getElementById("pause").textContent === "Fortsæt");
    await page.click("#pause");
    await page.waitForFunction(() => document.getElementById("pause").textContent === "Pause");
    await page.locator("#screen-container").click({ position: { x: 300, y: 200 } });
    await page.waitForFunction(() => document.pointerLockElement?.id === "screen-container");
    await page.waitForSelector('#screen-container[data-captured="true"]');
    await page.mouse.move(1100, 800);
    assert.equal(await page.evaluate(() => document.pointerLockElement?.id), "screen-container");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.pointerLockElement === null);
    assert.equal(await page.locator("#screen-container").evaluate(el => el === document.activeElement), false);
    // Recapture and exercise the release control while the pointer is locked.
    await page.locator("#screen-container").click({ position: { x: 300, y: 200 } });
    await page.waitForSelector('#screen-container[data-captured="true"]');
    await page.locator("#release").evaluate(el => el.click());
    await page.waitForFunction(() => document.pointerLockElement === null);
    await page.locator("#screen-container").click({ position: { x: 300, y: 200 } });
    await page.waitForSelector('#screen-container[data-captured="true"]');
    await page.locator("#pause").evaluate(el => el.click());
    await page.waitForFunction(() => document.pointerLockElement === null);
    await page.waitForFunction(() => document.getElementById("pause").textContent === "Fortsæt");
    await page.click("#pause");
    await page.locator("#screen-container").click({ position: { x: 300, y: 200 } });
    await page.waitForSelector('#screen-container[data-captured="true"]');
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForFunction(() => document.pointerLockElement === null);
    // A denied request must leave a retryable UI, not a broken VM.
    await page.evaluate(() => {
      document.getElementById("screen-container").requestPointerLock = () => Promise.reject(new Error("Denied"));
    });
    await page.locator("#screen-container").click({ position: { x: 300, y: 200 } });
    await page.waitForFunction(() => document.getElementById("status").textContent.includes("blokeret"));
    assert.equal(await page.locator("#pause").isDisabled(), false);
    await page.click("#restore");
    await page.waitForSelector('#screen-container[data-ready="true"]', { timeout: 90000 });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, [], "VM must not depend on external hosts");
    await page.close();

    const broken = await browser.newPage();
    await broken.route("**/state.bin*", route => route.abort());
    await broken.goto(entry);
    await broken.waitForSelector("#error:visible", { timeout: 15000 });
    assert.equal(await broken.locator("#retry").isVisible(), true);
    assert.equal(await broken.locator("#pause").isDisabled(), true);
    await broken.close();
    const missingCD = await browser.newPage();
    await missingCD.emulateMedia({ reducedMotion: "reduce" });
    await missingCD.route("**/downloads/hal9k-test.iso", route => route.fulfill({ status: 503, body: "Unavailable" }));
    await missingCD.goto(entry);
    await missingCD.waitForSelector('#cd-drive[data-state="error"]', { timeout: 90000 });
    await missingCD.waitForFunction(() => !document.getElementById("insert-bundled").disabled);
    assert.equal(await missingCD.locator("#pause").isDisabled(), false);
    await missingCD.unroute("**/downloads/hal9k-test.iso");
    await missingCD.click("#insert-bundled");
    await missingCD.waitForSelector('#cd-drive[data-state="inserted"]');
    await missingCD.close();
    console.log("PASS: local Windows 98 restore, display, pause/resume, mouse capture/release/recapture, pause/blur release, denied capture, fresh restore, download failure UI");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
