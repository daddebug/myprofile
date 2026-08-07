# Changelog

Only work that was actually completed and verified (passed the required check, or confirmed by the user) is recorded here.

## 2026-08-07

### PDF export architecture

- Added `docs/PDF_EXPORT_ARCHITECTURE.md`, `src/lib/pdf/pdfExportRegistry.json`, `scripts/pdf-export-preflight-lib.mjs`, and `scripts/pdf-export-postflight-lib.mjs` documenting/registering every Collection PDF content family (cover, TOC, dynamic project pages, UI Personal Practice, UI Works, Game Experience, Contact, template images, project covers, Figma/external previews, every `src/templates/*.tsx` template) with source-of-truth, renderer, sizing, safe-area, and verification rules. Verified with `pnpm typecheck` and `pnpm build` (both pass) once a working Node/pnpm runtime was located (`D:\dilida-desk\runtime\node-v22.23.1-win-x64`, referenced in `.claude/launch.json`).
- Fixed the real project-page pagination bug (segment-count mismatch) for an emergency export. Real repro: `project-1ua2677` generated 4 PDF segments for 3 planned slices, then `interaction-intelligence-system` generated 5 for 4. Ruled out the previously-suspected `data-project-print`-scoped `figure/table/img` CSS rule (its only setter, the owner-only manual print button, is never triggered during collection capture) and two break-inside CSS variants (forcing `auto`, forcing `avoid` on top-level modules) — both reproduced the identical failure, proving break-inside CSS was never the actual lever. Applied a stopgap instead: raised `maxSegmentHeightPx` in `scripts/portfolioCollectionExportPlugin.ts` from 3000 to 16000 so most real projects need only a single segment, sidestepping the bug class. Verified against real generated PDFs (`portfolio-collection-en-2026-08-07T06-05-42-388Z.pdf` and a full-selection run) opened in a real PDF viewer: no segment-count error, cover/TOC readable and unclipped, project title/body/images render cleanly, Contact page intact. The true root cause (likely a `page.pdf()` print-layout vs. on-screen `captureHeight` measurement mismatch) is not yet fixed — see `TASKS.md` for the remaining exposure on projects tall enough to still need multiple segments.

### Publishing architecture

- Added one authoritative publishing source registry and documented every currently discovered content/asset family in `docs/PUBLISHING_ARCHITECTURE.md`, including browser drafts and IndexedDB assets, disk project images/covers, UI Practice, Game Experience, Playable Game trees/covers, external embeds, and production assets.
- Added generated source-level preflight manifests and focused tests. Production import now fails before writes for unknown adapters, missing referenced/configured assets, local/dev-only references after rewriting, and published paths not represented in intended output.
- Browser exports now identify every exported image with `sourceAdapterId` and registry version. DILIDA DESK sync remains paused until it calls this workflow; no publish, content change, or deployment was performed.
- Playable Game production hosting remains unresolved and is now reported as a blocking source instead of being silently omitted.

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
