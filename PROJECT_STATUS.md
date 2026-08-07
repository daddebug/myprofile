# Project Status

_Read this file, `CLAUDE.md`, the relevant `skills/*/SKILL.md`, and `TASKS.md` before starting project work._

## Project

Dilida Duman's personal Game UX / Interaction Design portfolio. React 19 + TypeScript + Vite + Tailwind + Framer Motion + react-router-dom, deployed to Vercel from `origin/main`.

## Content model

- **Source-controlled**: `src/data/projects.ts` (static project registry — currently only `ui-personal-practice`), `src/data/publishedPortfolio.json`, `src/data/uiPracticeMetadata.json`, `src/content/projects/translations.ts`.
- **Template-based dynamic projects**: created via the "New Project" flow, built from `TemplateInstance[]` drafts and/or `ProjectDocument` content, held in browser localStorage/IndexedDB until published. This is now the only way new project content is authored. `DynamicProjectPage.tsx`'s `loadDraft()` resolves the current project's `templateInstances` from, in order: Portfolio Collection staging (capture mode) → owner's own `localStorage` (DEV) → the project's own published draft in `publishedPortfolio.json` via `getPublishedProjectDraft()` (production fallback). Verified live in production on `project-1ua2677` and `game-jam-8lzejf`.
- **Template-instance image publishing**: images referenced by `imageId` (image-row, direction-compare, etc.) are staged locally by the dev server under `public/portfolio-assets/` and only have a working URL on the editing machine until published. `productionBundleExport.ts`/`import-production-bundle.mjs` fetch them during export, copy them into `public/images/published/template-images-<projectId>/`, and rewrite `publicPath`. The same export/import path now explicitly includes the special source-controlled UI Practice gallery in `src/data/uiPracticeMetadata.json`; it was omitted from the first implementation. Verified in the owner's real Chrome on deployment `50ff4e3`: all 25 template images on `project-1ua2677` decoded (`naturalWidth > 0`) and were visibly rendered when scrolled into view, and both newly persisted UI Practice images decoded at 1920x1080 and were visibly rendered from `/images/published/template-images-ui-personal-practice/`.
- **Known gap, not yet fixed**: `PlayableGameTemplate`'s embedded game bundle and cover (staged via `stagePlayableGame`/`stagePlayableGameCover`) use the same local-only `/portfolio-assets/playable-games/...` pattern and are **not** covered by the fix above — a genuinely different, larger pipeline (embedded game bundles can be 100MB+). See `TASKS.md`.
- **Browser-only owner drafts**: localStorage (versioned `dilida-portfolio:*:v1` keys) and several IndexedDB databases (project covers, project body assets, game covers). Never touched directly by git; move to source control only via `EXPORT FOR PUBLISH` → `pnpm portfolio:import` (dry-run by default, backs up existing published files).

## Bespoke legacy system: retired

The old one-off bespoke draft pages (own hardcoded storage key + own dedicated IndexedDB per project) no longer exist in the codebase. `migrationAdapters` (`src/lib/migrations/migrationRunner.ts`) and the bespoke lookup maps in `src/lib/deletePortfolioProject.ts` are now empty — kept as generic, reusable infrastructure rather than deleted, in case a future one-off page is ever needed again.

## Portfolio Collection export

`/:locale/export` opens the selection editor (project order, UI Works, games, section toggles). A Playwright/pdf-lib pipeline performs the actual multi-project PDF export: vector/selectable text, reference-counted asset staging, per-mode visual rules. Full rule set: `skills/portfolio-collection/SKILL.md`.

- `src/lib/pdf/pdfExportRegistry.json` is now the single machine-readable registry of every Collection PDF content family (cover, TOC, dynamic project pages, UI Personal Practice, UI Works, Game Experience, Contact, template images, project covers, Figma/external previews, every `src/templates/*.tsx` template), each declaring source of truth, renderer, sizing, horizontal safe area, padding, image handling, empty-content behavior, segmentation, and verification rules.
- `docs/PDF_EXPORT_ARCHITECTURE.md` documents the registry, the three renderers (`captureProjectPage`/`renderSectionPdf`/`captureCoverPage`), two confirmed engine-level risks (unscoped `@page` rule in `src/styles.css` still inert only because every call site sets `preferCSSPageSize: false`; `page.pdf()` always evaluates `@media print` regardless of `emulateMedia`), and the DILIDA DESK integration contract.
- `scripts/pdf-export-preflight-lib.mjs` (`buildPdfExportPreflight`) validates a selection + staged project payloads before capture: unresolved drafts, unsupported template instances, missing/unresolved images, local-only paths, and page types with no registered rule are all blocking.
- `scripts/pdf-export-postflight-lib.mjs` (`buildPdfExportPostflight`) inspects a real generated PDF plus its sibling `-diagnostics.json` files: file size, page count/dimensions, best-effort selectable-text presence, raster image inventory and likely duplicates, the project blank-tail rule, and a deterministic TOC safe-area arithmetic check (flags the registry's own noted risk: a full 7-slot TOC grid's worst-case label extent is ~198px past the safe-right edge — not yet confirmed against a real rendered PDF).
- `pnpm typecheck`/`pnpm build` both pass. A working Node/pnpm runtime for this machine is `D:\dilida-desk\runtime\node-v22.23.1-win-x64` (referenced in `.claude/launch.json`); prepend it to `PATH` when Node isn't otherwise resolvable in a shell tool.
- **Project-page blank-segment pagination bug**: real cause is still not root-caused — it is NOT the `data-project-print`-scoped `figure/table/img` CSS rule (proven never live during collection capture) and NOT break-inside CSS on any element (tested both `auto` and `avoid`, identical failure both times). A stopgap is in place: `maxSegmentHeightPx` (`scripts/portfolioCollectionExportPlugin.ts`) raised from 3000 to 16000px so most real projects need only one segment, avoiding the bug class. Verified fixed for two real previously-failing projects. Projects tall enough to still need multiple segments (`captureHeight` > 16000px) remain exposed — see `TASKS.md`.
- The original three PDF issues (viewer performance, project trailing blank space, TOC horizontal safe margins) remain formally unverified — see `TASKS.md`.

## Publishing architecture

- `src/lib/publishing/publishSourceRegistry.json` is the single machine-readable source registry. Browser export assets carry `sourceAdapterId`; exports from another registry version are rejected.
- `scripts/publishing-preflight-lib.mjs` generates `output/publishing-preflight-manifest.json` with projects/sections, content records, every discovered browser or disk asset, adapter ownership, source/intended paths, byte size, MIME type, and source-level failures.
- Production import runs the same preflight before writes and after path rewriting. Unknown sources, missing configured covers/assets, local/dev paths, and published references without intended output are blocking errors.
- `docs/PUBLISHING_ARCHITECTURE.md` documents the inventory and verification rules. DILIDA DESK sync is paused and must consume this manifest rather than duplicate discovery.
- Playable Game files are now discovered and listed, but large-build production hosting/import remains unresolved and blocks publishing instead of being silently omitted.
- **Project covers publish correctly now** (2026-08-07, commit `8a57564`, verified live). `src/lib/productionBundleExport.ts` collects covers from `content/projects/project-covers.json` (the `project-covers-disk` adapter — the real, currently-used owner-editing path via `ProjectCoverEditor.tsx`), not the long-dead `project-covers-indexeddb` store. A registry row having a real importer implementation does not guarantee it has a real exporter/collector implementation — both ends must be checked when auditing a source family, not just one.
- `import-production-bundle.mjs` supports an explicit `--exclude-project=<id>[,<id>...]` flag for excluding specific projects from one publish run while preserving (not deleting) their existing published state — used when a project has an unrelated, already-known blocker (see Playable Game hosting below). Never a silent default; always logged when used.

## XMind Breakdown template

`src/templates/XMindBreakdownTemplate.tsx` supports `single` and `double` display modes. Single mode renders through its own `SingleXMindBreakdown` component (intentionally not shared with double mode's card/detail-modal `SingleBreakdown`), with a capped horizontal inset so it isn't squeezed by double mode's wider default spacing. Verified working on a real project's single-XMind instance.

## Reusable instructions

- `CLAUDE.md` — permanent project-wide rules, pointer to task skills, and the "Continuous rule updates" policy.
- `skills/safe-project-editing/SKILL.md`, `skills/portfolio-collection/SKILL.md`, `skills/project-deletion/SKILL.md`, `skills/publish-portfolio/SKILL.md`.

## Constraints

- The default sandboxed browser tool is an isolated/disposable profile — it cannot see the owner's real dynamic-project drafts or IndexedDB data. Claude in Chrome, when connected, can reach the owner's real profile and is the only way to inspect or modify real browser-stored project data.
- Never clear localStorage/IndexedDB wholesale, never reset storage keys, never overwrite drafts — see `CLAUDE.md` and `skills/safe-project-editing/SKILL.md`.
- Only commit, push, or publish from an AI session when explicitly requested and confirmed. First real publish happened 2026-08-07 (commit `fabb8b0`) — see `CHANGELOG.md`.
