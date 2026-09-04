# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

Chrome Extension (Manifest V3) that reports product origin on Amazon product pages,
with the evidence behind each claim. Public repo, published under Bates Solutions Inc.

**Structure:**

- `src/background/` — service worker (deep-search orchestration, permission requests)
- `src/content/` — content script: page extraction and badge injection
- `src/content/adapters/` — per-marketplace extraction
- `src/panel/` — in-page detail panel (React, Shadow DOM)
- `src/popup/` — toolbar popup (React)
- `src/options/` — settings page
- `src/shared/` — types, storage, messages, logger, country resolution
- `test/fixtures/` — saved product-page HTML, per marketplace

## `docs/` is local-only — this diverges from the other projects here

`/docs/` is gitignored **in full**. Plans, `prior-art.md` and the prior-art teardown
live only on this machine and are not backed up by the remote. This is deliberate:
`docs/reference/` holds a third party's all-rights-reserved extension build, downloaded
for analysis, and the repo is public.

Two consequences:

- Anything a contributor or a future reader needs belongs in `README.md` or another
  tracked file. Do not reference `docs/` paths from tracked files.
- Before any push, `git ls-files | grep -Ei 'crx|zip|docs/'` must return nothing.

The prior extension's code is **not reused anywhere**. This is a clean-room
implementation; only the problem statement and the measured failure modes were kept.

## Commands

```bash
npm run dev        # Vite dev server with HMR
npm run build      # Production build to dist/
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest
npm run format     # Prettier
```

Build somewhere else — e.g. onto the Windows filesystem, so Chrome doesn't lose the
unpacked extension when WSL stops. The build empties this directory, so the value is
validated (absolute, not containing the repo, empty or a previous build output):

```bash
COUNTRY_MADE_IN_DIST=/mnt/c/Users/you/country-made-in npm run build
```

## Conventions

- Package manager: `npm` (`save-exact=true` — versions are pinned)
- Build tool: Vite + `@crxjs/vite-plugin`
- UI: React with Tailwind CSS
- Language: TypeScript (strict mode)
- Node 22 (see `.nvmrc`)

### Tests are first-class here

Extraction and country resolution are pure functions over fixtures, with real unit
tests. Parsing correctness *is* the product — CI fails on a test failure, and a change
to parsing without a test is incomplete.

### Content scripts are declared in the manifest

Not registered at runtime via `chrome.scripting`. Runtime registration buys nothing
here and makes the enable/disable toggle a source of state drift.

### Permissions are minimal by default

Every permission is a question at Chrome Web Store review time. Broad host access is
`optional_host_permissions`, requested via `chrome.permissions.request()` on an
explicit user gesture — never at install.

## Branching Strategy (GitHub Flow — Epic/Story)

- **Never push directly to `main`** — all changes go through PRs
- **Epic branches** map to implementation plans: `epic/XX-description`
  (e.g. `epic/01-project-scaffolding`), created from `main`, merged back via PR
- **Story branches** are scoped units within an epic: `story/XX-YY-description`
  (e.g. `story/01-02-toolchain`), created from the epic branch, merged back via PR
- Keep branches short-lived — merge and delete after PR approval
- Rebase story branches on the epic branch before merging to keep history clean

## Git Commits & PRs

- **ALWAYS create a PR for code changes** — never push directly to `main` or an epic
  branch without a PR
- **STOP after creating a PR** — wait for the user to review and confirm the merge
  before continuing to the next story
- **After a PR is merged** — delete the local branch and pull the target branch before
  continuing
- Conventional commits (`feat:`, `fix:`, `chore:`, …)
- Do NOT include "Generated with Claude Code" or similar self-references in commit
  messages or PR descriptions
- Do NOT add Co-Authored-By lines mentioning Claude or Anthropic

## Plan Status Tracking

Plans live in `docs/plans/` — **local only**, see above. Status is tracked by folder:

- **Active:** `docs/plans/XX-plan-name.md`
- **Complete:** `docs/plans/completed/XX-plan-name.md` — move here when the epic
  branch PR merges into `main`

Because `docs/` is untracked, moving a plan is a local `mv`, not a `git mv`, and there
is no commit to make for it. Update the status table in `docs/plans/README.md` too.
