const { test } = require("node:test");
const assert = require("node:assert/strict");
const { archive } = require("../public/handover.js");
const { readFileSync } = require("node:fs");
const path = require("node:path");
test("handover tar has valid headers, checksums, padding and exact binary contents", async () => {
  const payload = Uint8Array.from({ length: 513 }, (_, i) => i % 256);
  const bytes = new Uint8Array(await archive([["state.bin", payload], ["handover.json", "{}"]]).arrayBuffer());
  const text = (start, end) => new TextDecoder().decode(bytes.subarray(start, end)).replace(/\0.*$/, "");
  assert.equal(bytes.length % 512, 0);
  let offset = 0;
  for (const [name, size] of [["state.bin", 513], ["handover.json", 2]]) {
    assert.equal(text(offset, offset + 100), name);
    assert.equal(parseInt(text(offset + 124, offset + 136), 8), size);
    assert.equal(text(offset + 257, offset + 263), "ustar");
    const header = bytes.slice(offset, offset + 512);
    const expected = parseInt(text(offset + 148, offset + 156), 8);
    header.fill(32, 148, 156);
    assert.equal(header.reduce((sum, x) => sum + x, 0), expected);
    if (name === "state.bin") assert.deepEqual(bytes.slice(offset + 512, offset + 512 + size), payload);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  assert.equal(bytes.length - offset, 1024);
  assert(bytes.subarray(offset).every(x => x === 0));
  assert.throws(() => archive([["../bad", "x"]]));
});
test("handover action guards media, pauses once and exports synchronous matched files", () => {
  const app = readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  const action = app.split('document.getElementById("export-handover")')[1].split('document.getElementById("load-state")')[0];
  assert.match(action, /if \(mountedISO\)/);
  assert.match(action, /disk_sha256/);
  assert.match(action, /state_sha256/);
  assert.equal((action.match(/await pauseForExport\(\)/g) || []).length, 1);
  assert.match(action, /await emulator.save_state\(\)/);
  assert.match(action, /await readCurrentDisk\(\)/);
  assert.doesNotMatch(action, /base-disk\.img/);
  assert.match(action, /mode: "raw-authoring"/);
  assert.match(action, /seabios\.bin/);
  assert.doesNotMatch(action, /emulator.run\(/);
});
