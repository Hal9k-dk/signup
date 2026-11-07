// Repeatable offline pipeline. Never reinterpret a synchronous state as async.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const publicRoot = path.join(__dirname, 'public');
const CHUNK = 256 * 1024;
function unpack(archive, dest) {
  const names = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' }).trim().split('\n');
  if (names.some(n => !/^[A-Za-z0-9_.-]+$/.test(n) || n === '..') || new Set(names).size !== names.length) throw Error('Unsafe archive names');
  // Only extract expected regular-file entries; reject links/devices via listing.
  const listing = execFileSync('tar', ['-tvf', archive], { encoding: 'utf8' });
  if (listing.trim().split('\n').some(line => !line.startsWith('-'))) throw Error('Archive must contain regular files only');
  execFileSync('tar', ['-xf', archive, '-C', dest, '--no-same-owner']);
}
function chunks(file, dest) {
  fs.mkdirSync(dest);
  const fd = fs.openSync(file, 'r');
  const size = fs.statSync(file).size;
  if (!size || size % CHUNK || size > 1024 ** 3) throw Error('Disk must be <=1 GiB and aligned to 256 KiB');
  const sha256 = {};
  try {
    for (let offset = 0; offset < size; offset += CHUNK) {
      const buffer = Buffer.alloc(CHUNK);
      if (fs.readSync(fd, buffer, 0, CHUNK, offset) !== CHUNK) throw Error('Short disk read');
      const name = `${offset}-${offset + CHUNK}.img`;
      fs.writeFileSync(path.join(dest, name), buffer);
      sha256[name] = crypto.createHash('sha256').update(buffer).digest('hex');
    }
  } finally { fs.closeSync(fd); }
  return sha256;
}
function run(command, archive, version, activate) {
  if (command === 'activate') {
    const name = archive;
    if (!/^[a-zA-Z0-9_-]+$/.test(name || '')) throw Error('Usage: node publish.cjs activate VERSION');
    const root = path.join(publicRoot, 'publishing', name);
    const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
    if (m.format !== 'hal9k-windows98-publish-v1' || !m.state || hash(path.join(root, 'state.bin.zst')) !== m.compressed_state_sha256) throw Error('Invalid published snapshot');
    for (const [file, expected] of Object.entries(m.chunks)) {
      if (!/^[0-9]+-[0-9]+\.img$/.test(file) || hash(path.join(root, 'disk', file)) !== expected) throw Error('Invalid disk chunk');
    }
    const target = path.join(publicRoot, 'images/published.json');
    fs.writeFileSync(target + '.tmp', JSON.stringify({ manifest: `publishing/${name}/manifest.json` }));
    fs.renameSync(target + '.tmp', target);
    console.log('Activated ' + name + '. Previous version assets retained for rollback.');
    return;
  }
  if (!['prepare', 'finalize'].includes(command) || !archive || !/^[a-zA-Z0-9_-]+$/.test(version || '')) throw Error('Usage: node publish.cjs prepare|finalize HANDOVER.tar VERSION [--activate]');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hal9k-publish-'));
  const dest = path.join(publicRoot, 'publishing', version);
  let created = false;
  try {
    unpack(path.resolve(archive), temp);
    const m = JSON.parse(fs.readFileSync(path.join(temp, 'handover.json')));
    const vendor = JSON.parse(fs.readFileSync(path.join(publicRoot, 'vendor/provenance.json')));
    if (JSON.stringify(m.v86_sha256) !== JSON.stringify(vendor.sha256) || m.memory_size !== 128 * 1024 ** 2 || m.vga_memory_size !== 8 * 1024 ** 2 || m.acpi !== false || m.boot_order !== 0x132) throw Error('Hardware/emulator mismatch');
    const diskName = command === 'prepare' ? 'disk.img' : 'base-disk.img';
    const expected = command === 'prepare' ? m.disk_sha256 : m.base_sha256;
    if (hash(path.join(temp, diskName)) !== expected || fs.statSync(path.join(temp, diskName)).size !== m.disk_size) throw Error('Disk checksum/size mismatch');
    if (command === 'prepare' && (m.format !== 'hal9k-windows98-handover-v2' || m.mode !== 'raw-authoring')) throw Error('Prepare requires raw v2 handover');
    if (command === 'finalize' && (m.format !== 'hal9k-windows98-publish-v1' || m.disk_backend !== 'async-parts-with-overlay' || hash(path.join(temp, 'state.bin')) !== m.state_sha256)) throw Error('Finalize requires async publishing capture');
    for (const [name, key] of [['seabios.bin', 'bios_sha256'], ['vgabios.bin', 'vga_bios_sha256']]) {
      if (hash(path.join(publicRoot, name)) !== m[key]) throw Error('Firmware mismatch');
    }
    if (fs.existsSync(dest)) throw Error('Version already exists; use a new immutable version');
    fs.mkdirSync(dest, { recursive: true }); created = true;
    const chunkHashes = chunks(path.join(temp, diskName), path.join(dest, 'disk'));
    const manifest = { ...m, base_sha256: expected, chunk_size: CHUNK, chunks: chunkHashes,
      asset_root: `publishing/${version}/`, disk_template: `publishing/${version}/disk/.img`,
      format: 'hal9k-windows98-publish-v1', disk_backend: 'async-parts-with-overlay', state: null };
    if (command === 'finalize') {
      execFileSync('zstd', ['-q', '-f', '-19', path.join(temp, 'state.bin'), '-o', path.join(dest, 'state.bin.zst')]);
      manifest.state = `publishing/${version}/state.bin.zst`;
      manifest.compressed_state_sha256 = hash(path.join(dest, 'state.bin.zst'));
      manifest.compressed_state_size = fs.statSync(path.join(dest, 'state.bin.zst')).size;
    }
    fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const pointer = { manifest: `publishing/${version}/manifest.json` };
    fs.writeFileSync(path.join(dest, 'pointer.json'), JSON.stringify(pointer));
    if (command === 'prepare') {
      fs.writeFileSync(path.join(publicRoot, 'publishing/draft.json'), JSON.stringify(pointer));
      console.log('Prepared lazy disk. Open ?publish=1, boot Windows, settle at welcome screen, eject CDs and export publishing capture. The supplied raw snapshot is NOT used. Clean shutdown before disk handover is recommended.');
    } else {
      console.log(`Compressed snapshot: ${(manifest.compressed_state_size / 1024 ** 2).toFixed(2)} MiB. Test ?published=${version} before activation.`);
      if (activate) {
        const pointerFile = path.join(publicRoot, 'images/published.json');
        fs.writeFileSync(pointerFile + '.tmp', JSON.stringify(pointer));
        fs.renameSync(pointerFile + '.tmp', pointerFile);
        console.log('Activated lazy default. Keep previous version and source handovers for rollback.');
      }
    }
  } catch (error) { if (created) fs.rmSync(dest, { recursive: true, force: true }); throw error; }
  finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
if (require.main === module) { try { run(process.argv[2], process.argv[3], process.argv[4], process.argv.includes('--activate')); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { run, chunks };
