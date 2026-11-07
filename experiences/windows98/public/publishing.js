/* Lazy publishing profile and portable async capture. */
(() => {
  'use strict';
  async function json(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(85000) });
    if (!response.ok) throw Error(`Publishing file missing: ${url}`);
    return response.json();
  }
  async function load(pointer, draft, progress = () => {}) {
    progress('Forbereder Windows 98…');
    const p = await json(pointer);
    if (!/^publishing\/[a-zA-Z0-9_-]+\/manifest\.json$/.test(p.manifest)) throw Error('Invalid publishing pointer');
    const manifest = await json(p.manifest);
    const provenance = await json('vendor/provenance.json');
    if (manifest.format !== 'hal9k-windows98-publish-v1' || manifest.disk_backend !== 'async-parts-with-overlay' ||
        manifest.memory_size !== 128 * 1024 ** 2 || manifest.vga_memory_size !== 8 * 1024 ** 2 ||
        manifest.chunk_size !== 256 * 1024 || manifest.acpi !== false || manifest.boot_order !== 0x132 ||
        JSON.stringify(manifest.v86_sha256) !== JSON.stringify(provenance.sha256) ||
        manifest.disk_template !== manifest.asset_root + 'disk/.img' ||
        !/^publishing\/[a-zA-Z0-9_-]+\/$/.test(manifest.asset_root)) throw Error('Incompatible publishing profile');
    const roms = await Win98Disk.firmware();
    const options = { boot_order: 0x132, acpi: false,
      bios: { buffer: await roms.bios.arrayBuffer() }, vga_bios: { buffer: await roms.vga_bios.arrayBuffer() },
      hda: { url: manifest.disk_template, size: manifest.disk_size, async: true, fixed_chunk_size: manifest.chunk_size, use_parts: true } };
    if (await Win98Disk.sha256(options.bios.buffer) !== manifest.bios_sha256 || await Win98Disk.sha256(options.vga_bios.buffer) !== manifest.vga_bios_sha256) throw Error('Publishing BIOS mismatch');
    if (!draft) {
      if (manifest.state !== manifest.asset_root + 'state.bin.zst') throw Error('Missing publishing snapshot; no cold boot fallback');
      const response = await fetch(manifest.state, { signal: AbortSignal.timeout(85000) });
      if (!response.ok) throw Error('Publishing snapshot missing');
      const total = manifest.compressed_state_size;
      progress('Henter hukommelsessnapshot…', 0, total);
      let state;
      if (response.body && total > 0) {
        const bytes = new Uint8Array(total);
        const reader = response.body.getReader();
        let loaded = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (loaded + value.byteLength > total) { await reader.cancel(); throw Error('Publishing snapshot size mismatch'); }
          bytes.set(value, loaded);
          loaded += value.byteLength;
          progress('Henter hukommelsessnapshot…', loaded, total);
        }
        if (loaded !== total) throw Error('Publishing snapshot size mismatch');
        state = bytes.buffer;
      } else state = await response.arrayBuffer();
      progress('Kontrollerer snapshot…');
      if (await Win98Disk.sha256(state) !== manifest.compressed_state_sha256) throw Error('Publishing snapshot checksum mismatch');
      options.initial_state = { buffer: state };
    }
    return { options, manifest };
  }
  async function capture(manifest, options, state, image) {
    const parts = [];
    for (let offset = 0; offset < manifest.disk_size; offset += manifest.chunk_size) {
      const name = `${offset}-${offset + manifest.chunk_size}.img`;
      const response = await fetch(manifest.asset_root + 'disk/' + name, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw Error('Base disk chunk missing: ' + name);
      const bytes = await response.arrayBuffer();
      if (await Win98Disk.sha256(bytes) !== manifest.chunks[name]) throw Error('Base disk chunk corrupt: ' + name);
      parts.push(bytes);
    }
    const base = new Blob(parts);
    const metadata = { ...manifest, state_sha256: await Win98Disk.sha256(state), disk_sha256: await Win98Disk.sha256(await image.arrayBuffer()) };
    return [['base-disk.img', base], ['disk.img', image], ['state.bin', state],
      ['handover.json', JSON.stringify(metadata, null, 2)],
      ['seabios.bin', options.bios.buffer], ['vgabios.bin', options.vga_bios.buffer],
      ['README.txt', 'Async publishing capture. Preserve base-disk.img with state.bin overlays. disk.img is a merged disk for authoring/cold boot, NOT the restore base. Run publish.cjs finalize on this archive.\n']];
  }
  window.Win98Publishing = { load, capture };
})();
