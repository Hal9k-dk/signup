# Signup chooser

Independent static project. `public/` is its complete output; no build tool required.

The chooser fetches `/experiences.json`, creates links safely using textContent, and randomly selects from the same list. It follows the user's light/dark preference. JavaScript is required to load the catalogue; errors are shown explicitly.

- `make dev`: serve source using the monorepo development host, with catalogue and experience routes.
- `make test`: local JavaScript syntax check (Node).
- `make test-browser`: tests catalogue discovery, every lucky choice, themes and mobile layout (Playwright; see root README).

Does not import experience code or know their number or order. Shared branding lives at `/shared/hal9k-logo.svg`. The root `experiences.json` is assembly configuration, not part of the API.
