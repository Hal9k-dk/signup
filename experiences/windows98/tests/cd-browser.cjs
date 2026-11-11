// Real guest CD mount and lazy backend reads; screenshot for guest inspection.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
 try {
  const page=await browser.newPage();const chunks=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(/\/cds\/.*\.iso$/.test(r.url()))chunks.push({url:r.url(),status:r.status()});});
  await page.addInitScript(()=>{let wrapped;Object.defineProperty(window,'V86',{configurable:true,get:()=>wrapped,set:Real=>{wrapped=function(o){const vm=new Real(o);window.cdTestVM=vm;return vm;}}});});
  await page.route('**/cds/**/*.iso', async route => {
   await new Promise(resolve=>setTimeout(resolve,300));
   await route.continue();
  });
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:8098/');
  await page.waitForSelector('#screen-container[data-ready="true"]',{timeout:90000});
  await page.waitForTimeout(8000);
  await page.evaluate(()=>{cdTestVM.keyboard_set_status(true);cdTestVM.keyboard_send_scancodes([0xe0,0x5b,0x13,0x93,0xe0,0xdb]);});
  await page.waitForTimeout(1000);
  await page.evaluate(()=>cdTestVM.keyboard_send_scancodes([0x20,0xa0,0x2a,0x34,0xb4,0xaa]));
  await page.waitForTimeout(500);
  await page.evaluate(()=>cdTestVM.keyboard_send_scancodes([0x1c,0x9c]));
  await page.waitForTimeout(8000);
  await page.locator('#screen-container').screenshot({path:'/tmp/cd-before.png'});

  await page.locator('#tools-panel').evaluate(e=>e.open=true);
  await page.waitForSelector('#cd-drive[data-state="inserted"]');
  await page.waitForSelector('[data-cd-id="windows98-se-da"]');
  page.on('dialog',()=>{throw new Error('CD swaps must not ask for confirmation');});
  await page.click('[data-cd-id="windows98-se-da"]');
  await page.waitForSelector('#cd-drive[data-state="ejecting"]');
  assert.equal(await page.evaluate(()=>cdTestVM.v86.cpu.devices.cdrom.buffer),null);
  assert(await page.locator('#cd-controls').evaluate(e=>e.disabled));
  await page.waitForSelector('#cd-drive[data-state="inserting"]');
  await page.waitForSelector('#cd-drive[data-state="settling"]');
  await page.waitForSelector('#cd-drive[data-state="inserted"]');
  assert.equal(await page.locator('[data-cd-id="windows98-se-da"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#insert-bundled').getAttribute('aria-pressed'),'false');
  await page.waitForFunction(()=>!document.querySelector('#cd-controls').disabled);
  const info=await page.evaluate(async()=>{
   // set_cdrom updates the device buffer rather than disk_images; inspect that buffer.
   const medium=cdTestVM.v86.cpu.devices.cdrom.buffer;
   const read=(offset,len)=>new Promise(resolve=>medium.get(offset,len,b=>resolve(Array.from(b))));
   const abort=new AbortController();
   const canceled=new Promise(resolve=>medium.get(16*2048,2048,resolve,{signal:abort.signal}));
   abort.abort();
   const descriptor=await read(16*2048,2048);
   await canceled;
   const cross=await read(262144-2048,4096);
   const tail=await read(medium.byteLength-2048,2048);
   return {size:medium.byteLength,signature:String.fromCharCode(...descriptor.slice(1,6)),cross:cross.length,tail:tail.length};
  });
  assert.equal(info.signature,'CD001');assert.equal(info.cross,4096);assert.equal(info.tail,2048);
  await page.evaluate(()=>{cdTestVM.keyboard_set_status(true);cdTestVM.keyboard_send_scancodes([0xe0,0x5b,0x13,0x93,0xe0,0xdb]);});
  await page.waitForTimeout(1000);
  // Danish guest keyboard: colon is Shift+period (US text helper is unsuitable).
  await page.evaluate(()=>cdTestVM.keyboard_send_scancodes([0x20,0xa0,0x2a,0x34,0xb4,0xaa]));
  await page.waitForTimeout(500);
  await page.evaluate(()=>cdTestVM.keyboard_send_scancodes([0x1c,0x9c]));
  await page.waitForTimeout(12000);
  await page.locator('#screen-container').screenshot({path:'/tmp/hal9k-cd-guest.png'});
  assert(chunks.length>0);assert(chunks.every(c=>c.status===200));assert.deepEqual(errors,[]);
  const allDiscs=await page.evaluate(()=>window.Win98CDs.catalogue());
  assert(chunks.length < allDiscs[0].options.size / 262144 / 10, 'CD must remain lazy');
  await page.click('#insert-bundled');
  await page.waitForFunction(()=>document.querySelector('#cd-status').textContent==='HAL9K-CD');
  await page.waitForSelector('#cd-drive[data-state="inserted"]');
  await page.click('[data-cd-id="windows98-se-da"]');
  await page.waitForFunction(()=>document.querySelector('#cd-status').textContent.includes('Windows 98 SE'));
  console.log(JSON.stringify({info,chunkRequests:chunks.length,screenshot:'/tmp/hal9k-cd-guest.png'}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
