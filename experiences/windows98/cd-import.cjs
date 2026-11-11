#!/usr/bin/env node
// Reusable, immutable v86 part-file publisher. Never changes the VM release.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const CHUNK = 256 * 1024;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function importCD(iso, artwork, output) {
  const stat = await fs.stat(iso);
  if (!stat.size || stat.size % 2048) throw new Error('ISO must contain complete 2048-byte sectors');
  const parent = path.dirname(output);
  await fs.mkdir(parent, {recursive:true});
  const stage = await fs.mkdtemp(path.join(parent, '.cd-import-'));
  const input = await fs.open(iso, 'r');
  try {
    await fs.mkdir(path.join(stage, 'disk'));
    const hash = crypto.createHash('sha256'), chunks = {};
    for (let offset = 0; offset < stat.size; offset += CHUNK) {
      const length = Math.min(CHUNK, stat.size - offset);
      const bytes = Buffer.alloc(CHUNK); // Pad final part for v86's fixed-size cache.
      let read = 0;
      while (read < length) {
        const result = await input.read(bytes, read, length - read, offset + read);
        if (!result.bytesRead) throw new Error('ISO changed or truncated during import');
        read += result.bytesRead;
      }
      hash.update(bytes.subarray(0, length));
      const name = `${offset}-${offset + CHUNK}.iso`;
      await fs.writeFile(path.join(stage, 'disk', name), bytes);
      chunks[name] = sha(bytes);
    }
    const digest = hash.digest('hex');
    const art = await fs.readFile(artwork);
    if (art[0] !== 255 || art[1] !== 216) throw new Error('Artwork must be JPEG');
    await fs.writeFile(path.join(stage, 'disc.jpg'), art);
    const manifest = {format:'hal9k-cd-v1', size:stat.size, sector_size:2048,
      chunk_size:CHUNK, sha256:digest, url:'disk/.iso', artwork:'disc.jpg',
      artwork_sha256:sha(art), chunks};
    await fs.writeFile(path.join(stage, 'manifest.json'), JSON.stringify(manifest,null,2)+'\n');
    // Full ISO and artwork identities make URLs immutable across re-imports.
    const version = `${digest}-${sha(art)}`;
    const target = path.join(output, version);
    await fs.mkdir(output, {recursive:true});
    try { await fs.rename(stage, target); }
    catch (e) { if (!['EEXIST','ENOTEMPTY'].includes(e.code)) throw e; }
    return path.join(target, 'manifest.json');
  } finally { await input.close(); await fs.rm(stage,{recursive:true,force:true}); }
}
module.exports = {importCD, CHUNK};
if (require.main === module) {
  const [iso, artwork, output] = process.argv.slice(2);
  if (!iso || !artwork || !output) { console.error('Usage: node cd-import.cjs IMAGE.iso DISC.jpg OUTPUT_DIRECTORY'); process.exitCode=1; }
  else importCD(iso,artwork,output).then(p=>console.log(p)).catch(e=>{console.error(e.message);process.exitCode=1;});
}
