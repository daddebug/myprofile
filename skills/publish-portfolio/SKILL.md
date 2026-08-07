# Publish Portfolio

Stable workflow for moving owner drafts and every supported asset source into source control and production.

## Workflow

1. Read `docs/PUBLISHING_ARCHITECTURE.md`. Use `src/lib/publishing/publishSourceRegistry.json` as the only source-discovery authority. Never add a parallel source list in a script, component, launcher, or skill.
2. Generate a fresh production export from the current browser (`EXPORT FOR PUBLISH`). Every exported asset must carry a registered `sourceAdapterId`; stale exports with a different registry version are rejected.
3. Generate and review `output/publishing-preflight-manifest.json` with `pnpm portfolio:preflight -- <export.json>` or the import dry run. Review every source row, not only total image count.
4. Stop if a source is failed, unhandled, missing, or still uses a local/development path. Never waive a failure because another URL returned HTTP 200.
5. Run the dry import (`pnpm portfolio:import -- <export.json>`). Only after it passes may the confirmed import run (`pnpm portfolio:import -- <export.json> --confirm`). The importer uses the same registry before writes and validates all rewritten references again.
6. Verify `src/data/publishedPortfolio.json`, `src/data/uiPracticeMetadata.json`, and the manifest contain the real records and intended assets, not an empty or partial export.
7. Run `pnpm typecheck` and `pnpm build`.
8. Review the exact `git diff` and staged file list before committing anything.

## Verifying a source family actually works

A registry row plus a working import/rewrite branch does not prove a source publishes anything — check that `src/lib/productionBundleExport.ts` (the browser exporter) actually has a real collector for that `sourceAdapterId` too. A "registered but never collected" adapter produces empty output with no preflight error, since preflight only validates what's present in a bundle, not what's silently missing from it. (Discovered 2026-08-07: `project-covers-disk` had a working registry row and importer for a while but zero real collector, so project covers never reached production — see `CHANGELOG.md`.)

If one specific project has an unrelated, already-known blocker, use `--exclude-project=<id>[,<id>...]` on `import-production-bundle.mjs` rather than waiting on it or working around the check. It preserves that project's existing published state unchanged and excludes it from rewrite-revalidation; never a silent default, always logged.

## Mandatory Source Coverage

The manifest covers dynamic drafts, `imageId`, legacy `localImageId`, Project Document assets, UI Practice metadata/bundled/new images, Game Experience records and covers, browser and disk project covers, Playable Game builds and covers, external embeds, disk `/portfolio-assets` references, and generated `/images/published` references.

Repository discovery may reveal more families. An unknown family is a blocking error, not permission to skip it.

Source-specific live verification is mandatory:

- image adapters: correct MIME, positive decoded dimensions, and visible rendering;
- Game Experience: every configured cover is present;
- Playable Game: entry HTML and every mapped build file load;
- external embeds: production-safe provider URLs and an explicit embed result.

## Exclude From Commits

- `content/`, `output/`, temporary files, and recovery/backup data;
- `.claude/`, `.vs/`, `.env`, and credentials;
- local-only `public/portfolio-assets/` staging;
- `.zip`, `.data`, `.br`, and oversized assets that do not belong in source control.

## Git And Deploy Safety

- Never force push or modify branch protection/remote configuration.
- Commit and push only after explicit publishing approval.
- After push, wait for deployment and verify the real archive plus a current template project.
- HTTP 200 alone is not image success; verify decoding and viewport visibility.
- If source preflight or live verification fails, do not report publishing success.

## DILIDA DESK

The launcher sync action must execute this repository workflow and display the manifest's source-level results. It must not duplicate collectors, path rewriting, or missing-resource logic.

## Scope

Publishing and Portfolio Collection PDF generation (`skills/portfolio-collection/SKILL.md`) are separate tasks. Normal website publishing must not generate the PDF.
