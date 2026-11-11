# hal9k signup monorepo

Independent signup experiences, one shared Go API, **one server and assembled asset tree**, packaged together in a container, including the Windows 98 preview's matched lazy disk/snapshot and CD library. No runtime Node, CDN, database or frontend build tool is needed. Windows 98 is proprietary and not licensed by v86; see `experiences/windows98/README.md` before distributing or deploying it.

## Quick start

Go 1.23+ and Make. Assembly/build/tests also require `xorriso` to regenerate the Windows 98 CD (`apt-get install xorriso` or `pacman -S xorriso`):

```sh
make dev             # http://localhost:8080; live source + real signup API
make build           # bin/hal9k-signup + bin/assets/
./bin/hal9k-signup    # http://localhost:8080; finds assets beside the executable
# Or build/run without installing Go or xorriso on the host:
make container       # cached Podman build, localhost/hal9k-signup:dev
make container-run   # http://localhost:8080
```

Set `ADDR` to change the listen address. The development host serves source directly: edit HTML/CSS/JS and refresh. No packaging pass needed. Root `go run .` is intentionally replaced by explicit commands.

## Project boundaries

```text
api/                           Signup API package, its own tests/README/Makefile
experiences/
  physics/                     Own public/, tests/, README and Makefile
  frontpage98/                 Own public/, tests/, README and Makefile
  survey/                      Own public/, tests/, README and Makefile
  terminal/                    CRT renderer, 2400-baud terminal signup experience
landing/                       Static chooser, own public/ and tests
shared/                        Branding assets only; no shared frontend behaviour
contracts/signup-api.md        HTTP contract between experiences and API
experiences.json               Assembly catalogue (ID, title, project directory)
cmd/api/                       API-only process
cmd/dev/                       Source-serving development host + optional API proxy
cmd/package/                   Validates catalogue and assembles static assets
cmd/server/                    Final server, serves assembled assets beside executable
internal/site/                 Development/packaging infrastructure, not experience UI
internal/run/                  Shared HTTP lifecycle and graceful shutdown
 tests/browser.cjs             Cross-project assembly smoke test only
Makefile                       Repository convenience commands
```

One root Go module keeps backend tooling simple. Each frontend is a separate **static project**, not a theme or component of a shared frontend application. No experience imports another's source. Each owns its transport adapter and submission lifecycle; the documented HTTP API is the integration boundary. Tiny private adapters are deliberately duplicated instead of introducing a shared frontend package. Shared branding is served at `/shared/`.

Every project's `public/` directory is its complete build output today, so there is no reason to introduce a bundler or mandatory npm install. A future project can generate its own `public/` output before assembly without changing how other experiences work.

## Work on one experience independently

```sh
cd experiences/survey       # or physics / frontpage98
make dev                    # this project at /, real API included
make test                   # local Node checks; physics also runs simulation tests
```

Other experiences are not served or imported in this mode; their source directories are not needed. The selected experience is also available at its assembled `/experiences/<id>/` URL. Use a separate process for the API if desired:

```sh
make api                    # API-only, default :8081 (separate terminal)
cd experiences/survey
API=http://localhost:8081 ADDR=:8090 make dev
```

The dev host proxies `/api/` to the supplied API URL. Same-origin requests mean no CORS exceptions or API URL hardcoding in the experience. `api/` can be tested and run without any frontend assets.

## Packaging

`make build` regenerates the HAL9K CD, runs the Go packager, then builds a small static Go executable. Output is **`bin/hal9k-signup` plus `bin/assets/`**; keep these together when copying to another machine. The default asset path is relative to the executable, not your working directory. `ASSET_DIR=/absolute/path` overrides it. Missing assets fail startup rather than silently serving source.

The CD library exceeds Go's multi-gigabyte compiler/object limits (`compile: data too large`), so assets are deliberately **not embedded**. The server streams static files from disk using the same origin, routes, browser headers and HTTP range support. No runtime Node or external asset service is needed.

The packager validates `experiences.json`, gathers the independent static projects and writes `bin/assets/`. Windows 98 still packages only the release selected by `public/images/published.json` and its manifest: matched compressed state and async disk parts, plus frontend/firmware/pinned v86/CD assets. Raw masters, drafts and inactive VM releases are excluded. Live development is unchanged. Generated assets are ignored; `make clean` removes them. Direct `go build ./cmd/server` does not assemble assets; use `make build`.

## Container image

The GitHub Actions container workflow runs `make test` on pull requests and pushes to `master`. After successful checks on `master` (or a manual run on `master`), it builds the server and assembled assets inside a multi-stage Docker build and pushes the same image to GHCR with both tags:

```text
ghcr.io/hal9k-dk/signup:latest
ghcr.io/hal9k-dk/signup:<full-commit-sha>
```

Use the SHA tag for deployments tied to a specific commit; `latest` moves with successful publishing runs. The workflow uses the repository's `GITHUB_TOKEN` with package write permission, so no additional publishing secret is required. Set the GHCR package visibility to public if unauthenticated pulls are needed.

```sh
docker run --rm -p 8080:8080 ghcr.io/hal9k-dk/signup:latest
# Or build and run locally (Podman):
make container
make container-run
# Equivalent explicit run:
podman run --rm -p 8080:8080 localhost/hal9k-signup:dev
# Docker also works:
make container CONTAINER_ENGINE=docker IMAGE=hal9k-signup
docker run --rm -p 8080:8080 hal9k-signup
```

The runtime image contains the static executable, `/assets/` and HTTPS CA certificates, runs as a non-root user, and listens on port 8080 by default. It requires no volumes. Set `ADDR` if needed (and adjust the container port mapping). Images currently target `linux/amd64`.

### Build cache and local iteration

`make container` defaults to Podman with intermediate-layer caching enabled. Override `CONTAINER_ENGINE`, `IMAGE` or `PORT` as needed (`PORT` is used by `make container-run`). Build and run are separate: rebuilding does not replace a running container. Stop it, rebuild, then run again. The first build still copies the entire CD collection; lazy delivery saves browser traffic, not image size.

The Dockerfile copies Go dependencies/code separately from frontend and multi-gigabyte media. The final image has a stable media layer followed by the frontend and server, so HTML/JS changes do not recompile Go or recopy CD data into a compiler. Changing media rebuilds its assembly layer. Only the pointer-selected VM release reaches the runtime image, even if inactive releases are present in the checkout. CI retains BuildKit's GitHub Actions cache; no publishing/deployment command is run by local Make targets.

Build context copies are explicit (no `COPY . .`); `.env` files remain excluded. Local `container-run` passes no Slack credentials. Supply `--env-file .env` explicitly to `podman run` only when wanted. `make dev` remains the fastest frontend edit/refresh loop.

### Slack notifications and runtime secrets

Every valid signup is still logged. Set `SLACK_WEBHOOK_URL` at runtime to also send all signup fields to a Slack incoming webhook. Keep the webhook out of source, images, build arguments and GitHub Actions. If a webhook was shared publicly or in chat, rotate it first.

```sh
cp .env.example .env
chmod 600 .env
# Edit .env: SLACK_WEBHOOK_URL=<your newly rotated webhook URL>
docker run --rm --env-file .env -p 8080:8080 ghcr.io/hal9k-dk/signup:latest
```

`.env` and `.env.*` are ignored by Git (except the placeholder `.env.example`) and excluded from Docker builds. Docker reads `.env` on the host and injects its values; the application does not read a `.env` file itself. For a directly run binary or `make dev`, export `SLACK_WEBHOOK_URL` in the process environment (or source a trusted, shell-compatible `.env` first).

Slack delivery is synchronous with a five-second timeout. A completed signup returns success only after Slack accepts the notification. A failed Slack request returns HTTP 502, logs a redacted error, and leaves the signup in the existing stdout log. No automatic retries or durable queue exist; a manual retry may duplicate a notification if Slack accepted a request whose response was lost. With no webhook configured, a startup warning is logged and the API remains log-only for local development. **Set the webhook in production.** Restrict Slack channel access and retention: messages contain personal information, including birthdates, addresses and free-text messages.

## Adding an experience

1. Create an independent project containing `public/index.html`, local CSS/JS/assets, tests, README and Makefile. Use directory-relative private asset paths.
2. Implement the contract in `contracts/signup-api.md`. Do not import another experience's form or adapter. Keep unrelated answers out of the API payload.
3. Add an entry to `experiences.json`, e.g. `{"id":"example","title":"Another strange experience","project":"experiences/example"}`.
4. Run its own tests, `make test`, and `make build`. Landing and lucky selection discover the catalogue automatically, with no Go API changes.

The landing page is static and fetches the catalogue via JavaScript. It follows light/dark preferences. It does not hardcode experience count or order; catalogue-load errors have a visible message. The chooser requires JavaScript.

## Existing experiences

- **physics:** dark-mode gate, four-block Matter.js stack challenge, pointer/touch and keyboard placement, reset. Page dismantling begins after 15 minutes of active visible dark-mode time. Rebuild preserves form input; reduced-motion users start paused. Matter.js and its MIT license belong solely to this project.
- **frontpage98:** classic bevelled form buttons, table-style rows, ticker, construction stripes and decorative counter. No physics or dark-mode gate.
- **survey:** fifteen screens: all signup fields plus five required nonsense answers. Back navigation preserves answers; server validation returns to the relevant question. Nonsense answers stay in page memory and are never sent.
- **terminal:** a CRT-rendered Danish signup interview with output paced at 2400 baud, review/edit support, and explicit confirmation before posting through its own API adapter.

- **windows98:** real v86 Windows 98 desktop resumed from a memory snapshot, with pause/resume, keyboard release and fresh restore. Technical preview only: no guest signup program yet. Uses a user-authored QEMU/v86 disk and matched memory snapshot, with local raw-disk authoring and handover export; the old copy.sh OS assets are removed. Production/distribution rights must be resolved. See `experiences/windows98/README.md`.

## Checks

```sh
make test                   # assemble; Go race tests + vet; local Node checks
make -C api test
make -C landing test
make -C experiences/physics test
make -C experiences/frontpage98 test
make -C experiences/survey test
make -C experiences/terminal test
```

Optional browser tests (Node + Playwright are development-only):

```sh
npm install --prefix /tmp/hal9k-browser playwright
/tmp/hal9k-browser/node_modules/.bin/playwright install chromium
export NODE_PATH=/tmp/hal9k-browser/node_modules
make test-browser           # against running complete server on localhost:8080
```

Set `BASE_URL` for another complete server. Root tests check assembly/routing/API; landing tests discover the catalogue dynamically; each experience owns its interaction tests. To test one project's `make dev`, run its `make test-browser` (default BASE_URL is localhost:8080 at /). To test packaged output directly, set `BASE_URL=http://localhost:8080/experiences/<id>/` in that project's directory.

## Signup handling and deployment considerations

Production submissions are real signup requests delivered to hal9k via Slack for handling by the association. Configure `SLACK_WEBHOOK_URL` in production. The shared API also logs personal information to stdout, including addresses, birthdates and messages. There is no application database, automated membership administration or email delivery. Restrict log and Slack access and retention, and establish consent and abuse-protection policies for deployment. UI gates are jokes, not authentication or bot protection. Use synthetic data for development and testing.

Official logo, served unchanged: https://wiki.hal9k.dk/_media/planning/hal9k-logo-nofont-plain.svg.
