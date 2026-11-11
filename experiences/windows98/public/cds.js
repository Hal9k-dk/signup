/* global window */
(() => {
  'use strict';
  let tracing = false;
  let traceStart = 0;
  let traceRows = [];
  let traceDevice;
  let traceTimer;
  function record(event, details = {}) {
    if (!tracing) return;
    traceRows.push({ms:Math.round(performance.now() - traceStart), event, ...details});
    if (traceRows.length > 2000) traceRows.shift();
  }
  function deviceState(device) {
    return {status:device.status_reg, error:device.error_reg,
      command:device.current_command, atapi:device.current_atapi_command,
      sense:device.atapi_sense_key, asc:device.atapi_add_sense,
      dma:device.channel?.dma_status, pointer:device.data_pointer,
      end:device.data_end, length:device.data_length,
      pendingIO:device.in_progress_io_ids?.size, canceledIO:device.cancelled_io_ids?.size};
  }
  function debugStart() {
    traceRows = [];
    traceStart = performance.now();
    tracing = true;
    clearInterval(traceTimer);
    record('start', {userAgent:window.navigator?.userAgent});
    if (traceDevice) record('device', deviceState(traceDevice));
    traceTimer = setInterval(() => {
      if (traceDevice) record('heartbeat', deviceState(traceDevice));
    }, 1000);
    console.info('[CD debug] Recording. Reproduce playback/seek, then run Win98CDs.debugDump()');
  }
  function debugDump() {
    const text = JSON.stringify({format:'hal9k-cd-debug-v1', events:traceRows}, null, 2);
    console.log(text);
    return text;
  }
  function debugStop() {
    record('stop');
    tracing = false;
    clearInterval(traceTimer);
  }
  const debugPrototypes = new WeakSet();
  function instrumentDevice(device) {
    traceDevice = device;
    const prototype = Object.getPrototypeOf(device);
    if (debugPrototypes.has(prototype)) return;
    debugPrototypes.add(prototype);
    for (const name of ['atapi_handle', 'read_buffer', 'cancel_io_operations', 'device_reset', 'do_atapi_dma']) {
      const original = prototype[name];
      if (typeof original !== 'function') continue;
      prototype[name] = function (...args) {
        if (!tracing || this !== traceDevice) return original.apply(this, args);
        const details = deviceState(this);
        if (name === 'atapi_handle') details.packet = Array.from(this.data.slice(0, 12));
        if (name === 'read_buffer') {
          details.offset = args[0]; details.bytes = args[1];
          const callback = args[2], offset = args[0], bytes = args[1];
          args[2] = data => {
            record('ide-read-complete', {offset, bytes, ...deviceState(this)});
            callback(data);
          };
        }
        record(name, details);
        return original.apply(this, args);
      };
    }
  }
  function local(value, base) {
    const url = new URL(value, base);
    if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol) || url.username || url.password) {
      throw new Error('CD-assets skal være same-origin.');
    }
    return url.href;
  }
  async function json(url) {
    const response = await fetch(url, {signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`CD-metadata: HTTP ${response.status}`);
    return response.json();
  }
  async function catalogue() {
    const base = new URL('cds/catalogue.json', window.location.href).href;
    const data = await json(base);
    if (data.format !== 'hal9k-cd-catalogue-v1' || !Array.isArray(data.discs)) throw new Error('Ugyldigt CD-katalog.');
    return Promise.all(data.discs.map(async disc => {
      const manifestURL = local(disc.manifest, base);
      const media = await json(manifestURL);
      if (media.format !== 'hal9k-cd-v1' || !Number.isSafeInteger(media.size) || media.size <= 0 || media.size % 2048 ||
          media.sector_size !== 2048 || media.chunk_size !== 262144) throw new Error('Ugyldigt CD-manifest.');
      return {...disc, artwork:local(media.artwork, manifestURL),
        options:{url:local(media.url, manifestURL), size:media.size,
          async:true, use_parts:true, fixed_chunk_size:media.chunk_size}};
    }));
  }
  // Guest command cancellation must not cancel the underlying chunk fetch:
  // repeated short-lived IDE reads otherwise restart the same download forever.
  // IDE.read_buffer already suppresses callbacks for canceled guest operations.
  const protectedMedia = new WeakSet();
  function protectReads(medium) {
    if (protectedMedia.has(medium)) return;
    protectedMedia.add(medium);
    const get = medium.get;
    const pending = new Map();
    const chunkSize = medium.fixed_chunk_size;
    let speculative = 0;
    function chunk(offset, done) {
      const cached = medium.get_from_cache(offset, chunkSize);
      if (cached) { done(cached); return; }
      if (pending.has(offset)) { record('chunk-join', {offset}); pending.get(offset).push(done); return; }
      pending.set(offset, [done]);
      const started = Date.now();
      record('chunk-fetch', {offset, bytes:Math.min(chunkSize, medium.byteLength - offset), pending:pending.size});
      get.call(medium, offset, Math.min(chunkSize, medium.byteLength - offset), bytes => {
        record('chunk-arrived', {offset, bytes:bytes.length, elapsed:Date.now()-started});
        const callbacks = pending.get(offset);
        pending.delete(offset);
        for (const callback of callbacks) callback(bytes);
      }); // Deliberately no guest AbortSignal.
    }
    function ahead(offset) {
      // Bounded 1 MiB look-ahead; never recursively prefetch the whole disc.
      for (let i = 0; i < 4 && speculative < 4 && offset < medium.byteLength; i++, offset += chunkSize) {
        if (pending.has(offset) || medium.get_from_cache(offset, chunkSize)) continue;
        speculative++;
        chunk(offset, () => { speculative--; });
      }
    }
    medium.get = function (offset, length, callback, options) {
      const cached = this.get_from_cache(offset, length);
      if (tracing) {
        record('media-read', {offset, bytes:length, cached:!!cached});
        options?.signal?.addEventListener('abort', () => record('guest-abort', {offset, bytes:length}), {once:true});
      }
      const end = Math.ceil((offset + length) / chunkSize) * chunkSize;
      if (cached) { ahead(end); callback(cached); return; }
      const first = Math.floor(offset / chunkSize) * chunkSize;
      const output = new Uint8Array(length);
      let remaining = (end - first) / chunkSize;
      for (let start = first; start < end; start += chunkSize) {
        chunk(start, bytes => {
          const from = Math.max(offset, start);
          const to = Math.min(offset + length, start + bytes.length);
          output.set(bytes.subarray(from - start, to - start), from - offset);
          if (--remaining === 0) { ahead(end); callback(output); }
        });
      }
    };
  }

  // Backport copy/v86 73077e92bf0d: PACKET setup is polled, not an IRQ
  // completion. A stale setup IRQ can make Win9x reset a still-pending read.
  // Scope suppression to the synchronous ATA PACKET setup call only; real
  // data-ready interrupts, guest resets and canceled-read handling are unchanged.
  // Keep the pinned JS/Wasm/snapshot pair and sealed device shapes intact.
  const packetDevices = new WeakSet();
  const packetPrototypes = new WeakSet();
  function fixPacketIRQ(device) {
    const prototype = Object.getPrototypeOf(device);
    if (typeof prototype.ata_command !== 'function' || typeof prototype.push_irq !== 'function') return;
    packetDevices.add(device);
    if (packetPrototypes.has(prototype)) return;
    packetPrototypes.add(prototype);
    const command = prototype.ata_command;
    const irq = prototype.push_irq;
    const receiving = new WeakSet();
    prototype.ata_command = function (value) {
      if (!packetDevices.has(this) || !this.is_atapi || value !== 0xa0) return command.call(this, value);
      const nested = receiving.has(this);
      receiving.add(this);
      try { return command.call(this, value); }
      finally { if (!nested) receiving.delete(this); }
    };
    prototype.push_irq = function () {
      if (!receiving.has(this)) return irq.call(this);
    };
  }

  // Compatibility shim for the pinned v86 ATAPI implementation: its
  // medium_changed flag is not reported to polling SCSI guests. Preserve the
  // vendored build/snapshot identity and add only runtime media notifications.
  const notifications = new WeakMap();
  const patched = new WeakSet();
  function notifyChange(device) {
    fixPacketIRQ(device);
    instrumentDevice(device);
    record('media-change', {bytes:device.buffer?.byteLength});
    const prototype = Object.getPrototypeOf(device);
    if (!patched.has(prototype)) {
      const handle = prototype.atapi_handle;
      patched.add(prototype);
      prototype.atapi_handle = function () {
        const state = notifications.get(this);
        const command = this.data[0];
        if (state?.pending && this.buffer && command !== 3 && command !== 18) {
          this.data_pointer = 0;
          this.current_atapi_command = command;
          if (state.pending === 2) this.atapi_check_condition_response(2, 0x3a);
          else this.atapi_check_condition_response(6, 0x28);
          state.pending--;
          this.push_irq();
          return;
        }
        return handle.call(this);
      };
    }
    notifications.set(device, {pending:2}); // NOT PRESENT, then UNIT ATTENTION.
  }
  window.Win98CDs = {catalogue, notifyChange, protectReads, debugStart, debugDump, debugStop};
})();
