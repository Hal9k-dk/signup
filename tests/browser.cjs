// Assembly smoke test only. Experience behaviour is tested by each project.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.BASE_URL || "http://localhost:8080";
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const result = await page.request.get(base + "/experiences.json");
    assert(result.ok());
    const entries = await result.json();
    await page.goto(base);
    await page.waitForSelector("[data-experience]");
    assert.equal(
      await page.locator("[data-experience]").count(),
      entries.length,
    );
    for (const entry of entries) {
      const failures = [];
      const listener = (response) => {
        if (response.status() >= 400) failures.push(response.url());
      };
      page.on("response", listener);
      await page.goto(`${base}/experiences/${entry.id}/`);
      await page.waitForLoadState("networkidle");
      page.off("response", listener);
      assert.deepEqual(failures, [], entry.id + " has missing assets");
    }
    const accepted = await page.request.post(base + "/api/signup", {
      data: {
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        street: "Testvej 42",
        postalCode: "2200",
        city: "København N",
        birthDate: "10-12-1990",
        phone: "+45 12345678",
        membership: "ordinary",
        message: "Assembly smoke test",
      },
    });
    assert(accepted.ok());
    assert.deepEqual(errors, []);
    console.log(
      "PASS: assembled catalogue, every project and asset, shared API; no browser errors",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
