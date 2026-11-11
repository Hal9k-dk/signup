// Real guest playback and cold seek; no RAM ISO or pre-warmed whole-disc cache.
const {chromium,firefox}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await (process.env.FIREFOX?firefox.launch():chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'}));
 const label=process.env.FIREFOX?'firefox':'chromium';
 const delay=Number(process.env.CD_DELAY_MS||10);
 try {
  const page=await browser.newPage();let reads=0,failed=0;
  page.on('pageerror',e=>console.error('PAGE ERROR',e.message));
  page.on('requestfailed',r=>{if(/\/cds\/.*\.iso/.test(r.url()))failed++;});
  page.on('response',r=>{if(/\/cds\/.*\.iso/.test(r.url()))reads++;});
  await page.addInitScript(()=>{
   let wrapped;
   Object.defineProperty(window,'V86',{get:()=>wrapped,set:Real=>wrapped=function(options){return window.vm=new Real(options);}});
  });
  // Only delay CD part files, not the matched hard disk or snapshot.
  await page.route('**/cds/**/*.iso',async route=>{
   await new Promise(resolve=>setTimeout(resolve,delay));await route.continue();
  });
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:8098/');
  await page.waitForSelector('#cd-drive[data-state="inserted"]',{timeout:90000});
  await page.waitForFunction(()=>!document.querySelector('#cd-controls').disabled);
  await page.click('[data-cd-id="windows98-se-da"]');
  await page.waitForSelector('#cd-drive[data-state="inserted"]');
  await page.waitForFunction(()=>!document.querySelector('#cd-controls').disabled);
  const key=codes=>page.evaluate(c=>{vm.keyboard_set_status(true);vm.keyboard_send_scancodes(c);},codes);
  const run=[0xe0,0x5b,0x13,0x93,0xe0,0xdb];
  // Danish layout: colon = Shift+period, backslash = AltGr+ISO key.
  // Open the root first to let Windows finish recognizing the inserted volume.
  await key(run);await page.waitForTimeout(1000);
  await key([0x20,0xa0,0x2a,0x34,0xb4,0xaa]);
  await key([0x1c,0x9c]);await page.waitForTimeout(5000);
  await key(run);await page.waitForTimeout(1000);await key([0x1d,0x1e,0x9e,0x9d]);
  await page.evaluate(()=>vm.keyboard_send_text('D'));
  await key([0x2a,0x34,0xb4,0xaa]);
  for(const name of ['cdsample','videos','open.avi']){
   await key([0xe0,0x38,0x56,0xd6,0xe0,0xb8]);
   // These names contain only letters unchanged by Danish vs US layout and '.'.
   await page.evaluate(t=>vm.keyboard_send_text(t),name);
  }
  await key([0x1c,0x9c]);await page.waitForTimeout(4000);
  const samples=[];
  for(let i=0;i<2;i++){
   await page.waitForTimeout(5000);samples.push(reads);
   await page.locator('#screen-container').screenshot({path:`/tmp/cd-video-${label}-${i}.png`});
  }
  assert(samples[1]>samples[0]+1,'video must actually open and continue reading chunks before seeking');
  await page.evaluate(()=>Win98CDs.debugStart());
  // Relative PS/2 movement: pin to upper left, then target seek bar near 80%.
  // This is the prepared 800x600 guest/player geometry, not host CSS pixels.
  const move=async(x,y,n)=>{for(let i=0;i<n;i++){
   await page.evaluate(([dx,dy])=>vm.bus.send('mouse-delta',[dx,dy]),[x,y]);await page.waitForTimeout(20);
  }};
  await move(-100,100,20);await move(5,-5,52);await move(5,0,2);
  await page.evaluate(()=>vm.bus.send('mouse-click',[true,false,false]));await page.waitForTimeout(100);
  await page.evaluate(()=>vm.bus.send('mouse-click',[false,false,false]));
  await page.waitForTimeout(5000);
  await page.locator('#screen-container').screenshot({path:`/tmp/cd-video-${label}-seek.png`});
  await key(run);await page.waitForTimeout(1000);
  await page.locator('#screen-container').screenshot({path:`/tmp/cd-video-${label}-responsive.png`});
  await page.evaluate(()=>Win98CDs.debugStop());
  const dump=await page.evaluate(()=>Win98CDs.debugDump());
  await fs.writeFile(`/tmp/cd-video-${label}-trace.json`,dump);
  const events=JSON.parse(dump).events;
  const cold=events.filter(e=>e.event==='media-read'&&!e.cached);
  assert(cold.length,'seek must expose an uncached read');
  // The target must be beyond the sequential read position (not just read-ahead).
  const firstRead=events.find(e=>e.event==='media-read');
  assert(cold.some(e=>e.offset>firstRead.offset+1024*1024),'seek must jump beyond bounded read-ahead');
  const target=cold.find(e=>e.offset>firstRead.offset+1024*1024);
  assert(events.some(e=>e.event==='ide-read-complete'&&e.offset===target.offset),'cold seek read must complete');
  assert(events.some(e=>e.event==='media-read'&&e.ms>target.ms+1000),'guest must keep reading after cold seek');
  assert.equal(events.filter(e=>e.event==='device_reset').length,0,'no reset while seeking');
  assert.equal(await page.evaluate(()=>vm.v86.cpu.devices.cdrom.status_reg),80,'CD must finish ready, not stuck in reset');
  assert.equal(failed,0);assert(reads<200,'must not download the whole ISO');
  console.log('PASS: playback and uncached seek',JSON.stringify({browser:label,delay,samples,reads,cold:target.offset}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
