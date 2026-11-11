const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {importCD,CHUNK}=require('../cd-import.cjs');
test('CD import is reusable, immutable, hashes content and pads the final chunk',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cd-test-'));
 try {
  const iso=path.join(dir,'test.iso'),art=path.join(dir,'disc.jpg'),out=path.join(dir,'out');
  const bytes=Buffer.alloc(CHUNK+2048,42);
  await fs.writeFile(iso,bytes);await fs.writeFile(art,Buffer.from([255,216,255,217]));
  const manifestPath=await importCD(iso,art,out);
  const manifest=JSON.parse(await fs.readFile(manifestPath));
  assert.equal(manifest.size,bytes.length);assert.equal(manifest.chunk_size,CHUNK);
  assert.equal(Object.keys(manifest.chunks).length,2);
  const final=await fs.readFile(path.join(path.dirname(manifestPath),'disk',`${CHUNK}-${2*CHUNK}.iso`));
  assert.equal(final.length,CHUNK);assert.equal(final[2047],42);assert.equal(final[2048],0);
  assert.equal(await importCD(iso,art,out),manifestPath);
  bytes[0]=1;await fs.writeFile(iso,bytes);
  assert.notEqual(await importCD(iso,art,out),manifestPath);
  await fs.writeFile(iso,Buffer.alloc(7));
  await assert.rejects(importCD(iso,art,out),/2048/);
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('runtime CD metadata refuses cross-origin assets and invalid sector sizes',async()=>{
 const vm=require('node:vm');
 const source=await fs.readFile(path.join(__dirname,'../public/cds.js'),'utf8');
 const responses=[{format:'hal9k-cd-catalogue-v1',discs:[{manifest:'disc/manifest.json'}]},
  {format:'hal9k-cd-v1',size:2048,sector_size:2048,chunk_size:CHUNK,url:'disk/.iso',artwork:'disc.jpg'}];
 const context={window:{location:{href:'https://example.test/experiences/windows98/',origin:'https://example.test'}},URL,AbortSignal,
  fetch:async()=>({ok:true,json:async()=>responses.shift()})};
 vm.runInNewContext(source,context);
 const discs=await context.window.Win98CDs.catalogue();
 assert.equal(discs[0].options.url,'https://example.test/experiences/windows98/cds/disc/disk/.iso');
 responses.push({format:'hal9k-cd-catalogue-v1',discs:[{manifest:'https://other.test/manifest.json'}]});
 await assert.rejects(context.window.Win98CDs.catalogue(),/same-origin/);
 responses.push({format:'hal9k-cd-catalogue-v1',discs:[{manifest:'disc/manifest.json'}]},
  {format:'hal9k-cd-v1',size:7,sector_size:2048,chunk_size:CHUNK});
 await assert.rejects(context.window.Win98CDs.catalogue(),/manifest/);
});
test('canceled guest reads share an uncanceled fetch and still complete for IDE cancellation cleanup',async()=>{
 const vm=require('node:vm');const context={window:{}};
 vm.runInNewContext(await fs.readFile(path.join(__dirname,'../public/cds.js'),'utf8'),context);
 let finish,calls=0,signal;const results=[];
 const medium={fixed_chunk_size:CHUNK,byteLength:CHUNK,get_from_cache(){},
  get(offset,length,callback,options){calls++;signal=options?.signal;finish=callback;}};
 context.window.Win98CDs.protectReads(medium);
 context.window.Win98CDs.protectReads(medium);
 const abort=new AbortController();
 medium.get(0,2048,b=>results.push(b),{signal:abort.signal});
 abort.abort();
 medium.get(0,2048,b=>results.push(b),{});
 assert.equal(calls,1);assert.equal(signal,undefined);
 const data=new Uint8Array(2048);finish(data);
 assert.equal(results.length,2);
 for(const result of results) assert.deepEqual(Array.from(result),Array.from(data));
 medium.get(0,2048,()=>{},{});assert.equal(calls,2);
});
test('ATAPI PACKET backport suppresses only setup IRQs on registered CD devices',async()=>{
 const vm=require('node:vm');const context={window:{}};
 vm.runInNewContext(await fs.readFile(path.join(__dirname,'../public/cds.js'),'utf8'),context);
 class Device {
  constructor(atapi=true){this.is_atapi=atapi;this.irqs=0;this.fail=false;Object.seal(this);}
  ata_command(value){this.push_irq();if(this.fail)throw new Error('test command failure');return value;}
  push_irq(){this.irqs++;}
 }
 const cd=new Device(),other=new Device(),disk=new Device(false);
 context.window.Win98CDs.notifyChange(cd);
 context.window.Win98CDs.notifyChange(cd); // idempotent wrappers
 context.window.Win98CDs.notifyChange(disk);
 assert.equal(cd.ata_command(0xa0),0xa0);assert.equal(cd.irqs,0);
 cd.push_irq();assert.equal(cd.irqs,1); // real asynchronous completion
 cd.ata_command(0x08);assert.equal(cd.irqs,2); // resets untouched
 other.ata_command(0xa0);assert.equal(other.irqs,1);
 disk.ata_command(0xa0);assert.equal(disk.irqs,1);
 cd.fail=true;assert.throws(()=>cd.ata_command(0xa0),/test command failure/);
 cd.push_irq();assert.equal(cd.irqs,3); // suppression cleared even on throw
});
test('ATAPI media notifications invalidate cached discs without changing sealed device shape',async()=>{
 const vm=require('node:vm');
 const context={window:{}};
 vm.runInNewContext(await fs.readFile(path.join(__dirname,'../public/cds.js'),'utf8'),context);
 class Device {
  constructor(){this.buffer={};this.data=new Uint8Array(16);this.data_pointer=0;this.current_atapi_command=0;this.events=[];Object.seal(this);}
  atapi_handle(){this.events.push(['original',this.data[0]]);}
  atapi_check_condition_response(key,asc){this.events.push(['sense',key,asc]);}
  push_irq(){this.events.push(['irq']);}
 }
 const d=new Device(),other=new Device();
 context.window.Win98CDs.notifyChange(d);
 for(const command of [18,0,3,0,3,0]){d.data[0]=command;d.atapi_handle();}
 assert.deepEqual(d.events.filter(e=>e[0]==='sense'),[['sense',2,0x3a],['sense',6,0x28]]);
 assert.deepEqual(d.events.at(-1),['original',0]);
 other.atapi_handle();assert.deepEqual(other.events,[['original',0]]);
 context.window.Win98CDs.notifyChange(d);
 d.atapi_handle();assert.deepEqual(d.events.at(-2),['sense',2,0x3a]);
});
