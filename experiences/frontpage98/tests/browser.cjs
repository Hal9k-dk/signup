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
    assert.equal(await page.evaluate(() => typeof window.Matter), "undefined");
    for (const [name, value] of Object.entries(data))
      await page.locator(`[name="${name}"]`).fill(value);
    await page.locator('[name="birthDate"]').fill("31-02-2000");
    await page.locator("#submit-button").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#form-status")
        .textContent.includes("gyldig fødselsdato"),
    );
    assert.equal(await page.locator('[name="firstName"]').inputValue(), "Ada");
    await page.locator('[name="birthDate"]').fill(data.birthDate);
    await page.locator('[value="student"]').check();
    await page.locator("#submit-button").click();
    await page.waitForFunction(() =>
      document.querySelector("#form-status").textContent.includes("Modtaget"),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: "/tmp/hal9k-frontpage98.png",
      fullPage: true,
    });

    assert.deepEqual(errors, []);
    console.log("PASS: frontpage98 independent browser tests");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
