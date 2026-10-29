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
    assert.equal(await page.locator(".question:visible").count(), 1);
    await page.locator("#next").click();
    assert.equal(
      await page.locator("#step-count").innerText(),
      "Spørgsmål 1 af 15",
    );
    const surveyAnswers = [
      "Ada",
      "Lovelace",
      "12:34",
      data.email,
      data.street,
      "raw",
      data.postalCode,
      data.city,
      "all",
      "31-02-2000",
      data.phone,
      "Brrr-klonk",
      "student",
      "very",
      data.message,
    ];
    async function answerSurvey(value) {
      const input = page.locator(
        ".question:visible input, .question:visible select, .question:visible textarea",
      );
      if (await input.evaluate((el) => el.tagName === "SELECT"))
        await input.selectOption(value);
      else await input.fill(value);
      await page.locator("#next").click();
    }
    for (const answer of surveyAnswers.slice(0, 2)) await answerSurvey(answer);
    await page.locator("#back").click();
    assert.equal(
      await page.locator(".question:visible input").inputValue(),
      "Lovelace",
    );
    await page.locator("#next").click();
    for (const answer of surveyAnswers.slice(2)) await answerSurvey(answer);
    await page.waitForFunction(() =>
      document
        .querySelector("#form-status")
        .textContent.includes("gyldig fødselsdato"),
    );
    assert.equal(
      await page.locator("#step-count").innerText(),
      "Spørgsmål 10 af 15",
    );
    await answerSurvey(data.birthDate);
    for (let i = 0; i < 4; i++) await page.locator("#next").click();
    const request = page.waitForRequest(
      (req) => req.url().endsWith("/api/signup") && req.method() === "POST",
    );
    await page.locator("#next").click();
    const payload = (await request).postDataJSON();
    assert.equal(payload.firstName, "Ada");
    assert.equal(payload.membership, "student");
    assert.equal(Object.keys(payload).length, 10);
    assert(!("currentTime" in payload));
    await page.waitForFunction(
      () => !document.querySelector("#success").hidden,
    );
    assert((await page.locator("#success").innerText()).includes("Modtaget"));
    assert.equal(await page.evaluate(() => typeof window.Matter), "undefined");
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );

    assert.deepEqual(errors, []);
    console.log("PASS: survey independent browser tests");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
