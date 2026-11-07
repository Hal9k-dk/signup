# Windows 98 — authored snapshot preview

An independent v86 experience at `/experiences/windows98/`. The default page resumes the **user-authored Windows 98 master** from the active `win98-release-001` compressed snapshot with a lazy 256 KiB disk backend. `public/images/published.json` selects this immutable version; the full synchronous master is retained only for authoring/rollback, not downloaded on normal visits. It never falls back to a cold boot or the old copy.sh Windows demo. After restoration it automatically inserts the HAL9K CD. Guest AutoRun may launch `HAL9K.EXE`; the page has no launch acknowledgement or signup API bridge.

## Repeatable fast-publishing pipeline

`publish.cjs` provides a separate publishing path; it does not convert the synchronous memory state. Requires Node, tar and zstd (Arch: `pacman -S nodejs tar zstd`). From this directory:

```sh
node publish.cjs prepare /path/to/raw-handover.tar draft-001
# Open ?publish=1. This cold-boots the disk using async 256 KiB parts.
# Wait for Windows, open your welcome application, eject CDs, export capture.
node publish.cjs finalize /path/to/hal9k-windows98-publishing-handover.tar release-001
# Test ?published=release-001 in a fresh browser session.
node publish.cjs activate release-001
```

Prepare validates the raw handover's disk/hardware/build/firmware, splits the disk into 256 KiB parts and writes `public/publishing/draft.json`. It deliberately ignores the supplied synchronous snapshot. The source raw disk should be exported after a clean guest shutdown to avoid dirty filesystem buffers. The draft has no automatic HAL9K CD insertion. Settle Windows at the intended screen before capturing.

Publishing capture pauses and exports the original `base-disk.img`, current merged `disk.img`, async `state.bin` with write overlays, manifest/checksums and firmware. **The original base must stay matched to the overlay state.** Finalize validates the capture, creates an immutable version directory, compresses the state using zstd and reports compressed size. It does not activate unless explicitly requested (`--activate` is available, but separate test/activation is recommended). The full archive is for handover/rollback; visitors fetch only the compressed state and needed disk chunks, not the merged disk or raw full state. `disk.img` from an async capture can be imported alone into raw authoring for further editing/cold boot; do not pair it with the async state in the raw form.

`public/images/published.json` now selects `publishing/win98-release-001/manifest.json`. Activation atomically points it at a finalized version. Once active, missing/corrupt publishing state errors rather than falling back to the large raw master. Use `activate OLD_VERSION` for rollback; keep immutable version assets and source handovers. Generated publishing directories are ignored by git but included by the existing public-file packager. Runtime state/BIOS hashes and offline disk chunk hashes are checked; lazy disk reads use the pinned v86 loader. They can still stall if a required chunk is missing. Do not mutate version contents; configure production caching appropriately.

`make test-raw-browser` also exercises prepare → real async BIOS boot → publishing capture → finalize/zstd → lazy restore with a tiny test disk. The supplied Windows publishing capture has passed real Chromium fresh restore, graphical display, pause/resume, pointer lock/release, reload and missing-state/CD failure checks. It reached VM-ready in 451 ms on the local unthrottled server; this is not a WAN performance guarantee. This first pipeline does not yet record/prefetch a startup working set or measure constrained-network performance; those should follow actual snapshot size and startup-I/O measurements.

## Active lazy master

Finalized from `/tmp/hal9k-windows98-publishing-handover.tar` as `public/publishing/win98-release-001/`:

- `state.bin.zst`: **11.79 MiB**, from a 40,603,252-byte async snapshot.
- `disk/`: 2,048 immutable 256 KiB parts (512 MiB base disk), fetched only on demand.
- `manifest.json`: base/chunk/state/firmware/build hashes; snapshot includes disk-write overlays against this exact base.
- `images/published.json`: activation pointer. Missing published assets do not silently fall back.

## Retained raw authoring master

Imported from `/tmp/hal9k-windows98-author-handover.tar`, created 2026-11-07:

- `public/images/disk.img`: 512 MiB whole raw disk.
- `public/images/state.bin`: 598,371,604-byte uncompressed v86 state (includes synchronous disk data).
- `public/images/handover.json`: SHA-256 for disk/state/BIOS and hardware/build settings.
- RAM: 128 MiB; VGA RAM: 8 MiB; IDE, ACPI disabled, boot order `0x132`.
- BIOS: `public/seabios.bin`, `public/vgabios.bin`, verified against `public/vendor/bios-provenance.json`.
- Emulator: pinned `public/vendor/libv86.js` + `v86.wasm`, hashes/licence/source URLs in `provenance.json`.

All default assets are same-origin. The loader verifies the matched pair before passing it to v86; missing/corrupt assets produce an error, not a replacement OS or cold boot. Startup has a 90-second deadline. The retained raw disk + synchronous state total about 1.06 GiB, but are no longer requested by the active lazy default. Full handover exports still need substantial RAM and transfer space.

The old upstream snapshot, 1,200 disk chunks, checksum manifest and `fetch-images.cjs` have been removed. Do not restore them. These ignored proprietary master files must be preserved separately; the existing packager embeds the local public files on build.

To publish another handover, verify its v2 synchronous profile, firmware and pinned v86 hashes, replace **all three** `images/disk.img`, `images/state.bin`, `images/handover.json`, then run offline and real browser checks before building. Keep a rollback copy. Downloads from the tools never update the server master automatically.

## Development and export

The default machine can be modified directly. Expand **VM-værktøjer**, mount a local software ISO (up to 800 MiB, loaded into RAM, never uploaded), copy/install the program and restart via Windows **Start → Shut Down → Restart**. Use small driver/software ISOs; upstream documents problems with Windows 9x and large CD images. Our pinned v86 needs synchronous ArrayBuffer CD mounting; File-backed async mounting was unreadable by the guest.

Eject the CD, wait for installers/disk activity, open the desired welcome screen, then click **Eksporter overdragelse — disk + snapshot (.tar)**. It pauses once, captures `state.bin` and current `disk.img`, includes matching `handover.json` with checksums, BIOS/provenance/licences, and leaves the VM paused. Raw authoring uses the synchronous v2 handover. The active lazy default instead exports a publishing capture with the original `base-disk.img` and async overlays; finalize this capture into a new version to publish further changes. Its merged `disk.img` can cold-boot in raw authoring, but the async `state.bin` cannot be paired with that merged disk. Check the browser download completed before closing the page. Separate disk and state export buttons remain available, but the handover is recommended for a verified pair.

To continue development or test restore, extract the tar and open `?author=1`, selecting **disk.img + state.bin + handover.json from the same export**. Hashes, hardware/backend and emulator version are checked; restore stays paused until **Fortsæt**. A disk selected without state cold-boots. Legacy `?install=1` opens the same authoring form. Authoring mode never fetches the default master and does not auto-insert the HAL9K CD.

**Indlæs snapshot** can also load a trusted synchronous v86 `.bin` (up to 1.5 GiB) in the current VM after confirmation; it replaces memory AND disk and stays paused. This direct state-only path is not checksum-verified against handover metadata. Prefer the three-file authoring import for verification. Never load old async-overlay snapshots or QEMU snapshots. A failed restore disables the VM until reload.

Pausing does not flush Windows filesystem buffers. State preserves those buffers; for a disk to boot independently in QEMU, shut Windows down cleanly before disk export. Reloading discards session changes. Authoring mode offers a confirmed **Genstart VM (hård genstart)** for a hung guest or “safe to turn off” screen: the disk/CD remain, but pending writes can be lost and the filesystem damaged. Prefer guest Restart, never webpage reload.

## QEMU installation → v86 authoring

Install a licensed Windows 98 SE copy with a valid product key in QEMU, following [upstream's guide](https://github.com/copy/v86/blob/master/docs/windows-9x.md):

```sh
qemu-img create -f raw windows98.img 512M
qemu-system-i386 -m 128 -M pc,acpi=off -vga std \
  -drive file=windows98.img,format=raw,if=ide \
  -cdrom /path/to/windows98.iso -boot order=d
```

For a nonbootable CD add `-fda /path/to/boot.img` and use `-boot order=a`. Partition/format and finish Setup; subsequent boots use `-boot order=c`. Prefer standard IDE/VGA, not virtio or QEMU-specific display drivers. Optional `-device sb16` prepares a similar sound device. Shut Windows down cleanly and close QEMU before importing the whole raw disk (up to 1 GiB) in `?author=1`. qcow2 must first be converted:

```sh
qemu-img convert -f qcow2 -O raw windows98.qcow2 windows98.img
```

The local source file is never modified; all guest writes stay in browser RAM. Windows may redetect hardware. QEMU memory snapshots are incompatible with v86: create the fast-start state after successfully booting/customising in v86. VBEMP/VBE9x can provide higher resolution/colour depth; Creative Labs Sound Blaster 16/AWE-32 is the guest sound driver. VBEMP is noncommercial and restricts bundling; secure appropriate rights for a published master containing it.

## Controls, test CD and checks

Click the display to unlock browser audio and capture mouse/keyboard with Pointer Lock. Escape, release, pause, blur and hiding the tab release input. Muting, fullscreen and aspect-preserving narrow-page scaling are supported. No networking relay, signup API bridge or persistent disk storage is attached.

`public/downloads/hal9k-test.iso` (volume `HAL9K_TEST`) contains `HAL9K.EXE`, `AUTORUN.INF`, `README.TXT` from `test-cd/`. Default visits insert it automatically; authoring offers manual insertion. If AutoRun is disabled, run `D:\HAL9K.EXE`. A failed CD fetch leaves Windows usable with retry. Root `make assemble`/`make build` regenerate the ISO using xorriso; standalone `make test-iso` does the same.

```sh
make dev                  # standalone Go dev host at /
make test                 # syntax, profile, master/firmware/vendor checksums
make test-browser         # real default master restore and input/error UI
make test-raw-browser     # self-hosted real v86 raw boot/export/restore test
make test-layout-browser  # offline Chromium layout regression
make test-tools-browser   # real default ISO mount/export/restore, needs xorriso
# Against assembled host:
BASE_URL=http://localhost:8080/experiences/windows98/ make test-browser
```

Playwright is development-only. Set NODE_PATH as described in root README and optionally CHROMIUM_PATH. Default browser tests use the actual master, not a simulated desktop. Screenshot `/tmp/hal9k-windows98.png` (override SCREENSHOT). `internal/site.Headers` allows same-origin Wasm and v86 blob timing/audio workers without external guest relays or general eval.

## Licensing / deployment

Windows 98, included programs and potentially drivers are proprietary or separately licensed. Possession of installer media is not permission for public browser redistribution. Before publication, distribution of the embedded executable/container, or production deployment, establish rights to **all master contents**, including VBEMP if installed, and firmware corresponding-source obligations. Preserve licence/provenance files. Never capture real personal data in the master.

HAL9K.EXE is currently an offline test with no personal-data transport. A future bounded, validated guest serial bridge to same-origin `/api/signup` is not implemented.
