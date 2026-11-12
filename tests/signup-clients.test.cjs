const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

for (const experience of ['frontpage98', 'physics', 'survey', 'terminal']) {
  test(`${experience} submits its fixed experience identifier`, async () => {
    let request;
    const context = vm.createContext({
      AbortController,
      setTimeout: () => 1,
      clearTimeout: () => {},
      FormData: class {
        constructor(form) { return Object.entries(form); }
      },
      fetch: async (url, options) => {
        request = { url, options };
        return { ok: true, json: async () => ({ message: 'Received' }) };
      },
    });
    const filename = path.join(__dirname, '..', 'experiences', experience, 'public', 'signup-client.js');
    vm.runInContext(fs.readFileSync(filename, 'utf8').replace('export async function', 'async function'), context);
    // Client-owned attribution must override any form or payload value.
    const input = { firstName: 'Ada', experience: 'incorrect' };
    const result = await context.submitSignup(input);
    assert.equal(request.url, '/api/signup');
    assert.equal(request.options.method, 'POST');
    assert.deepEqual(JSON.parse(request.options.body), { firstName: 'Ada', experience });
    assert.equal(input.experience, 'incorrect');
    assert.equal(result.ok, true);
  });
}
