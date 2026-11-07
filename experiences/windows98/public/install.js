/* Local raw-disk authoring profile, separate from the matched demo assets. */
(() => {
  "use strict";
  const MiB = 1024 * 1024;
  function validate(files) {
    const disk = files.hda;
    if (!disk || !/\.(img|raw|bin)$/i.test(disk.name) || disk.size < MiB || disk.size % 512 || disk.size > 1024 * MiB) {
      throw new Error("Vælg en komplet raw-harddisk (.img/.raw/.bin), 1 MiB–1 GiB med hele 512-byte sektorer. qcow2 understøttes ikke.");
    }
    if (files.state && (!/\.bin$/i.test(files.state.name) || !files.state.size || files.state.size > 1536 * MiB)) {
      throw new Error("Vælg et v86 .bin-snapshot (maks. 1,5 GiB), ikke et QEMU-snapshot.");
    }
    if (files.state && !files.metadata) throw new Error("Vælg også handover.json for at verificere disk/snapshot-parret.");
  }
  async function sha256(buffer) {
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
      byte => byte.toString(16).padStart(2, "0")).join("");
  }
  async function profile(files, roms, provenance) {
    validate(files);
    const disk = await files.hda.arrayBuffer();
    if (new DataView(disk).getUint32(0) === 0x514649fb) throw new Error("Dette er qcow2. Konvertér til raw med qemu-img convert -O raw.");
    const options = { boot_order: 0x132, acpi: false,
      hda: { buffer: disk }, bios: { buffer: await roms.bios.arrayBuffer() },
      vga_bios: { buffer: await roms.vga_bios.arrayBuffer() } };
    if (files.state) {
      const metadata = JSON.parse(await files.metadata.text());
      if (metadata.format !== "hal9k-windows98-handover-v2" || metadata.mode !== "raw-authoring" ||
          metadata.disk_backend !== "synchronous-buffer" || metadata.disk_size !== disk.byteLength ||
          metadata.memory_size !== 128 * MiB || metadata.vga_memory_size !== 8 * MiB ||
          metadata.acpi !== false || metadata.boot_order !== 0x132 ||
          JSON.stringify(metadata.v86_sha256) !== JSON.stringify(provenance.sha256)) {
        throw new Error("Overdragelsen matcher ikke raw-profilen eller denne v86-version.");
      }
      const state = await files.state.arrayBuffer();
      if (await sha256(disk) !== metadata.disk_sha256 || await sha256(state) !== metadata.state_sha256 ||
          await sha256(options.bios.buffer) !== metadata.bios_sha256 ||
          await sha256(options.vga_bios.buffer) !== metadata.vga_bios_sha256) {
        throw new Error("Disk, snapshot eller firmware matcher ikke overdragelsens checksums.");
      }
      options.initial_state = { buffer: state };
    }
    return options;
  }
  async function firmware() {
    const response = await fetch("vendor/bios-provenance.json", { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error("Firmware-manifest kunne ikke hentes.");
    const manifest = await response.json();
    const files = {};
    for (const [key, name] of [["bios", "seabios.bin"], ["vga_bios", "vgabios.bin"]]) {
      const rom = await fetch(name, { signal: AbortSignal.timeout(30000) });
      if (!rom.ok) throw new Error(`Firmware mangler: ${name} (HTTP ${rom.status}).`);
      const buffer = await rom.arrayBuffer();
      if (buffer.byteLength !== manifest.size[name] || await sha256(buffer) !== manifest.sha256[name]) {
        throw new Error(`Firmware-checksum er forkert: ${name}`);
      }
      files[key] = { name, size: buffer.byteLength, arrayBuffer: async () => buffer };
    }
    return files;
  }
  const api = { validate, profile, firmware, sha256 };
  if (typeof module !== "undefined") module.exports = api;
  else window.Win98Disk = api;
})();
