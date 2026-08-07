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
