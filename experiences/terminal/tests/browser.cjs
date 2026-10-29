// Run against this project's make dev, or set BASE_URL to its assembled URL.
// Signup requests are intercepted so tests never send personal data to the API.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.BASE_URL || 'http://localhost:8080/';

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    let payload;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/signup', async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Modtaget! Tak for din indmeldelse.' }) });
    });
    await page.goto(base);
    await page.locator('#screen').click();

    async function enter(value) {
      await page.keyboard.type(value, { delay: 1 });
      await page.keyboard.press('Enter');
    }

    await enter('INDMELD');
    for (const value of [
      'Ada', 'Lovelace', 'ada@example.test', 'Testvej 42', '2200',
      'København N', '10-12-1990', '+45 12345678', 'studie', 'PROSA: TEST',
    ]) await enter(value);

    // Let the slow, 2400-baud review transcript finish before entering a command.
    await page.waitForTimeout(5000);
    await enter('EDIT 3');
    await enter('ada2@example.test');
    await page.waitForTimeout(6500);
    const request = page.waitForRequest((req) => req.url().endsWith('/api/signup') && req.method() === 'POST');
    await enter('JA');
    await request;
    await page.waitForFunction(() => payload !== undefined);

    assert(payload, 'confirmation should submit the signup');
    assert.equal(payload.firstName, 'Ada');
    assert.equal(payload.email, 'ada2@example.test');
    assert.equal(payload.membership, 'student');
    assert.equal(Object.keys(payload).length, 10);
    assert.deepEqual(errors, []);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    console.log('PASS: terminal signup browser test');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
