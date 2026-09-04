# Portfolio Collection PDF Export Architecture

## Invariant

`src/lib/pdf/pdfExportRegistry.json` is the machine-readable authority for every content family the Portfolio Collection PDF can contain: cover, table of contents, dynamic project pages, UI Personal Practice, UI Works, Game Experience, Contact, template images, project covers, Figma/external previews, and every template type. The preflight generator, the postflight generator, and this document all identify content by the registry's `id`s. A PDF feature must not add a second, parallel source-of-truth table for what the Collection PDF can contain.

The existing Playwright + pdf-lib pipeline (`scripts/portfolioCollectionExportPlugin.ts`, `src/lib/portfolioCollectionExport.ts`, `src/lib/collectionCoverGeometry.ts`, `scripts/collectionCoverRenderer.ts`) remains the implementation. This document and the registry describe and validate that pipeline; they do not replace any part of it.

Generated preflight/postflight output is local audit output (`output/pdf/collection/**`), not committed, exactly like the publishing pipeline's `output/publishing-preflight-manifest.json`.

## Renderers

The pipeline has three content render paths plus one shared page-furniture compositor. Every content family in the registry declares which one it uses.

| Renderer | Sizing | Width | Height | Used by |
| --- | --- | --- | --- | --- |
| `captureProjectPage` | variable-height | the exporting browser's own `window.innerWidth` at capture time (not a fixed constant) | content bound + 32px separation + measured page chrome (real footer content, no fixed constant) + 24px final margin; one continuous physical page | dynamic project pages, UI Personal Practice |
| `collectionPageChrome` | content-measured-height PDF layer | matches the project page it's appended to (the same real capture width) | measured from the chrome's own real rendered content (label + summary + back-link), appended below project content | every Collection project page |
| `renderSectionPdf` | fixed or content-driven | 1440px | 900px for Contact; measured content-driven height for UI Works and Game Experience | UI Works, Game Experience, Contact |
| `captureCoverPage` | renderer-scaled fixed composition | final target physical width, generated from a 1440px authored baseline | compact cover/index height multiplied by the same renderer scale | Cover and Table of Contents (two pages) |
| `unifyCollectionPageWidths` | final merge-stage canvas framing only | extends every page narrower than `max(actual width of every page in this export)` to that shared width; never touches a page already at the max | unchanged (only width changes) | every physical page in the final merged PDF (Cover, TOC, Project, UI Works, Game Experience, Contact) |

`unifyCollectionPageWidths` (`scripts/portfolioCollectionExportPlugin.ts`, called once at the end of `mergeCollection`, after every source page is already copied in at its own native size and after `addLinkAnnotations`/`addBackToIndexAnnotations` have added their annotations) is the sole place the Collection page geometry HARD INVARIANT (below) is enforced. It never scales content and never touches capture width/viewport; it only extends a narrower page's MediaBox and re-centers its already-rendered content stream via `page.translateContent`, exactly the pattern `applyCollectionPageChrome` already used to extend page height for the footer.

Cover and TOC are the intentional exception to the "never scale a captured page" rule because they are not captured project pages. Their renderer receives the already-known final target width and generates a native SVG/PNG composition at that width from the 1440px authored baseline. All visual geometry and TOC link rectangles use the same ratio. The resulting PDF pages already match the target width before merge; merge never calls `scaleContent()` on them or on projects.

## Collection page geometry HARD INVARIANT

Every physical page in the final merged Portfolio Collection PDF — Cover, TOC, every Project, UI Works, Game Experience, Contact — must share one identical MediaBox width, so continuous viewing has aligned left/right page edges. This supersedes the earlier documented behavior ("different physical widths are expected, not a defect") for the FINAL merged PDF only; project CAPTURE width is unchanged and still legitimately varies with the real exporting browser's `window.innerWidth` — `unifyCollectionPageWidths` reads that variation (`targetWidth = max(actual width of every page in this export)`) rather than eliminating it upstream.

A local change to footer/chrome, UI Works, Game Experience, project capture, postflight, or any template must never cause the merged PDF to end up with pages of different physical widths. Per CLAUDE.md's Repository Change Safety Rule, a change that would reach this layer is an architecture regression to report and stop on, not a local defect to patch downstream.

**Full-bleed regions**: an element that deliberately remains full-bleed in an Exact-Web snapshot would otherwise gain a visible inset once its page's canvas is widened and centered. Detection is structural, not project-ID-based. `phase-milestones` is intentionally normalized before this stage: its live `calc(100vw - 8px)` surface is preserved on the website, while the detached Exact-Web clone uses the template's already-rendered content rail as its outer background width. Its >6-node track still uses the generic horizontal-row fit; the removed component-owned zoom is not part of the current pipeline.
- `markFullBleedRegions` (`src/components/ProjectExactWebExportAction.tsx`, alongside the existing `markHorizontalExportRows`) tags, in the export snapshot clone, any element whose rendered rect reaches both viewport edges (within a small tolerance) and has a real painted `background-color`.
- `measureFullBleedRegions` (`scripts/exactWebExportPlugin.ts`) measures each tagged element's Y-range (in the same root-relative px space as `measuredContentBottom`) and its computed color at the same settled layout that produces the PDF bytes, and records both as `fullBleedRegions` in that project's report.
- `applyCollectionPageChrome` converts those px Y-ranges into the project page's own final PDF-point, bottom-origin space (the same transform it already applies to `backLinkRect`/annotations) and carries them through to that project's diagnostics.
- `unifyCollectionPageWidths` extends that exact flat color (alpha-composited against the page's own base background, `#181743`) into the new left/right canvas strips for that Y-range, instead of the plain page background — so the element keeps touching both new edges.

Only a solid `background-color` with no `background-image`, gradient, or `backdrop-filter` can be losslessly extended this way (`safe: true` in diagnostics). A region marked unsafe is left with the plain page background — never silently approximated — and recorded per-page as `fullBleedUnsafeSkipped`; postflight surfaces this as a `FULL_BLEED_REGION_NOT_LOSSLESSLY_EXTENDED` warning (not a blocking error) so a human decides.

## Known engine quirks (load-bearing, not incidental)

1. **`page.pdf()` always evaluates `@media print`, regardless of `page.emulateMedia({ media: 'screen' })`.** `emulateMedia` only affects on-screen `page.evaluate()`-based rendering/measurement; it has no effect on which stylesheet rules `page.pdf()` itself resolves against. Every `@media print` rule in `src/styles.css` is live for all three renderers above, independent of any attribute or query-param scoping a rule appears to use. `preferCSSPageSize: false` is set on every `page.pdf()` call site specifically to defeat this for the unscoped `@page` rule described next.
2. **`src/styles.css` contains an unscoped `@page { size: A4 portrait; margin: 8mm; }`** inside the same `@media print` block as the pipeline's scoped print rules. `@page` cannot be attribute-scoped by definition. It is currently inert only because every call site passes `preferCSSPageSize: false`. A new `page.pdf()` call site that omits this option will silently revert to A4/8mm instead of this pipeline's real geometry. This is a known, unresolved risk — see `TASKS.md`.
3. **A previously-reported "UI Personal Practice generates an unnecessary extra blank pagination segment" symptom was traced to `src/styles.css`'s `html[data-project-print="true"] [data-project-route-shell] figure, table, img { break-inside: avoid; page-break-inside: avoid; }` rule**, whose only setter is `src/components/ProjectPrintAction.tsx` (an unrelated, owner-only, DEV-only, manual single-project print button gated by `?printProject=1`). Because engine quirk #1 means print rules apply regardless of scoping attributes, this rule is a real candidate cause even though the collection plugin never sets `data-project-print` itself — but this has not yet been re-confirmed against a real generated PDF through the process below. **Do not re-patch this in isolation**; run it through Preflight/Postflight (below) so the fix is registered and verified, not applied as a one-off.

## Sources

See `src/lib/pdf/pdfExportRegistry.json` for the full machine-readable table (source of truth, renderer, sizing, horizontal safe area, padding, image handling, empty-content behavior, segmentation, verification rules — one row per content family). Summary:

| id | Family | Renderer | Sizing |
| --- | --- | --- | --- |
| `cover` | cover | `captureCoverPage` | 1440px baseline, renderer-scaled to final target width |
| `toc` | table of contents | `captureCoverPage` | 1440px baseline, renderer-scaled to final target width |
| `dynamic-project` | project page | `captureProjectPage` | variable height |
| `ui-personal-practice` | project page | `captureProjectPage` | variable height |
| `ui-works` | fixed section | `renderSectionPdf` | 1440 width, content-driven height (one page for every selected item) |
| `game-experience` | fixed section | `renderSectionPdf` | fixed 1440x900 |
| `contact` | fixed section | `renderSectionPdf` | fixed 1440x900 |
| `dynamic-template-images` | image asset | consumed by `captureProjectPage` | n/a |
| `ui-practice-images` | image asset | consumed by `captureProjectPage`/`renderSectionPdf` | n/a |
| `project-covers` | image asset | not currently consumed by the Collection PDF | n/a |
| `figma-embeds` | template external preview | consumed by `captureProjectPage` | n/a |
| `playable-game-embeds` | template external preview | consumed by `captureProjectPage` | n/a — open verification gap |

Every template file under `src/templates/*.tsx` (excluding dev-only `__TemplatePreview*.tsx` files, which are gitignored/excluded from production) is listed in the registry's `templates` array with a `pdfBehavior` note. Most are marked `standard`. Confirmed non-standard cases: `figma-prototype` (explicit `exportMode`: live uses the iframe/failure fallback; pdf/offline instantiate no iframe and immediately render the canonical fallback), `process-flow` (scoped fit-scale), and `phase-milestones` (export-clone surface normalization plus the generic horizontal-row fit for >6 nodes; no dedicated component zoom). `playable-game` and `figma-showcase` remain open verification gaps.

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
- trailing blank height for every variable-height project page, read directly from each project's own diagnostics;
- Collection page chrome geometry (`projectContentSeparation`, `collectionPageChromeHeight`, selected-order numbering, and Back-to-Index link rectangle);
- Figma artifact-mode proof (`iframeCount === 0` and every configured frame has a decoded visible fallback);
- horizontal overflow / clipped content, read from `overflowLeft`/`overflowRight`/`templateFitAudit`;
- blank pages (a page whose only content is the background fill);
- TOC safe margins (see rule below);
- fixed-page dimensions (cover/section pages must be exactly 1440x900pt-equivalent);
- project order (must match the preflight's declared order);
- missing images (cross-checked against the preflight manifest, not re-derived);
- continuous-page integrity (`exactWebMode === "continuous"` and one physical source page per project);
- Collection page geometry: every physical page's real MediaBox width (read directly from the merged PDF, not from diagnostics bookkeeping alone) must be identical (`COLLECTION_PAGE_WIDTH_NOT_UNIFORM` if not); `mergeCollection`'s own `pageWidthUnification` record is cross-checked against that ground truth (`COLLECTION_PAGE_WIDTH_BOOKKEEPING_MISMATCH` on drift), and any full-bleed region that could not be losslessly extended is surfaced as a `FULL_BLEED_REGION_NOT_LOSSLESSLY_EXTENDED` warning.

### Project blank-tail rule

For every variable-height project page, the final geometry is `measured project content bottom + 32px separation + measured Collection page chrome (real footer content height, no fixed constant) + 24px final margin`. The diagnostics expose each term independently, and postflight arithmetically verifies `finalPageHeight` equals their sum — proving the reported chrome height is genuinely what was composited, not just a number reported alongside a differently-sized result. Postflight fails unless the final blank tail is exactly the 24px final margin, the separation is 32px, the chrome's own overflow check is 0 (no truncated footer text), the page is one continuous exact-web source page, and a Back-to-Index annotation rectangle exists.

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

## Collection page chrome and Figma artifact mode

The exact-web snapshot contains project content only. After that content is printed, `captureProjectPage` appends one separately rendered vector PDF layer containing the full-width divider, `PROJECT END`, canonical localized summary, selected-order indicator, and `Back to Index`. This layer uses page-level safe margins and never inherits a project's nested max-width. The final merge writes a PDF `GoTo` annotation over its bottom-right return link; directory links and return links use the same merged page map.

Figma has one explicit mode switch: `live | pdf | offline`. Live mode renders a valid iframe and changes to the existing fallback only on genuine iframe failure. PDF and offline modes never create an iframe, never start its timeout, and immediately render the canonical fallback in the same media frame. Collection diagnostics block export when a PDF-mode iframe exists or a configured fallback is not decoded and visibly sized. Final visual inspection is still required.

Every project follows the same route: selected project -> current canonical DOM -> shared exact-web content capture -> shared visible-content bound -> shared page chrome -> shared link generation. No project ID, historical PDF, alternate DOM, crop, scale, or cached-height branch is part of the active path.
