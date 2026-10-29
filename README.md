# hal9k signup monorepo

Independent signup experiences, one shared Go API, **one final executable containing every asset**. No runtime Node, CDN, database or frontend build tool is needed.

## Quick start

Go 1.23+ and Make:

```sh
make dev             # http://localhost:8080; live source + real signup API
make build           # bin/hal9k-signup, statically linked with all assets embedded
./bin/hal9k-signup    # can run from anywhere, without this repository
```

Set `ADDR` to change the listen address. The development host serves source directly: edit HTML/CSS/JS and refresh. No packaging pass needed. Root `go run .` is intentionally replaced by explicit commands.

## Project boundaries

```text
api/                           Signup API package, its own tests/README/Makefile
experiences/
  physics/                     Own public/, tests/, README and Makefile
  frontpage98/                 Own public/, tests/, README and Makefile
  survey/                      Own public/, tests/, README and Makefile
landing/                       Static chooser, own public/ and tests
shared/                        Branding assets only; no shared frontend behaviour
contracts/signup-api.md        HTTP contract between experiences and API
experiences.json               Assembly catalogue (ID, title, project directory)
cmd/api/                       API-only process
cmd/dev/                       Source-serving development host + optional API proxy
cmd/package/                   Validates catalogue and assembles static assets
cmd/server/                    Final server, embeds generated embedded/ directory
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

## Final single-binary packaging

`make build` runs the Go packager, then `CGO_ENABLED=0 go build`:

1. Validate `experiences.json` (safe IDs/paths and no duplicates).
2. Collect landing `public/`, branding, and each registered project's `public/`.
3. Write the assembled tree and catalogue into `cmd/server/embedded/`.
4. Compile that tree into `bin/hal9k-signup` with `go:embed`.

The final server serves the signup API and static embedded files. It reads **no frontend files or catalogue from disk at runtime**. `cmd/server/embedded/` is ignored generated output, never frontend source. `make clean` removes generated assets and binaries; `make build` regenerates them. Direct `go build ./cmd/server` does not regenerate assets: use `make build` (or `go generate ./cmd/server` first).

Verified by copying only the executable to an unrelated directory and running browser tests against it.

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

## Checks

```sh
make test                   # assemble; Go race tests + vet; local Node checks
make -C api test
make -C landing test
make -C experiences/physics test
make -C experiences/frontpage98 test
make -C experiences/survey test
```

Optional browser tests (Node + Playwright are development-only):

```sh
npm install --prefix /tmp/hal9k-browser playwright
/tmp/hal9k-browser/node_modules/.bin/playwright install chromium
export NODE_PATH=/tmp/hal9k-browser/node_modules
make test-browser           # against running complete server on localhost:8080
```

Set `BASE_URL` for another complete server. Root tests check assembly/routing/API; landing tests discover the catalogue dynamically; each experience owns its interaction tests. To test one project's `make dev`, run its `make test-browser` (default BASE_URL is localhost:8080 at /). To test packaged output directly, set `BASE_URL=http://localhost:8080/experiences/<id>/` in that project's directory.

## Prototype limitations

**Use synthetic data.** The shared API logs accepted personal information to stdout, including addresses, birthdates and messages. It does not store/process memberships or send email. Consent, retention, access control and abuse protection need real deployment decisions. UI gates are jokes, not authentication or bot protection. The standalone binary does not change that.

Official logo, served unchanged: https://wiki.hal9k.dk/_media/planning/hal9k-logo-nofont-plain.svg.
