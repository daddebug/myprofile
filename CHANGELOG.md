# Changelog

Only work that was actually completed and verified (passed the required check, or confirmed by the user) is recorded here.

## 2026-08-07

### Verified

- XMind single-display-mode layout: the instance was replaced with the optimized JSON and the real project page was confirmed to display correctly. Resolves the Template-Gallery-only verification gap and the optimized-JSON confirmation noted previously in `TASKS.md`.

### Removed

- Legacy bespoke project `3d-character-ui-rhythm` (title: 任务到体验：重新分配界面节奏) fully removed from the codebase: static catalog entry, route registration, translations, PDF/migration compatibility code, and its exclusive source files (`ThreeDCharacterUiDraftPage.tsx`, `threeDCharacterDraftStorage.ts`, `threeDCharacterImageDraftDb.ts`, `threeDCharacterUiMigration.ts`). Verified via `pnpm typecheck`, `pnpm build`, and live checks (archive listing, direct route navigation, `/export` selection).
- Legacy project's real browser data deleted directly in the owner's browser profile: localStorage draft key `dilida-portfolio:3d-character-ui-rhythm:draft:v1`, exclusive IndexedDB database `dilida-portfolio-3d-character-ui-assets`, its entry in `dilida-portfolio:project-public-meta:v1`, and its entries in both saved Portfolio Collection/export selection configs. Verified by re-scanning every `dilida-portfolio:*` localStorage key and the live IndexedDB database list — zero remaining references; all other projects confirmed intact and still rendering.

### Added

- Reusable project instruction files: `skills/safe-project-editing/SKILL.md`, `skills/portfolio-collection/SKILL.md`, `skills/project-deletion/SKILL.md`, `skills/publish-portfolio/SKILL.md`, referenced from `CLAUDE.md`'s "Task skills" section.

### Verified — publish pipeline mechanics only

- Full production export/import/build/deploy pipeline run end to end: fresh `EXPORT FOR PUBLISH` bundle (6 real drafts, 7 canonical projects, 0 missing references) → dry-run then confirmed `pnpm portfolio:import` → `pnpm typecheck` and `pnpm build` both passed → git diff reviewed, `content/`, `output/`, `public/portfolio-assets/`, `.claude/`, `.vs/` added to `.gitignore` and excluded (all local-only, largest is 1.1GB) → committed (`fabb8b0`) and pushed to `origin/main` → Vercel production deployment confirmed `● Ready`.

### Fixed

- Production rendering for template-based dynamic projects (`src/pages/DynamicProjectPage.tsx`, commit `cd3b6f9`): `loadDraft()` now falls back to the current project's own published draft (`getPublishedProjectDraft()`) whenever DEV/localStorage/staging don't apply, instead of always returning an empty draft outside DEV. DEV/owner localStorage and Portfolio Collection staging behavior unchanged. Verified live in production on `project-1ua2677` ("任务到体验：重新分配界面节奏") and `game-jam-8lzejf` — both now render their full body content (system breakdowns, comparisons, Figma embeds, playable game embed, etc.), not just the hero. No console errors.
