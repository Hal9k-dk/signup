// Run against this project's make dev, or set BASE_URL to its assembled URL.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.BASE_URL || "http://localhost:8080/";
const data = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  street: "Testvej 42",
  postalCode: "2200",
  city: "København N",
  birthDate: "10-12-1990",
  phone: "+45 12345678",
  message: "PROSA: 1234",
};

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      colorScheme: "light",
      viewport: { width: 390, height: 844 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.waitForLoadState("networkidle");
    assert(await page.locator(".denied").isVisible());
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForSelector("canvas");
    assert(!(await page.locator("#decay-controls").isVisible()));
    for (let i = 0; i < 4; i++) {
      await page.locator("#keyboard-build").click();
      await page.waitForTimeout(250);
    }
    await page.waitForFunction(
      () => !document.querySelector("#submit-button").disabled,
      {},
      { timeout: 15000 },
    );
    for (const [name, value] of Object.entries(data))
      await page.locator(`[name="${name}"]`).fill(value);
    await page.locator("#submit-button").click();
    await page.waitForFunction(() =>
      document.querySelector("#form-status").textContent.includes("Modtaget"),
    );
    await page.locator("#reset-challenge").click();
    assert(await page.locator("#submit-button").isDisabled());

    assert.deepEqual(errors, []);
    console.log("PASS: physics independent browser tests");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
