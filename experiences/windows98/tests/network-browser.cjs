// Tests the vendored v86 WISP adapter against Go, not a Windows Winsock client.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium'});
 try {
  const page = await browser.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(() => {
   let wrapped;
   Object.defineProperty(window,'V86',{configurable:true,
    get:()=>wrapped,
    set:Real=>{wrapped=function(options){ const vm=new Real(options);window.networkTestVM=vm;return vm; }}
   });
  });
  await page.goto(process.env.BASE_URL || 'http://localhost:8080/');
  await page.waitForSelector('#screen-container[data-ready="true"]',{timeout:90000});
  await page.waitForFunction(()=>window.networkTestVM?.network_adapter?.connections[0].congestion>0);
  const result=await page.evaluate(async()=>{
   const vm=window.networkTestVM, adapter=vm.network_adapter;
   vm.stop();
   async function request(id,host,text){return new Promise(resolve=>{
    let data=''; const timer=setTimeout(()=>resolve({timeout:true}),5000);
    adapter.send_wisp_frame({type:'CONNECT',stream_id:id,hostname:host,port:80,
     data_callback:bytes=>{data+=new TextDecoder().decode(bytes)},
     close_callback:reason=>{clearTimeout(timer);resolve({data,reason})}});
    if(text)adapter.send_wisp_frame({type:'DATA',stream_id:id,data:new TextEncoder().encode(text)});
   });}
   return {
    health:await request(100000,'192.168.86.2','GET /health HTTP/1.0\r\nHost: 192.168.86.2\r\n\r\n'),
    blocked:await request(100001,'127.0.0.1'),
    validation:await request(100002,'192.168.86.2','POST /api/signup HTTP/1.0\r\nHost: 192.168.86.2\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}'),
   };
  });
  assert.match(result.health.data,/200 OK/);assert.match(result.health.data,/HAL9K VM network ready/);
  assert.equal(result.blocked.reason,0x48);
  assert.match(result.validation.data,/422/);
  assert.deepEqual(errors,[]);
  console.log('PASS: actual vendored v86 WISP adapter + Go health/blocked destination/signup validation; Windows guest networking not yet tested');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
