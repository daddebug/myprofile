# Publishing Architecture

## Invariant

`src/lib/publishing/publishSourceRegistry.json` is the machine-readable authority for portfolio publishing sources. The browser exporter, production importer, preflight generator, tests, and launcher integration identify records and assets by its `sourceAdapterId`. A publishing feature must not add a second asset-discovery table.

The generated preflight is `output/publishing-preflight-manifest.json`. It is local audit output and is not committed. No production data or asset is written unless the preflight and post-rewrite checks both pass.

## Sources

| Adapter | Source of truth | Export collector | Import destination | Rewrite | Live verification |
| --- | --- | --- | --- | --- | --- |
| `project-catalog` | Browser project metadata export | `getProjectCollectionExportStore()` | `publishedPortfolio.json#projectCatalog` | None | Every canonical project exists once |
| `dynamic-project-drafts` | `dilida-portfolio:dynamic-project:<projectId>:draft:v1` | Dynamic projects discovered from catalog | `publishedPortfolio.json#drafts` | Registered image refs to `/images/published/...` | Matching template-instance count/IDs |
| `project-documents` | Project Document browser export store | Project Document exporter | `publishedPortfolio.json#projectDocuments` | Asset/poster paths to published project-body paths | Every media/poster resolves and decodes |
| `ui-practice-metadata` | `uiPracticeMetadata.json` plus owner edits | UI Practice collector | `uiPracticeMetadata.json` | New image refs to published paths | Item count/order and visible images |
| `ui-practice-bundled-images` | `src/assets/ui-practice-optimized` | Vite `import.meta.glob` | Hashed `dist/assets` | Vite URL | Every metadata filename resolves |
| `game-experience-records` | Browser Game Experience store | Game Experience exporter | `publishedPortfolio.json#gameExperience` | Cover IDs to published cover paths | Every configured cover decodes |
| `project-covers-indexeddb` | Project-cover IndexedDB | Read-only browser collector (currently unused — see note) | `public/images/published/covers` | Published cover URL | Archive and hero cover decode |
| `project-covers-disk` | `content/projects/project-covers.json` | Per-project `getDiskProjectCover()` resolve fetch (`productionBundleExport.ts`) | `public/images/published/covers` | Published cover URL | Archive/homepage card decode + visible render |
| `project-body-indexeddb-assets` | Project-body IndexedDB | Referenced `assetId`, `posterAssetId`, legacy `localImageId` | `public/images/published/project-body/<projectId>` | Published body URL | Every reference resolves and decodes |
| `dynamic-template-images` | `content/projects/<projectId>/project-images.json` | `imageId` + `publicPath` collector | `public/images/published/template-images/<projectId>` | Published image URL | Mapping, bytes, MIME, dimensions, visibility |
| `ui-practice-images` | UI Practice project-image manifest | UI Practice `imageId` collector | Published UI template-image directory | Published image URL | Metadata/mapping agree; image visible |
| `game-experience-covers` | Game-cover IndexedDB | Configured cover-ID collector | `public/images/published/game-covers` | Published cover URL | Missing configured cover is fatal |
| `playable-game-builds` | Per-project `playable-games.json` and build trees | Recursive disk collector | Intended production build tree | Production entry URL | Entry and every build file |
| `playable-game-covers` | `playable-games.json#covers` | Disk cover collector | Intended published playable covers | Published cover URL | Hash/size/MIME and visible image |
| `legacy-static-game-build` | `public/games/afterwarm` and configured remote payloads | Public tree/environment collector | Vite public output or HTTPS payload | Public copy/HTTPS | Entry and configured payloads |
| `external-embeds` | Figma and external source URL fields | Recursive URL collector | External URL | Validated HTTPS | Non-local provider URL |
| `published-assets` | Generated data and published files | Post-rewrite collector | Production build | None | Every metadata path has an output file |

The detailed discovery, missing policy, output strategy, rewrite strategy, and verification strategy for every row live in the registry itself.

**Rule discovered 2026-08-07 (project covers)**: a registry row and a working importer/rewrite branch (`import-production-bundle.mjs`) do not prove a source is actually publishing anything — `project-covers-disk` had both, correctly, for a while with zero real covers ever reaching production, because `src/lib/productionBundleExport.ts` (the browser-side exporter) never implemented a collector for it; it only ever collected the long-dead `project-covers-indexeddb` store. When auditing whether a registered source family actually works end to end, check the **exporter** (does it really collect this adapter's data into the bundle?) with the same scrutiny as the importer — a "registered but never collected" adapter fails silently (empty output, no preflight error) rather than loudly, since preflight only validates what's present in a bundle, not what's missing from it entirely.

## Manifest

The generated manifest contains:

- every canonical project and discovered section/template instance;
- every catalog, draft, Project Document, UI Practice, Game Experience, and disk-manifest content record;
- every browser blob, disk image, playable build file, bundled UI image, and external resource;
- the responsible adapter, source path, intended production path, byte size, MIME type, and status;
- source-level record/asset counts and issues.

## Blocking Rules

Publishing stops before writes when:

- an asset has no registered source adapter;
- a referenced local asset was not collected;
- a discovered source family is absent from the registry/manifest;
- a configured Game Experience cover is absent;
- a project image, cover, playable entry, cover, or build file is absent;
- rewritten content contains `/portfolio-assets/`, `blob:`, `file:`, Windows absolute paths, localhost/127.0.0.1, or dev content endpoints;
- generated metadata references a production file not included in output;
- the browser export registry version differs from the repository registry.

Unknown resource fields are errors. They are never silently skipped.

## Workflow

1. Generate a fresh browser export; each image is tagged with `sourceAdapterId`.
2. Run `pnpm portfolio:preflight -- <export.json>` or the import dry run.
3. Review `output/publishing-preflight-manifest.json` source by source.
4. Run `pnpm portfolio:import -- <export.json>`; it invokes the same preflight before computing changes.
5. The importer rewrites through registry output strategies and validates the rewritten result again.
6. Only after both checks pass may `--confirm` write production files.
7. Run typecheck/build and source-specific live verification, including actual image decoding and visibility.

If a specific project has an unrelated, already-known blocker (e.g. Playable Game hosting), pass `--exclude-project=<id>[,<id>...]` so the rest of the bundle can still publish. Excluded projects' current published state is preserved unchanged (read back from the existing `publishedPortfolio.json` and merged into the output, excluded from rewrite-revalidation) — never silently dropped, never a default.

## DILIDA DESK

The launcher must invoke this repository workflow and consume the generated manifest. It may display source-level counts and status, but must not reimplement discovery, rewriting, or missing-resource checks in Rust or UI code.

The production destination for large Playable Game bundles remains unresolved. The registry and manifest expose those files instead of omitting them; publishing must remain blocked until that import/hosting handler is deliberately completed.
