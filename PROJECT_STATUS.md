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

## XMind Breakdown template

`src/templates/XMindBreakdownTemplate.tsx` supports `single` and `double` display modes. Single mode renders through its own `SingleXMindBreakdown` component (intentionally not shared with double mode's card/detail-modal `SingleBreakdown`), with a capped horizontal inset so it isn't squeezed by double mode's wider default spacing. Verified working on a real project's single-XMind instance.

## Reusable instructions

- `CLAUDE.md` — permanent project-wide rules, pointer to task skills, and the "Continuous rule updates" policy.
- `skills/safe-project-editing/SKILL.md`, `skills/portfolio-collection/SKILL.md`, `skills/project-deletion/SKILL.md`, `skills/publish-portfolio/SKILL.md`.

## Constraints

- The default sandboxed browser tool is an isolated/disposable profile — it cannot see the owner's real dynamic-project drafts or IndexedDB data. Claude in Chrome, when connected, can reach the owner's real profile and is the only way to inspect or modify real browser-stored project data.
- Never clear localStorage/IndexedDB wholesale, never reset storage keys, never overwrite drafts — see `CLAUDE.md` and `skills/safe-project-editing/SKILL.md`.
- Only commit, push, or publish from an AI session when explicitly requested and confirmed. First real publish happened 2026-08-07 (commit `fabb8b0`) — see `CHANGELOG.md`.
