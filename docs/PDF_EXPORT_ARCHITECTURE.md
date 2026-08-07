# Portfolio Collection PDF Export Architecture

## Invariant

`src/lib/pdf/pdfExportRegistry.json` is the machine-readable authority for every content family the Portfolio Collection PDF can contain: cover, table of contents, dynamic project pages, UI Personal Practice, UI Works, Game Experience, Contact, template images, project covers, Figma/external previews, and every template type. The preflight generator, the postflight generator, and this document all identify content by the registry's `id`s. A PDF feature must not add a second, parallel source-of-truth table for what the Collection PDF can contain.

The existing Playwright + pdf-lib pipeline (`scripts/portfolioCollectionExportPlugin.ts`, `src/lib/portfolioCollectionExport.ts`, `src/lib/collectionCoverGeometry.ts`, `scripts/collectionCoverRenderer.ts`) remains the implementation. This document and the registry describe and validate that pipeline; they do not replace any part of it.

Generated preflight/postflight output is local audit output (`output/pdf/collection/**`), not committed, exactly like the publishing pipeline's `output/publishing-preflight-manifest.json`.

## Renderers

The pipeline has exactly three render paths. Every content family in the registry declares which one it uses.

| Renderer | Sizing | Width | Height | Used by |
| --- | --- | --- | --- | --- |
| `captureProjectPage` | variable-height | 1440px | computed per project, auto-paginated by Chromium into segments (`segmentHeightPx = ceil(captureHeight / segmentCount)`, `segmentCount = max(1, ceil(captureHeight / 3000))`) then merged into one continuous PDF page via `pdf-lib`'s `embedPage`/`drawPage` | dynamic project pages, UI Personal Practice |
| `renderSectionPdf` | fixed | 1440px | 900px | UI Works, Game Experience, Contact |
| `captureCoverPage` | fixed | 1440px | 900px | Cover, Table of Contents (rendered together, one page) |

## Known engine quirks (load-bearing, not incidental)

1. **`page.pdf()` always evaluates `@media print`, regardless of `page.emulateMedia({ media: 'screen' })`.** `emulateMedia` only affects on-screen `page.evaluate()`-based rendering/measurement; it has no effect on which stylesheet rules `page.pdf()` itself resolves against. Every `@media print` rule in `src/styles.css` is live for all three renderers above, independent of any attribute or query-param scoping a rule appears to use. `preferCSSPageSize: false` is set on every `page.pdf()` call site specifically to defeat this for the unscoped `@page` rule described next.
2. **`src/styles.css` contains an unscoped `@page { size: A4 portrait; margin: 8mm; }`** inside the same `@media print` block as the pipeline's scoped print rules. `@page` cannot be attribute-scoped by definition. It is currently inert only because every call site passes `preferCSSPageSize: false`. A new `page.pdf()` call site that omits this option will silently revert to A4/8mm instead of this pipeline's real geometry. This is a known, unresolved risk — see `TASKS.md`.
3. **A previously-reported "UI Personal Practice generates an unnecessary extra blank pagination segment" symptom was traced to `src/styles.css`'s `html[data-project-print="true"] [data-project-route-shell] figure, table, img { break-inside: avoid; page-break-inside: avoid; }` rule**, whose only setter is `src/components/ProjectPrintAction.tsx` (an unrelated, owner-only, DEV-only, manual single-project print button gated by `?printProject=1`). Because engine quirk #1 means print rules apply regardless of scoping attributes, this rule is a real candidate cause even though the collection plugin never sets `data-project-print` itself — but this has not yet been re-confirmed against a real generated PDF through the process below. **Do not re-patch this in isolation**; run it through Preflight/Postflight (below) so the fix is registered and verified, not applied as a one-off.

## Sources

See `src/lib/pdf/pdfExportRegistry.json` for the full machine-readable table (source of truth, renderer, sizing, horizontal safe area, padding, image handling, empty-content behavior, segmentation, verification rules — one row per content family). Summary:

| id | Family | Renderer | Sizing |
| --- | --- | --- | --- |
| `cover` | cover | `captureCoverPage` | fixed 1440x900 |
| `toc` | table of contents | `captureCoverPage` | fixed 1440x900 (same page as cover) |
| `dynamic-project` | project page | `captureProjectPage` | variable height |
| `ui-personal-practice` | project page | `captureProjectPage` | variable height |
| `ui-works` | fixed section | `renderSectionPdf` | fixed 1440x900 |
| `game-experience` | fixed section | `renderSectionPdf` | fixed 1440x900 |
| `contact` | fixed section | `renderSectionPdf` | fixed 1440x900 |
| `dynamic-template-images` | image asset | consumed by `captureProjectPage` | n/a |
| `ui-practice-images` | image asset | consumed by `captureProjectPage`/`renderSectionPdf` | n/a |
| `project-covers` | image asset | not currently consumed by the Collection PDF | n/a |
| `figma-embeds` | template external preview | consumed by `captureProjectPage` | n/a |
| `playable-game-embeds` | template external preview | consumed by `captureProjectPage` | n/a — open verification gap |

Every template file under `src/templates/*.tsx` (excluding dev-only `__TemplatePreview*.tsx` files, which are gitignored/excluded from production) is listed in the registry's `templates` array with a `pdfBehavior` note. Most are marked `standard` (renders as captured, no confirmed special print/PDF branch found in this codebase). Confirmed non-standard cases: `figma-prototype` (deliberate print-media poster+link swap via `[data-figma-prototype-interactive]`/`[data-figma-prototype-print]`), `process-flow` (scoped fit-scale to avoid horizontal clipping in capture mode), `phase-milestones` (dedicated export fit rule). `playable-game` and `figma-showcase` are marked as open verification gaps — their PDF-capture behavior has not been read/confirmed in this codebase and must not be assumed to match `figma-prototype`'s pattern until it is.

## Preflight

Implemented in `scripts/pdf-export-preflight-lib.mjs`, exporting `buildPdfExportPreflight(selection)`. Given the same selection shape the client stages (`projects[]`, `includeUiWorks`, `includeGameExperience`, `includeContact`, locale), it produces a manifest containing:

- selected project IDs and order;
- included fixed sections (`ui-works` / `game-experience` / `contact`) resolved from the selection flags;
- every template instance per project, read from each project's real draft/document (the same data the capture browser will read), each resolved against the registry's `templates` array;
- every referenced image (template-instance images, UI Works items, Game Experience covers, UI Practice images), each resolved against the registry's `dynamic-template-images`/`ui-practice-images` rows;
- expected image source, page/segment type, width, and variable/fixed height behavior — read directly from the matched registry row;
- missing or unsupported content and unsupported template types, collected as blocking issues rather than silently dropped.

Generation must stop (`ok: false`) when any of:

- a selected project cannot resolve its real draft (mirrors `validateDynamicDraft`/`validateStagedProject` in the existing plugin — the preflight does not reimplement staging, it re-checks the same precondition before a job is created);
- a referenced image is missing;
- an unsupported template instance is present (a template `id` with no matching row in the registry's `templates` array);
- a local-only/`blob:`/dev path remains unresolved in a page/section that is about to be captured;
- a page type has no registered row in `pdfExportRegistry.json`'s `sources` array.

## Postflight

Implemented in `scripts/pdf-export-postflight-lib.mjs`, exporting `buildPdfExportPostflight(pdfPath, diagnosticsDir)`. Given a real generated PDF file and the sibling `*-diagnostics.json` files `captureProjectPage` already writes to `output/pdf/collection/`, it reports:

- total file size;
- physical page count (via `pdf-lib`'s `PDFDocument.load`);
- every page's width/height;
- selectable text presence (best-effort: a page with zero extractable text objects is flagged, not hard-failed, since some pages are legitimately vector/graphic-only);
- raster image count and the largest embedded images (via `pdf-lib`'s object inspection — same technique used for `vectorPdfBytes` sizing in the existing per-project diagnostics);
- duplicate embedded assets where detectable (same-length identical-byte raster streams);
- trailing blank height for every variable-height project page, read directly from each project's own `trailingBlankHeight`/`intendedBottomPadding` diagnostics rather than recomputed;
- horizontal overflow / clipped content, read from `overflowLeft`/`overflowRight`/`templateFitAudit`;
- blank pages (a page whose only content is the background fill);
- TOC safe margins (see rule below);
- fixed-page dimensions (cover/section pages must be exactly 1440x900pt-equivalent);
- project order (must match the preflight's declared order);
- missing images (cross-checked against the preflight manifest, not re-derived);
- segment seams (any project where `segmentSourcePages.length !== segmentCount`).

### Project blank-tail rule

For every variable-height project page: `trailingBlankHeight = finalPageHeight - measuredContentBottom`. This is already computed per-project by `captureProjectPage` and written to `-diagnostics.json`; postflight aggregates it rather than remeasuring. **Fail** when `trailingBlankHeight > intendedBottomPadding + 32` (the same threshold `captureProjectPage` already hard-fails capture on — postflight re-asserts it at the finished-PDF level so a regression anywhere in the merge/embed step is still caught even if the per-project capture step passed).

### TOC safe-area rule

The TOC must use the same registered horizontal safe area (`sharedGeometry.horizontalSafeArea`, 80–1360px on a 1440px page) on both sides. No title, index number, rule line, or connector may enter the region outside that range. Postflight measures each rendered TOC label's left/right glyph extent directly from the generated page content, not from the `tocSlotPositions()` constant alone — the registry's `toc` row already flags a specific, not-yet-verified arithmetic risk (slot 7's fixed-grid label extent computes to ~198px past the safe-right edge) that this rule exists specifically to catch.

### Performance rule

File size alone is not the performance metric. Postflight reports: oversized source image dimensions (any embedded raster wider/taller than its rendered display size), encoded image bytes per asset, repeated raster assets (see duplicate-detection above), unnecessary transparency (alpha-channel rasters with no visible transparency), and repeated full-page raster backgrounds. Selectable/vector text must be preserved — only image assets are candidates for optimization, and pages must never be flattened to full-page screenshots (the existing `captureProjectPage` vector `page.pdf()` + `embedPage` approach already guarantees this; postflight's job is to detect a regression back toward raster-page capture, not to perform the optimization itself).

### Image rule

Images should be downscaled to the maximum resolution actually required by the PDF layout — the pattern already used by `ui-works`/`game-experience` (`downscaleToJpegDataUrl` to the card's actual display size before staging). Do not repeatedly embed identical source assets when avoidable; postflight's duplicate-asset detection exists to catch this. Do not flatten full pages into screenshots.

## Real verification

Preflight and postflight are necessary but not sufficient for a release-quality PDF. Before marking any PDF export task verified:

1. Open the actual generated PDF in a normal PDF viewer (not just `pdf-lib` inspection).
2. Capture: the full TOC page; the ending (bottom edge) of at least two variable-height project pages; one image-heavy project page.
3. Confirm directly in the viewer: scrolling is acceptably smooth; no large unexplained project blank tails; TOC has balanced margins; images are readable; text remains selectable.

A postflight report that passes every automated threshold is not itself sufficient evidence of "verified" — per `CLAUDE.md`, only real output (a real generated PDF, actually opened) counts as verification for `CHANGELOG.md` purposes.

## DILIDA DESK integration

The future DILIDA DESK `COLLECTION PDF` launcher action must call this repository's canonical workflow (staging → `captureProjectPage`/`renderSectionPdf`/`captureCoverPage` → `mergeCollection`, gated by this document's preflight) and display its preflight/postflight results. It must not maintain its own project discovery, image collection, page-size logic, compression logic, or PDF validation rules — exactly the same constraint already documented for DILIDA DESK's publishing integration in `docs/PUBLISHING_ARCHITECTURE.md`. DILIDA DESK integration itself is out of scope for this document's changes and has not been modified.

## Long-term rule

Whenever a new PDF bug reveals a missing content type, template behavior, sizing rule, asset source, or validation rule:

1. Fix the immediate cause.
2. Register the discovered case as a row (or an update to an existing row) in `src/lib/pdf/pdfExportRegistry.json`.
3. Add its preflight and/or postflight validation in `scripts/pdf-export-preflight-lib.mjs` / `scripts/pdf-export-postflight-lib.mjs`.
4. Update `skills/portfolio-collection/SKILL.md`.
5. Update `TASKS.md` / `PROJECT_STATUS.md`.
6. Record the fix in `CHANGELOG.md` only after it is verified against a real generated PDF opened in a real viewer (see Real verification above) — not from a postflight pass alone.

Do not repeatedly solve PDF failures as isolated one-off exceptions outside this registry.
