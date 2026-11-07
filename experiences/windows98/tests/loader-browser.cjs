// Real lazy-master restore with a paced snapshot response to inspect progress.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
(async () => {
  const root = path.resolve(__dirname, '../public');
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + '/')) { res.writeHead(403); return res.end(); }
    fs.stat(file, (err, stat) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
      if (!file.endsWith('state.bin.zst')) return fs.createReadStream(file).pipe(res);
      const stream = fs.createReadStream(file, { highWaterMark: 256 * 1024 });
      stream.on('data', chunk => {
        stream.pause(); res.write(chunk);
        setTimeout(() => stream.resume(), 60);
      });
      stream.on('end', () => res.end());
      res.on('close', () => stream.destroy());
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => {
      const bar = document.getElementById('loader-progress');
      const value = Number(bar.getAttribute('aria-valuenow'));
      return value > 0 && value < 100;
    });
    assert.equal(await page.locator('#vm-loader').isVisible(), true);
    assert.equal(await page.locator('#viewport').getAttribute('aria-busy'), 'true');
    const before = Number(await page.locator('#loader-progress').getAttribute('aria-valuenow'));
    await page.waitForFunction(before => Number(document.getElementById('loader-progress').getAttribute('aria-valuenow')) > before, before);
    await page.screenshot({ path: '/tmp/hal9k-windows98-loader.png' });
    await page.waitForSelector('#screen-container[data-ready="true"]', { timeout: 90000 });
    assert.equal(await page.locator('#vm-loader').isVisible(), false);
    assert.equal(await page.locator('#viewport').getAttribute('aria-busy'), 'false');
    assert.deepEqual(errors, []);
    const broken = await browser.newPage();
    await broken.route('**/state.bin.zst', route => route.abort());
    await broken.goto(`http://127.0.0.1:${server.address().port}/`);
    await broken.waitForSelector('#error:visible');
    assert.equal(await broken.locator('#vm-loader').isVisible(), false);
    assert.equal(await broken.locator('#retry').isVisible(), true);
    console.log('PASS: paced real snapshot download shows increasing segmented progress; hides on restore/error');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exit(1); });
