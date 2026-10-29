const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.BASE_URL || "http://localhost:8080";
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ colorScheme: "light" });
    const response = await page.request.get(base + "/experiences.json");
    const entries = await response.json();
    for (let i = 0; i < entries.length; i++) {
      await page.goto(base);
      await page.waitForSelector("[data-experience]");
      assert.equal(
        await page.locator("[data-experience]").count(),
        entries.length,
      );
      assert.equal(
        await page.locator("[data-experience]").nth(i).innerText(),
        entries[i].title,
      );
      await page.evaluate(
        (value) => {
          Math.random = () => value;
        },
        (i + 0.5) / entries.length,
      );
      await page.locator("#feeling-lucky").click();
      await page.waitForURL(`**/experiences/${entries[i].id}/`);
    }
    await page.goto(base);
    const light = await page.evaluate(
      () => getComputedStyle(document.documentElement).backgroundColor,
    );
    await page.emulateMedia({ colorScheme: "dark" });
    assert.notEqual(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).backgroundColor,
      ),
      light,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    console.log(
      "PASS: landing discovers catalogue, all lucky choices, live themes, mobile",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
