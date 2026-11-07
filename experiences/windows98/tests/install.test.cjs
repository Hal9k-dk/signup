const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validate, profile, firmware, sha256 } = require("../public/install.js");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const file = (name, bytes) => ({ name, size: bytes.byteLength, arrayBuffer: async () => bytes });
const disk = () => file("qemu.img", new ArrayBuffer(1024 * 1024));
const roms = { bios: file("seabios.bin", new ArrayBuffer(128)), vga_bios: file("vgabios.bin", new ArrayBuffer(64)) };
const provenance = { sha256: { "libv86.js": "test-js", "v86.wasm": "test-wasm" } };
test("raw profile uses supplied disk, bundled firmware, IDE boot and no installation media", async () => {
  const hda = disk();
  const p = await profile({ hda }, roms, provenance);
  assert.equal(p.hda.buffer, await hda.arrayBuffer());
  assert.equal(p.boot_order, 0x132);
  assert.equal(p.acpi, false);
  assert.equal(p.initial_state, undefined);
  assert.equal(p.hda.url, undefined);
  assert.equal(p.cdrom, undefined);
  assert.equal(p.fda, undefined);
});
test("rejects missing/misaligned/oversize raw files and qcow2", async () => {
  assert.throws(() => validate({}));
  assert.throws(() => validate({ hda: { name: "a.img", size: 1024 * 1024 + 1 } }));
  assert.throws(() => validate({ hda: { name: "a.img", size: 2 * 1024 ** 3 } }));
  assert.throws(() => validate({ hda: disk(), state: file("state.bin", new ArrayBuffer(1)) }));
  const qcow = disk();
  new DataView(await qcow.arrayBuffer()).setUint32(0, 0x514649fb);
  await assert.rejects(profile({ hda: qcow }, roms, provenance), /qcow2/);
});
test("restores only a checksum-matched raw disk/v86 state pair with matching hardware/build", async () => {
  const hda = disk();
  const state = file("state.bin", new ArrayBuffer(32));
  const metadata = {
    format: "hal9k-windows98-handover-v2", mode: "raw-authoring", disk_backend: "synchronous-buffer",
    disk_size: hda.size, memory_size: 128 * 1024 ** 2, vga_memory_size: 8 * 1024 ** 2,
    acpi: false, boot_order: 0x132,
    v86_sha256: provenance.sha256,
    disk_sha256: await sha256(await hda.arrayBuffer()), state_sha256: await sha256(await state.arrayBuffer()),
    bios_sha256: await sha256(await roms.bios.arrayBuffer()), vga_bios_sha256: await sha256(await roms.vga_bios.arrayBuffer()),
  };
  const files = { hda, state, metadata: { text: async () => JSON.stringify(metadata) } };
  const p = await profile(files, roms, provenance);
  assert.equal(p.initial_state.buffer, await state.arrayBuffer());
  metadata.mode = "snapshot-preview";
  await assert.rejects(profile(files, roms, provenance), /matcher ikke raw/);
  metadata.mode = "raw-authoring";
  metadata.state_sha256 = "bad";
  await assert.rejects(profile(files, roms, provenance), /checksums/);
});
test("automatic firmware loader verifies actual bundled ROMs and reports missing/corrupt files", async (t) => {
  const root = path.join(__dirname, "../public");
  t.mock.method(globalThis, "fetch", async url => new Response(readFileSync(path.join(root, url))));
  const loaded = await firmware();
  assert.equal(loaded.bios.size, 131072);
  assert.equal(loaded.vga_bios.size, 36352);
  const vga = new Uint8Array(await loaded.vga_bios.arrayBuffer());
  assert.deepEqual([...vga.slice(0, 2)], [0x55, 0xaa]);
  t.mock.method(globalThis, "fetch", async url => url === "seabios.bin"
    ? new Response(new Uint8Array(131072)) : new Response(readFileSync(path.join(root, url))));
  await assert.rejects(firmware(), /checksum/);
  t.mock.method(globalThis, "fetch", async () => new Response("", { status: 404 }));
  await assert.rejects(firmware(), /manifest/);
});
