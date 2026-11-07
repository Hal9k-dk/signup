const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const app = readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
test("default supports verified lazy publishing with no upstream fallback", () => {
  assert.match(app, /memory_size: 128 \* 1024 \* 1024/);
  assert.match(app, /vga_memory_size: 8 \* 1024 \* 1024/);
  assert.match(app, /fetchAsset\("images\/disk.img"\)/);
  assert.match(app, /fetchAsset\("images\/state.bin"\)/);
  assert.match(app, /fetchAsset\("images\/handover.json"\)/);
  assert.match(app, /\.\.\.diskOptions/);
  assert.match(app, /Win98Disk.profile/);
  assert.match(app, /autostart: false/);
  assert.doesNotMatch(app, /windows98_state-v2|use_parts|fixed_chunk_size|base-disk.img|https:\/\//);
});
test("local master matches handover checksums, hardware, firmware and pinned v86 build", () => {
  const root = path.join(__dirname, "../public");
  const manifest = JSON.parse(readFileSync(path.join(root, "images/handover.json"), "utf8"));
  assert.equal(manifest.mode, "raw-authoring");
  assert.equal(manifest.disk_backend, "synchronous-buffer");
  assert.equal(manifest.disk_size, 512 * 1024 ** 2);
  assert.equal(manifest.memory_size, 128 * 1024 ** 2);
  assert.equal(manifest.vga_memory_size, 8 * 1024 ** 2);
  assert.equal(manifest.acpi, false);
  for (const [file, key] of [["images/disk.img", "disk_sha256"], ["images/state.bin", "state_sha256"],
    ["seabios.bin", "bios_sha256"], ["vgabios.bin", "vga_bios_sha256"]]) {
    assert.equal(createHash("sha256").update(readFileSync(path.join(root, file))).digest("hex"), manifest[key], file);
  }
  const vendor = JSON.parse(readFileSync(path.join(root, "vendor/provenance.json"), "utf8"));
  assert.deepEqual(manifest.v86_sha256, vendor.sha256);
  assert(!existsSync(path.join(root, "images/windows98")));
  assert(!existsSync(path.join(root, "images/windows98_state-v2.bin.zst")));
  assert(!existsSync(path.join(__dirname, "../fetch-images.cjs")));
});
test("active publishing snapshot and all lazy chunks match checksums", () => {
  const root = path.join(__dirname, '../public');
  const pointer = JSON.parse(readFileSync(path.join(root, 'images/published.json')));
  assert(pointer && pointer.manifest);
  const m = JSON.parse(readFileSync(path.join(root, pointer.manifest)));
  assert.equal(m.disk_backend, 'async-parts-with-overlay');
  assert(m.compressed_state_size < 32 * 1024 ** 2, 'Compressed startup snapshot exceeds 32 MiB budget');
  const compressedState = readFileSync(path.join(root, m.state));
  assert.equal(compressedState.length, m.compressed_state_size);
  assert.equal(createHash('sha256').update(compressedState).digest('hex'), m.compressed_state_sha256);
  assert.equal(Object.keys(m.chunks).length, m.disk_size / m.chunk_size);
  const baseHash = createHash('sha256');
  for (let offset = 0; offset < m.disk_size; offset += m.chunk_size) {
    const name = `${offset}-${offset + m.chunk_size}.img`;
    const bytes = readFileSync(path.join(root, m.asset_root, 'disk', name));
    assert.equal(bytes.length, m.chunk_size);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), m.chunks[name]);
    baseHash.update(bytes);
  }
  assert.equal(baseHash.digest('hex'), m.base_sha256);
});
test("networking is enabled by default, same-origin WISP with no external DNS or browser persistence", () => {
  assert.doesNotMatch(app, /localStorage|indexedDB|\/api\/signup|query.get\("network"\)/);
  assert.match(app, /net_device: \{/);
  assert.match(app, /preserve_mac_from_state_image: true/);
  assert.match(app, /location.host.*\/vm\/network\//);
  assert.match(app, /dns_method: "static"/);
  assert.match(app, /disable_speaker: false/);
});
test("hard restart is available in normal mode and preserves the current disk", () => {
  const html = readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  assert.match(html, /id="author-reboot">/);
  const restart = app.slice(app.indexOf('document.getElementById("reboot-vm").addEventListener'), app.indexOf('document.getElementById("save-state").addEventListener'));
  assert.doesNotMatch(restart, /authorMode|location.reload|restore_state/);
  assert.match(restart, /window.confirm/);
  assert.match(restart, /emulator.restart\(\)/);
});
test("Wasm is vendored with license and upstream hashes", () => {
  const wasm = readFileSync(path.join(__dirname, "../public/vendor/v86.wasm"));
  assert.deepEqual([...wasm.subarray(0, 4)], [0, 97, 115, 109]);
  const manifest = JSON.parse(readFileSync(path.join(__dirname, "../public/vendor/provenance.json"), "utf8"));
  for (const [file, hash] of Object.entries(manifest.sha256)) {
    assert.equal(createHash("sha256").update(readFileSync(path.join(__dirname, "../public/vendor/", file))).digest("hex"), hash);
  }
});
