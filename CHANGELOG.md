# Changelog

Only work that was actually completed and verified (passed the required check, or confirmed by the user) is recorded here.

## 2026-08-07

### Verified

- XMind single-display-mode layout: the instance was replaced with the optimized JSON and the real project page was confirmed to display correctly. Resolves the Template-Gallery-only verification gap and the optimized-JSON confirmation noted previously in `TASKS.md`.
- Production template images after the UI Practice fix (`50ff4e3`): the owner's real Chrome loaded the same fresh Vercel bundle as the local build (`index-CVyRQaCB.js`). On `project-1ua2677`, all 25 image slots decoded with positive natural dimensions, returned HTTP 200 with the correct `image/*` content type, and were visibly rendered when scrolled into view. On `ui-personal-practice`, both newly persisted gallery images decoded at 1920x1080 and were visibly rendered from their published paths. No failed image requests were recorded; the only console error observed was an unrelated unauthenticated Figma embed request.

### Removed

- Legacy bespoke project `3d-character-ui-rhythm` (title: 任务到体验：重新分配界面节奏) fully removed from the codebase: static catalog entry, route registration, translations, PDF/migration compatibility code, and its exclusive source files (`ThreeDCharacterUiDraftPage.tsx`, `threeDCharacterDraftStorage.ts`, `threeDCharacterImageDraftDb.ts`, `threeDCharacterUiMigration.ts`). Verified via `pnpm typecheck`, `pnpm build`, and live checks (archive listing, direct route navigation, `/export` selection).
- Legacy project's real browser data deleted directly in the owner's browser profile: localStorage draft key `dilida-portfolio:3d-character-ui-rhythm:draft:v1`, exclusive IndexedDB database `dilida-portfolio-3d-character-ui-assets`, its entry in `dilida-portfolio:project-public-meta:v1`, and its entries in both saved Portfolio Collection/export selection configs. Verified by re-scanning every `dilida-portfolio:*` localStorage key and the live IndexedDB database list — zero remaining references; all other projects confirmed intact and still rendering.

### Added

- Reusable project instruction files: `skills/safe-project-editing/SKILL.md`, `skills/portfolio-collection/SKILL.md`, `skills/project-deletion/SKILL.md`, `skills/publish-portfolio/SKILL.md`, referenced from `CLAUDE.md`'s "Task skills" section.

### Verified — publish pipeline mechanics only

- Full production export/import/build/deploy pipeline run end to end: fresh `EXPORT FOR PUBLISH` bundle (6 real drafts, 7 canonical projects, 0 missing references) → dry-run then confirmed `pnpm portfolio:import` → `pnpm typecheck` and `pnpm build` both passed → git diff reviewed, `content/`, `output/`, `public/portfolio-assets/`, `.claude/`, `.vs/` added to `.gitignore` and excluded (all local-only, largest is 1.1GB) → committed (`fabb8b0`) and pushed to `origin/main` → Vercel production deployment confirmed `● Ready`.

### Fixed

- Production rendering for template-based dynamic projects (`src/pages/DynamicProjectPage.tsx`, commit `cd3b6f9`): `loadDraft()` now falls back to the current project's own published draft (`getPublishedProjectDraft()`) whenever DEV/localStorage/staging don't apply, instead of always returning an empty draft outside DEV. DEV/owner localStorage and Portfolio Collection staging behavior unchanged. Verified live in production on `project-1ua2677` ("任务到体验：重新分配界面节奏") and `game-jam-8lzejf` — both now render their full body content (system breakdowns, comparisons, Figma embeds, playable game embed, etc.), not just the hero. No console errors.
- Production image loading for dynamic template-instance images (commit `5b10ba1`): images referenced by `imageId` (image-row, direction-compare, etc. — staged via `stageDynamicProjectImage`) carried a `publicPath` pointing at the dev server's local-only `/portfolio-assets/` directory, which doesn't exist in production. The export/import pipeline now publishes and rewrites those paths. The original HTTP/content-type check did not establish visual visibility and did not cover the separate source-controlled UI Practice gallery, so it must not be treated as complete end-to-end verification.
- UI Practice production gallery images (commit `50ff4e3`): `productionBundleExport.ts` and `import-production-bundle.mjs` now include the special `src/data/uiPracticeMetadata.json` image references in the same published-image pipeline. The two affected files are deployed under `public/images/published/template-images-ui-personal-practice/`, and their metadata now uses those published paths. This is the proven fix for the real-browser divergence; no playable-game bundle was changed.
