/* global V86, Win98Disk, Win98Handover, Win98Publishing */
(() => {
  "use strict";
  const screen = document.getElementById("screen-container");
  const status = document.getElementById("status");
  const error = document.getElementById("error");
  const pause = document.getElementById("pause");
  const restore = document.getElementById("restore");
  const fullscreen = document.getElementById("fullscreen");
  const viewport = document.getElementById("viewport");
  const canvas = screen.querySelector("canvas");
  const loader = document.getElementById("vm-loader");
  const loaderLabel = document.getElementById("loader-label");
  const loaderDetail = document.getElementById("loader-detail");
  const loaderProgress = document.getElementById("loader-progress");
  const loaderFill = document.getElementById("loader-fill");
  function loading(message, loaded, total) {
    if (failed || ready) return;
    loader.hidden = false;
    viewport.setAttribute("aria-busy", "true");
    loaderLabel.textContent = message;
    status.textContent = message;
    const determinate = total > 0;
    loaderProgress.dataset.indeterminate = String(!determinate);
    if (determinate) {
      const percent = Math.min(100, Math.floor(loaded / total * 100));
      loaderProgress.setAttribute("aria-valuenow", String(percent));
      loaderFill.style.width = `${percent}%`;
      loaderDetail.textContent = `${percent} % · ${(loaded / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MiB`;
    } else {
      loaderProgress.removeAttribute("aria-valuenow");
      loaderDetail.textContent = "Vent et øjeblik · din gemte session gendannes.";
    }
  }
  const release = document.getElementById("release");
  const sendEscape = document.getElementById("send-escape");
  sendEscape.addEventListener("click", () => {
    if (!ready || failed || toolBusy || !emulator.is_running()) return;
    // Direct scancodes bypass the host keyboard adapter: no input capture
    // needed, and no DOM Escape event that would release pointer lock.
    emulator.keyboard_send_scancodes([0x01, 0x81]);
  });
  const retry = document.getElementById("retry");
  const mute = document.getElementById("mute");
  const tools = document.getElementById("vm-tools");
  const toolsStatus = document.getElementById("tools-status");
  const cdStatus = document.getElementById("cd-status");
  const drive = document.getElementById("cd-drive");
  const driveStatus = document.getElementById("drive-status");
  const cdControls = document.getElementById("cd-controls");
  const insertBundled = document.getElementById("insert-bundled");
  function driveState(state, message) {
    drive.dataset.state = state;
    driveStatus.textContent = message;
  }
  const query = new URLSearchParams(location.search);
  const authorMode = query.get("author") === "1" || query.get("install") === "1";
  const diskForm = document.getElementById("disk-form");
  const diskControls = document.getElementById("disk-controls");
  const diskStatus = document.getElementById("disk-status");
  for (const id of ["open-author", "leave-author"]) {
    document.getElementById(id).addEventListener("click", event => {
      if (!window.confirm("Skift maskine og kassér alle ikke-eksporterede ændringer?")) event.preventDefault();
    });
  }
  const publishDraft = query.get("publish") === "1";
  const publishedVersion = query.get("published");
  let publishingManifest = null;
  let diskOptions = null;
  let mountedISO = null;
  let toolBusy = false;
  let muted = false;
  function resumeAudio() {
    const context = emulator?.speaker_adapter?.audio_context;
    if (context?.state === "suspended" && emulator.is_running()) {
      context.resume().catch(() => {
        status.textContent = "Lyden blev blokeret · klik på skrivebordet eller lydknappen for at prøve igen.";
      });
    }
  }
  mute.addEventListener("click", () => {
    muted = !muted;
    emulator.speaker_adapter.mixer.set_volume(muted ? 0 : 1, undefined);
    mute.setAttribute("aria-pressed", String(muted));
    mute.textContent = muted ? "Slå lyd til" : "Slå lyd fra";
    resumeAudio();
  });
  let emulator;
  let timeout;
  let failed = false;
  let ready = false;
  let wantsCapture = false;
  let capturePending = false;
  function releaseInput() {
    wantsCapture = false;
    emulator?.keyboard_set_status(false);
    emulator?.mouse_set_status(false);
    if (document.pointerLockElement === screen) document.exitPointerLock();
  }
  async function captureInput() {
    if (!ready || !emulator.is_running() || capturePending || document.pointerLockElement === screen) return;
    if (!screen.requestPointerLock) {
      status.textContent = "Browseren understøtter ikke musefangst. Prøv en desktop-browser.";
      return;
    }
    wantsCapture = true;
    capturePending = true;
    screen.focus();
    try {
      // Lock the display itself. v86 already handles relative movement while
      // Pointer Lock is active; no second mousemove handler is needed.
      await screen.requestPointerLock();
    } catch {
      releaseInput();
      status.textContent = "Musefangst blev blokeret · klik på skrivebordet for at prøve igen.";
    } finally {
      capturePending = false;
    }
  }
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === screen && wantsCapture && ready && emulator.is_running()) {
      emulator.mouse_set_status(true);
      emulator.keyboard_set_status(true);
      screen.dataset.captured = "true";
      status.textContent = "Mus og tastatur fanget · tryk Esc for at slippe.";
    } else {
      releaseInput();
      delete screen.dataset.captured;
      screen.blur();
      if (ready && !failed) status.textContent = emulator.is_running()
        ? "Mus og tastatur sluppet · klik på skrivebordet for at fange igen."
        : "Sat på pause.";
    }
  });
  document.addEventListener("pointerlockerror", () => {
    releaseInput();
    if (ready) status.textContent = "Musefangst blev blokeret · klik på skrivebordet for at prøve igen.";
  });
  function fail(reason) {
    if (failed) return;
    failed = true;
    ready = false;
    loader.hidden = true;
    viewport.setAttribute("aria-busy", "false");
    clearTimeout(timeout);
    releaseInput();
    emulator?.stop();
    for (const button of [pause, restore, fullscreen, release, sendEscape, mute]) button.disabled = true;
    tools.disabled = true;
    cdControls.disabled = true;
    insertBundled.disabled = true;
    status.textContent = authorMode ? "Maskinen kunne ikke indlæses." : "Snapshot kunne ikke gendannes.";
    error.textContent = `Windows 98 kunne ikke indlæses. ${reason} ${authorMode ? "Genindlæs udviklingstilstand for at prøve igen." : "Ingen normal opstart forsøges."}`;
    error.hidden = false;
    retry.hidden = false;
  }
  pause.addEventListener("click", async () => {
    try {
      if (emulator.is_running()) {
        releaseInput();
        await emulator.stop();
        pause.textContent = "Fortsæt";
        status.textContent = "Sat på pause.";
      } else {
        emulator.run();
        pause.textContent = "Pause";
        status.textContent = "Windows 98 kører · klik på skrivebordet.";
      }
    } catch { fail("Maskinen kunne ikke sættes på pause."); }
  });
  restore.addEventListener("click", () => {
    if (authorMode && !window.confirm("Kassér maskinen og alle ikke-eksporterede diskændringer?")) return;
    location.reload();
  });
  retry.addEventListener("click", () => location.reload());
  function fitFullscreen() {
    if (!emulator || !canvas.width || !canvas.height) return;
    // Size from the guest's native resolution, never from an already-scaled
    // DOM rectangle. CSS contains both dimensions within the fullscreen area.
    viewport.style.setProperty("--vm-aspect", canvas.width / canvas.height);
    emulator.screen_set_scale(1, 1);
  }
  document.addEventListener("fullscreenchange", fitFullscreen);
  window.addEventListener("resize", fitFullscreen);
  // Also refit if Windows changes resolution while already in fullscreen.
  new MutationObserver(fitFullscreen).observe(canvas, { attributes: true, attributeFilter: ["width", "height"] });
  fullscreen.addEventListener("click", async () => {
    try {
      if (!viewport.requestFullscreen) throw new Error("Fullscreen unavailable");
      await viewport.requestFullscreen();
      fitFullscreen();
    } catch {
      status.textContent = "Fuld skærm er ikke tilgængelig i denne browser.";
    }
  });
  release.addEventListener("click", releaseInput);
  screen.addEventListener("click", () => {
    resumeAudio();
    captureInput();
  });
  screen.addEventListener("blur", releaseInput);
  window.addEventListener("blur", releaseInput);
  document.addEventListener("visibilitychange", () => { if (document.hidden) releaseInput(); });
  // Capture before the emulator's global keyboard listener.
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      releaseInput();
      screen.blur();
    }
  }, true);
  window.addEventListener("pagehide", () => { clearTimeout(timeout); releaseInput(); emulator?.destroy(); });

  function download(data, name) {
    const url = URL.createObjectURL(new Blob([data], { type: "application/octet-stream" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function pauseForExport() {
    releaseInput();
    await emulator.stop();
    pause.textContent = "Fortsæt";
    status.textContent = "Sat på pause · eksportér disk og snapshot før du fortsætter.";
  }
  async function toolAction(action) {
    if (!ready || failed || toolBusy) return;
    toolBusy = true;
    tools.disabled = true;
    cdControls.disabled = true;
    insertBundled.disabled = true;
    for (const button of [pause, restore, fullscreen, release, sendEscape, mute]) button.disabled = true;
    releaseInput();
    try {
      await action();
    } catch (reason) {
      toolsStatus.textContent = `Handlingen mislykkedes: ${reason.message || reason}`;
    } finally {
      toolBusy = false;
      tools.disabled = failed;
      cdControls.disabled = failed;
      insertBundled.disabled = failed;
      if (!failed) {
        for (const button of [pause, restore, fullscreen, release, sendEscape]) button.disabled = false;
        mute.disabled = !emulator.speaker_adapter?.audio_context;
      }
    }
  }
  const settleCD = ms => new Promise(resolve => setTimeout(resolve, ms));
  function discArtwork(disc) {
    const tray = document.getElementById("tray-disc");
    tray.replaceChildren();
    if (disc.artwork) {
      const image = document.createElement("img");
      image.src = disc.artwork;
      image.alt = "";
      tray.append(image);
    } else {
      const label = document.createElement("span");
      label.textContent = disc.id === "hal9k" ? "HAL9K" : "CD-ROM";
      tray.append(label);
    }
  }
  function selectDisc(id) {
    for (const card of document.querySelectorAll("[data-cd-id]")) {
      const selected = card.dataset.cdId === id;
      card.setAttribute("aria-pressed", String(selected));
      card.querySelector(".disc-action").textContent = selected ? "● I drevet" : "Indsæt CD ↗";
    }
  }
  async function ejectCD() {
    driveState("ejecting", "Skubber CD'en ud…");
    emulator.eject_cdrom();
    mountedISO = null;
    selectDisc(null);
    cdStatus.textContent = "Drevet er tomt";
    // Real guest settling time, independent of decorative/reduced motion.
    await settleCD(1800);
    driveState("empty", "Klar til en ny skive.");
  }
  async function changeCD(media, disc) {
    await ejectCD();
    discArtwork(disc);
    await settleCD(150);
    driveState("inserting", `Indsætter ${disc.name}…`);
    await settleCD(1200);
    await emulator.set_cdrom(media);
    const device = emulator.v86.cpu.devices.cdrom;
    if (media.async) window.Win98CDs.protectReads(device.buffer);
    window.Win98CDs.notifyChange(device);
    mountedISO = disc;
    cdStatus.textContent = disc.name;
    selectDisc(disc.id);
    driveState("settling", "Windows læser den nye CD…");
    await settleCD(2000);
    driveState("inserted", "Klar. Åbn CD-drevet D: i Windows.");
  }
  async function mountBundled() {
    driveState("loading", "Henter HAL9K-CD…");
    try {
      const response = await fetch("downloads/hal9k-test.iso", { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`CD-image kunne ikke hentes (HTTP ${response.status}).`);
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength % 2048) throw new Error("CD-image er ugyldigt.");
      await changeCD({ buffer: bytes }, {id:"hal9k", name:"HAL9K-CD", artwork:"cds/hal9k-cd.png"});
      toolsStatus.textContent = "HAL9K-CD indsat automatisk. Hvis AutoRun er slået fra, åbn D:\\HAL9K.EXE inde i Windows.";
    } catch (reason) {
      driveState("error", "CD'en kunne ikke indsættes. Prøv Indsæt HAL9K-CD igen.");
      throw reason;
    }
  }
  insertBundled.addEventListener("click", () => toolAction(mountBundled));
  async function loadCollection() {
    const notice = document.getElementById("cd-collection-status");
    notice.textContent = "Henter samlingen…";
    try {
      const discs = await window.Win98CDs.catalogue();
      const shelf = document.getElementById("cd-shelf");
      for (const [index, disc] of discs.entries()) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "disc-card";
        button.dataset.cdId = disc.id;
        button.setAttribute("aria-pressed", "false");
        const image = document.createElement("img");
        image.className = "disc-art";
        image.src = disc.artwork;
        image.alt = `CD: ${disc.title}`;
        image.loading = "lazy";
        const number = document.createElement("span");
        number.className = "disc-number";
        number.textContent = `${String(index + 2).padStart(2, "0")} / ARCHIVE`;
        const title = document.createElement("strong");
        title.textContent = disc.title;
        const description = document.createElement("span");
        description.className = "disc-description";
        description.textContent = disc.description;
        const action = document.createElement("span");
        action.className = "disc-action";
        action.textContent = "Indsæt CD ↗";
        button.addEventListener("click", () => toolAction(async () => {
          await changeCD(disc.options, {id:disc.id, name:disc.title, artwork:disc.artwork});
          toolsStatus.textContent = "CD indsat. Installationsfiler ligger normalt i D:\\WIN98. Kun læste dele af CD'en hentes.";
        }));
        button.append(image, number, title, description, action);
        shelf.append(button);
      }
      notice.textContent = "";
    } catch (reason) {
      notice.textContent = `Samlingen kunne ikke hentes: ${reason.message}`;
      const retryCollection = document.createElement("button");
      retryCollection.type = "button";
      retryCollection.textContent = "Prøv igen";
      retryCollection.addEventListener("click", loadCollection, {once:true});
      notice.append(" ", retryCollection);
    }
  }
  loadCollection();
  document.getElementById("mount-iso").addEventListener("click", () => toolAction(async () => {
    const file = document.getElementById("iso-file").files[0];
    if (!file || !/\.iso$/i.test(file.name) || !file.size || file.size % 2048 !== 0) {
      throw new Error("Vælg en ISO-fil med hele 2048-byte sektorer.");
    }
    // With this pinned v86 build, File-backed async media mounts but Win98
    // cannot read it. Use the same synchronous buffer path as copy.sh.
    if (file.size > 800 * 1024 * 1024) throw new Error("ISO-filen er for stor (maks. 800 MiB). CD'en indlæses i browserens RAM.");
    toolsStatus.textContent = "Indlæser CD-image i hukommelsen…";
    await changeCD({ buffer: await file.arrayBuffer() }, {id:"local", name:file.name});
    toolsStatus.textContent = "Lokal CD indsat. Filen uploades ikke.";
  }));
  document.getElementById("eject-iso").addEventListener("click", () => toolAction(async () => {
    await ejectCD();
    document.getElementById("iso-file").value = "";
    toolsStatus.textContent = "CD-drevet er tomt.";
  }));
  document.getElementById("ctrl-alt-del").addEventListener("click", () => toolAction(async () => {
    if (!emulator.is_running()) throw new Error("Fortsæt maskinen først.");
    await emulator.keyboard_send_scancodes([0x1d, 0x38, 0xe0, 0x53, 0xe0, 0xd3, 0xb8, 0x9d]);
    toolsStatus.textContent = "Ctrl+Alt+Del sendt til Windows. Brug Windows' egen genstart efter installation.";
  }));

  document.getElementById("reboot-vm").addEventListener("click", () => toolAction(async () => {
    if (!window.confirm("Hård genstart af maskinen? Den virtuelle disk bevares, men Windows' ikke-skrevne data kan gå tabt og filsystemet kan beskadiges. Brug Windows' egen genstart, hvis den virker.")) return;
    await emulator.stop();
    emulator.restart();
    emulator.run();
    pause.textContent = "Pause";
    status.textContent = "Maskinen genstarter fra den aktuelle virtuelle disk.";
    toolsStatus.textContent = "Hård genstart udført. Disk og indsat CD bevares i denne session; ingen snapshot-gendannelse eller genindlæsning af siden.";
  }));
  document.getElementById("save-state").addEventListener("click", () => toolAction(async () => {
    if (mountedISO) throw new Error("Skub CD'en ud før du gemmer et selvstændigt snapshot.");
    await pauseForExport();
    toolsStatus.textContent = "Gemmer snapshot…";
    const state = await emulator.save_state();
    download(state, authorMode ? "hal9k-windows98-author-state.bin" : "hal9k-windows98-state.bin");
    toolsStatus.textContent = "v86-snapshot downloadet. Maskinen er stadig pauset. Brug overdragelseseksport for disk/snapshot-par med handover.json og checksums.";
  }));
  async function readCurrentDisk() {
    // v86's chunked backend cannot get_buffer(). Read its current view instead:
    // it combines base chunks with written blocks, including restored overlays.
    const disk = emulator.v86.cpu.devices.ide.primary.master.buffer;
    const parts = [];
    const chunkSize = 256 * 1024;
    for (let offset = 0; offset < disk.byteLength; offset += chunkSize) {
      toolsStatus.textContent = `Eksporterer harddisk… ${Math.floor(offset / disk.byteLength * 100)} %`;
      const block = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Diskdata kunne ikke læses. Prøv igen.")), 30000);
        try {
          disk.get(offset, Math.min(chunkSize, disk.byteLength - offset), bytes => {
            clearTimeout(timer);
            resolve(bytes);
          });
        } catch (reason) { clearTimeout(timer); reject(reason); }
      });
      parts.push(new Uint8Array(block));
    }
    return new Blob(parts);
  }
  document.getElementById("export-disk").addEventListener("click", () => toolAction(async () => {
    await pauseForExport();
    const image = await readCurrentDisk();
    const disk = { byteLength: image.size };
    download(image, authorMode ? "hal9k-windows98-author-disk.img" : "hal9k-windows98-disk.img");
    toolsStatus.textContent = `Harddisk downloadet (${disk.byteLength / 1024 / 1024} MiB). Maskinen er stadig pauset. Bevar disk, snapshot og firmware sammen.`;
  }));
  document.getElementById("export-handover").addEventListener("click", () => toolAction(async () => {
    if (mountedISO) throw new Error("Skub CD'en ud før overdragelse.");
    await pauseForExport();
    const fetchLocal = async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Overdragelsesfil mangler: ${url} (HTTP ${response.status}).`);
      return response;
    };
    toolsStatus.textContent = "Gemmer overdragelsens snapshot…";
    const state = await emulator.save_state();
    const image = await readCurrentDisk();
    if (publishingManifest) {
      toolsStatus.textContent = "Pakker publiceringssnapshot og oprindelig basisdisk…";
      const entries = await Win98Publishing.capture(publishingManifest, diskOptions, state, image);
      for (const name of ["provenance.json", "bios-provenance.json", "SeaBIOS-LICENSE.txt", "BIOS-LICENSE-LESSER.txt"]) {
        entries.push([name, await (await fetchLocal(`vendor/${name}`)).arrayBuffer()]);
      }
      download(Win98Handover.archive(entries), "hal9k-windows98-publishing-handover.tar");
      toolsStatus.textContent = "Publiceringsoverdragelse sendt til download. Kør publish.cjs finalize og test den nye version. Maskinen forbliver pauset.";
      return;
    }
    const entries = [["state.bin", state], ["disk.img", image]];
    const provenance = await (await fetchLocal("vendor/provenance.json")).json();
    entries.push(["v86-provenance.json", JSON.stringify(provenance, null, 2)]);
    entries.push(["seabios.bin", diskOptions.bios.buffer], ["vgabios.bin", diskOptions.vga_bios.buffer]);
    for (const name of ["bios-provenance.json", "SeaBIOS-LICENSE.txt", "BIOS-LICENSE-LESSER.txt"]) {
      entries.push([name, await (await fetchLocal(`vendor/${name}`)).arrayBuffer()]);
    }
    const metadata = {
      format: "hal9k-windows98-handover-v2",
      created: new Date().toISOString(),
      mode: "raw-authoring",
      memory_size: 128 * 1024 * 1024,
      vga_memory_size: 8 * 1024 * 1024,
      disk_size: image.size,
      disk_backend: "synchronous-buffer",
      boot_order: diskOptions.boot_order,
      acpi: false,
      disk_sha256: await Win98Disk.sha256(await image.arrayBuffer()),
      state_sha256: await Win98Disk.sha256(state),
      bios_sha256: await Win98Disk.sha256(diskOptions.bios.buffer),
      vga_bios_sha256: await Win98Disk.sha256(diskOptions.vga_bios.buffer),
      snapshot: "state.bin",
      current_disk: "disk.img",
      restore_base: "disk.img",
      v86_sha256: provenance.sha256,
      note: "Keep disk.img, state.bin, firmware and the exact v86 build together. Test a fresh restore before publishing.",
    };
    entries.push(["handover.json", JSON.stringify(metadata, null, 2)]);
    entries.push(["README.txt", "Windows 98 experience handover\n\nstate.bin and disk.img were captured during one uninterrupted pause.\nSee handover.json for hardware/backend settings and v86-provenance.json for emulator hashes.\nRaw-authoring snapshots use a synchronous disk. Reopen ?author=1 and select disk.img, state.bin and handover.json to restore the verified pair. Included firmware must be kept with the matching v86 build.\nConfigure and test a fresh restore before updating the published assets. This archive does not deploy itself.\nPausing does not flush Windows filesystem buffers; state preserves them. For an independent cold boot, cleanly shut down Windows before disk export.\nFiles may contain personal data and proprietary software. Share only with appropriate rights.\n"]);
    toolsStatus.textContent = "Pakker disk, snapshot og kompatibilitetsfiler…";
    download(Win98Handover.archive(entries), `hal9k-windows98-${authorMode ? "author" : "preview"}-handover.tar`);
    toolsStatus.textContent = "Overdragelsespakke sendt til browserens download. Kontrollér at .tar-filen er gemt. Maskinen er stadig pauset; pakken kræver en matchet restore-profil før publicering.";
  }));
  document.getElementById("load-state").addEventListener("click", () => toolAction(async () => {
    if (publishingManifest) throw new Error("Lazy snapshots kræver deres oprindelige basisdisk. Brug finalize og en versioneret publiceringsprofil, ikke direkte snapshot-import.");
    const file = document.getElementById("state-file").files[0];
    if (!file || !/\.bin$/i.test(file.name) || file.size === 0 || file.size > 1536 * 1024 * 1024) {
      throw new Error("Vælg et ukomprimeret v86 .bin-snapshot (højst 1,5 GiB).");
    }
    if (mountedISO) throw new Error("Skub CD'en ud før du indlæser et snapshot.");
    if (!window.confirm("Erstat denne sessions hukommelse OG disk med snapshot? Indlæs kun et betroet snapshot fra samme synkrone profil og v86-version. For verificeret import, brug udviklingsformularen med disk.img, state.bin og handover.json.")) return;
    await pauseForExport();
    toolsStatus.textContent = "Indlæser snapshot…";
    try {
      await emulator.restore_state(await file.arrayBuffer());
      releaseInput();
      fitFullscreen();
      toolsStatus.textContent = "Snapshot indlæst. Tryk Fortsæt for at køre maskinen.";
    } catch (reason) {
      // A failed restore can leave partial device state; do not resume it.
      fail("Det valgte snapshot kunne ikke gendannes. Genindlæs siden for at starte sikkert igen.");
      throw reason;
    }
  }));

  async function start() {
    try {
      if (typeof WebAssembly === "undefined" || typeof V86 === "undefined") {
        throw new Error("Browseren mangler WebAssembly, eller emulatoren blev ikke indlæst.");
      }
      // Compile up front so network/CSP/unsupported-Wasm failures reach the UI,
      // rather than becoming an unhandled rejection inside v86's loader.
      const response = await fetch("vendor/v86.wasm");
      if (!response.ok) throw new Error("Emulatorens WebAssembly-fil mangler.");
      const module = await WebAssembly.compile(await response.arrayBuffer());
      // Require a matched lazy publishing set for default startup.
      // Raw authoring remains available through local file selection only.
      if (!authorMode) {
        let pointer = null;
        if (publishDraft) pointer = "publishing/draft.json";
        else if (publishedVersion) {
          if (!/^[a-zA-Z0-9_-]+$/.test(publishedVersion)) throw new Error("Ugyldig publiceringsversion.");
          const version = await fetch(`publishing/${publishedVersion}/manifest.json`);
          if (!version.ok) throw new Error("Publiceringsversion mangler.");
          // Version pointer is written by the offline pipeline.
          pointer = `publishing/${publishedVersion}/pointer.json`;
        } else {
          const response = await fetch("images/published.json", { signal: AbortSignal.timeout(30000) });
          if (!response.ok) throw new Error("Publiceringspointer kunne ikke læses. Ingen alternativ disk eller opstart forsøges.");
          pointer = "images/published.json";
        }
        const loaded = await Win98Publishing.load(pointer, publishDraft, loading);
        diskOptions = loaded.options;
        publishingManifest = loaded.manifest;
      }
      loading(authorMode || publishDraft ? "Indlæser maskinen…" : "Gendanner HAL9K-snapshot…");
      if (failed) return;
      emulator = new V86({
        wasm_fn: async (imports) => (await WebAssembly.instantiate(module, imports)).exports,
        memory_size: 128 * 1024 * 1024,
        vga_memory_size: 8 * 1024 * 1024,
        screen_container: screen,
        ...diskOptions,
        // Each WISP guest is isolated. Preserve the restored MAC because Win98
        // caches it in its driver; randomizing it silently breaks resumed traffic.
        preserve_mac_from_state_image: true,
        // Same-origin backend for the existing NE2000; keep matched hardware.
        net_device: {
          type: "ne2k",
          relay_url: `${location.protocol === "https:" ? "wisps" : "wisp"}://${location.host}/vm/network/`,
          dns_method: "static", // No external DoH; EXE uses virtual 192.168.86.2.
          masquerade: false,
        },
        disable_speaker: false,
        autostart: false,
      });
      releaseInput();
      emulator.add_listener("download-progress", (event) => {
        if (failed) return;
        loading("Indlæser maskinen…", event.loaded, event.total);
      });
      emulator.add_listener("download-error", () => fail("Serveren kunne ikke levere snapshot eller diskdata. Prøv igen senere."));
      emulator.add_listener("emulator-loaded", () => {
        if (failed) return;
        clearTimeout(timeout);
        ready = true;
        loader.hidden = true;
        viewport.setAttribute("aria-busy", "false");
        tools.disabled = false;
        cdControls.disabled = false;
        toolsStatus.textContent = "Klar. Vælg en ISO for at installere software i denne session.";
        screen.dataset.ready = "true";
        if (authorMode && diskOptions.initial_state) pause.textContent = "Fortsæt";
        else emulator.run();
        for (const button of [pause, restore, fullscreen, release, sendEscape]) button.disabled = false;
        mute.disabled = !emulator.speaker_adapter?.audio_context;
        if (mute.disabled) mute.textContent = "Lyd ikke understøttet";
        status.textContent = authorMode
          ? (diskOptions.initial_state ? "Snapshot gendannet pauset · tryk Fortsæt." : "Raw-maskinen starter · klik på skærmen.")
          : "Windows 98 gendannet fra snapshot · klik på skrivebordet.";
        if (publishingManifest) {
          document.getElementById("export-handover").textContent = "Eksporter publiceringsoverdragelse (.tar)";
          document.getElementById("load-state").disabled = true;
          document.getElementById("state-file").disabled = true;
        }
        if (authorMode || publishDraft) {
          insertBundled.disabled = false;
          driveState("empty", "CD-drevet er tomt. Indsæt software-CD efter behov.");
          cdStatus.textContent = "Ingen CD indsat.";
          toolsStatus.textContent = "Tilpas Windows og installer software. Eksportér overdragelse for disk, v86-snapshot og checksums.";

        } else toolAction(mountBundled);
      });
    } catch (reason) {
      fail(reason.message || "Browseren kunne ikke gendanne maskinen.");
    }
  }
  function startWithDeadline() {
    timeout = setTimeout(() => fail("Indlæsningen tog mere end 90 sekunder. Kontrollér forbindelsen og prøv igen."), 90000);
    start();
  }
  if (publishDraft) {
    document.getElementById("export-handover").textContent = "Eksporter publiceringscapture (.tar)";
  }
  if (authorMode) {
    loader.hidden = true;
    viewport.setAttribute("aria-busy", "false");
    document.getElementById("author-reboot").hidden = false;
    document.getElementById("tools-panel").open = true;
    document.getElementById("disk-panel").open = true;
    diskForm.hidden = false;
    document.querySelector(".titlebar span").textContent = "Raw-disk / udvikling";
    document.querySelector(".hint").textContent = "Klik på skærmen for lyd, mus og tastatur; Esc slipper. Diskændringer er kun i RAM · eksportér før genindlæsning eller lukning.";
    document.getElementById("export-disk").textContent = "Eksporter raw-harddisk (.img)";
    restore.textContent = "Nulstil udviklingssession";
    restore.disabled = false;
    status.textContent = "Vælg raw-disk nedenfor · firmware indlæses automatisk.";
    driveState("empty", "CD-drevet er tomt.");
    diskStatus.textContent = "QEMU skal være lukket før du indlæser disken. Maks. 1 GiB; ingen upload.";
    diskForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (diskControls.disabled) return;
      diskControls.disabled = true;
      try {
        const files = {
          hda: document.getElementById("disk-file").files[0],
          state: document.getElementById("disk-state-file").files[0],
          metadata: document.getElementById("disk-metadata-file").files[0],
        };
        Win98Disk.validate(files);
        diskStatus.textContent = "Indlæser firmware, raw-disk og eventuelt matchet snapshot…";
        const response = await fetch("vendor/provenance.json", { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error("Emulator-provenance mangler.");
        diskOptions = await Win98Disk.profile(files, await Win98Disk.firmware(), await response.json());
        diskStatus.textContent = "Maskinen indlæses. Originalfilen ændres ikke; eksportér for at gemme arbejdet.";
        startWithDeadline();
      } catch (reason) {
        diskControls.disabled = false;
        diskStatus.textContent = `Kan ikke indlæse: ${reason.message || reason}`;
      }
    });
  } else startWithDeadline();
})();
