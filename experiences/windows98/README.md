# Windows 98 — authored snapshot preview

An independent v86 experience at `/experiences/windows98/`. The default page resumes the **user-authored Windows 98 master** from the selected compressed snapshot with a lazy 256 KiB disk backend. `public/images/published.json` selects this immutable version. Raw disks and synchronous states are imported from local handover files in authoring mode, not bundled in the repository. It never falls back to a cold boot or the old copy.sh Windows demo. After restoration it automatically inserts the HAL9K CD. Guest AutoRun may launch `HAL9K.EXE`; the page has no launch acknowledgement. The CD's `HAL9K.INI` configures the signup API through the virtual WISP network.

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

`public/images/published.json` is the sole source of truth for the active version. Its `manifest` field points to `publishing/VERSION/manifest.json`. Activation atomically points it at a finalized version; do not duplicate the active version name in documentation. Once active, missing/corrupt publishing state errors rather than falling back to the large raw master. Use `activate OLD_VERSION` for rollback; keep immutable version assets and source handovers. Production assembly includes only the selected version's manifest, compressed state and disk chunks; raw masters, drafts and inactive releases are excluded. Local development continues to serve all local assets. Runtime state/BIOS hashes and offline disk chunk hashes are checked; lazy disk reads use the pinned v86 loader. They can still stall if a required chunk is missing. Do not mutate version contents; configure production caching appropriately.

`make test-raw-browser` also exercises prepare → real async BIOS boot → publishing capture → finalize/zstd → lazy restore with a tiny test disk. The supplied Windows publishing capture has passed real Chromium fresh restore, graphical display, pause/resume, pointer lock/release, reload and missing-state/CD failure checks. It reached VM-ready in 451 ms on the local unthrottled server; this is not a WAN performance guarantee. This first pipeline does not yet record/prefetch a startup working set or measure constrained-network performance; those should follow actual snapshot size and startup-I/O measurements.

## Inspect the active lazy master

Read `public/images/published.json`, then open the file named by its `manifest` field relative to `public/`. From this directory, this command prints the selected manifest, snapshot size and base disk size:

```sh
node -e 'const fs=require("node:fs"); const p=JSON.parse(fs.readFileSync("public/images/published.json")); const m=JSON.parse(fs.readFileSync("public/"+p.manifest)); console.log({manifest:p.manifest, snapshotMiB:m.compressed_state_size/1024**2, diskMiB:m.disk_size/1024**2});'
```

On a deployed site, inspect `/experiences/windows98/images/published.json` (or `/images/published.json` in standalone development mode), then follow its manifest path relative to the experience URL. Browser DevTools Network shows which version a particular tab loaded; an existing tab may still be using a previous selection. `?published=VERSION` explicitly overrides the default for testing.

Each immutable version contains `state.bin.zst`, on-demand 256 KiB base disk chunks and `manifest.json` with size/base/chunk/state/firmware/build hashes. The snapshot's disk-write overlays must remain paired with that exact base. Missing published assets do not silently fall back.

## Local raw authoring and firmware

Raw disks and matched synchronous states belong in separately backed-up handover archives, not `public/images/` or Git history. Import them using `?author=1`; publish a new raw source using the prepare/capture/finalize workflow above. Existing lazy captures use finalize directly. Downloads from VM tools never update the server automatically.

RAM is 128 MiB, VGA RAM 8 MiB; IDE, ACPI disabled, boot order `0x132`. Bundled `seabios.bin` and `vgabios.bin` are verified against firmware provenance. The pinned v86 JS/Wasm hashes, licence and source URLs are in `public/vendor/provenance.json`.

All default assets are same-origin. Missing/invalid publishing pointers or assets produce an error, never a raw-disk fallback or replacement OS. Startup has a 90-second deadline. Full handover exports still need substantial RAM and transfer space. The old copy.sh assets and fetch script are removed; do not restore them.

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

Click the display to unlock browser audio and capture mouse/keyboard with Pointer Lock. Escape, release, pause, blur and hiding the tab release input. Muting, fullscreen and aspect-preserving narrow-page scaling are supported. Networking is enabled by default through the same-origin WISP gateway described below. No persistent disk storage is attached.

`public/downloads/hal9k-test.iso` (volume `HAL9K_TEST`) contains `HAL9K.EXE`, `HAL9K.INI`, `AUTORUN.INF`, `README.TXT` from `test-cd/`. Default visits insert it automatically; authoring offers manual insertion. If AutoRun is disabled, run `D:\HAL9K.EXE`. A failed CD fetch leaves Windows usable with retry. Root `make assemble`/`make build` regenerate the ISO using xorriso; standalone `make test-iso` does the same.

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

HAL9K.EXE is built from `https://github.com/Hal9k-dk/hal9k-signup-win98` using its upstream Makefile; source commit/build details are in `signup-exe-provenance.json`. Rebuild that pinned source with `make` (requires i686 MinGW GCC/windres), copy `hal9k.exe` to `test-cd/hal9k.exe`, preserve `test-cd/HAL9K.INI`, then run `make test-iso`. The INI's public virtual URL is not a secret; never add a direct Slack webhook. The wizard requires confirmation before sending. CD changes do not require replacing the matched VM snapshot.

## Networking

Networking is enabled automatically in normal and authoring modes; no networking query parameter is needed. Run the Go development host (`make dev`) or the assembled Go server. The existing NE2000 card attaches to `/vm/network/` using WISP v1 over same-origin WebSocket, encrypted as WSS on HTTPS deployments. No disk/snapshot or hardware profile has been changed. Windows driver/TCP-IP setup still needs guest-side verification.

Snapshot restore uses `preserve_mac_from_state_image: true`: v86 otherwise randomizes the NIC MAC while Windows keeps its cached address, breaking resumed networking. Sharing the saved MAC is appropriate here because each WISP guest is isolated (do not use this unchanged on a shared Ethernet relay). See upstream `docs/networking.md`, "v86 run-time state images". The user verified guest ping and Internet Explorer `/health` before capture; repeat `/health` on a fresh restore after frontend changes. Existing TCP connections/ARP/DHCP state can be stale; retry with a new HTTP connection and, if needed, use `winipcfg` to release/renew the adapter lease. Ping is answered by v86 locally and does not prove Go tunnel connectivity.

The Go gateway implements a **TCP-only restricted subset**, compatible with the bundled v86 WISP client, not a general WISP/Internet proxy. Only `192.168.86.2:80` exists; it is virtual, with no outbound dialing or DNS. Guest DNS uses v86's static responder, not external DoH. Configure Windows TCP/IP through DHCP; a Winsock/WinINet client should use:

- `GET http://192.168.86.2/health` — connectivity probe, no personal data.
- `POST http://192.168.86.2/api/signup` — existing JSON contract in `../../contracts/signup-api.md`, including validation/error responses. Guest HTTP is carried inside browser-to-server TLS; Windows needs no modern TLS stack.

One HTTP request per stream; responses close the connection. Limits: 64 concurrent WebSockets per handler, four streams each, 32 KiB aggregate input per stream, 16-packet input window, 30-second stream and 30-minute session deadlines. Same-origin upgrades only. No guest URL selection, UDP, external relay or arbitrary proxying. Actual submissions use the real shared API and its logging/Slack semantics; require user confirmation and never automatically retry. Do not export images/snapshots containing personal data.

`go test -race ./internal/vmnetwork` exercises framing, destination/route restrictions, HTTP, validation-response passthrough, flow control and origin rejection. `make test-network-browser` needs a running Go host and verifies the **actual vendored v86 WISP adapter**, restored VM and CSP against Go. It sends synthetic adapter-side requests, not guest Winsock traffic. Windows driver/DHCP/guest requests and the new EXE remain to be tested; adapter connectivity alone does not establish end-to-end guest signup support. Cloudflare must pass WebSocket upgrades at `/vm/network/`; a challenge page cannot be handled inside Windows.
