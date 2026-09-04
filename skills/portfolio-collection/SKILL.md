# Portfolio Collection

Applies to the multi-project "Portfolio Collection" PDF export pipeline (`/:locale/export` editor → Playwright/pdf-lib capture → merged collection PDF).

**Read `docs/PDF_EXPORT_ARCHITECTURE.md` before touching this pipeline.** It is the authoritative registry of every content family (cover, TOC, project pages, UI Personal Practice, UI Works, Game Experience, Contact, template images, Figma/external previews, every template type), backed by `src/lib/pdf/pdfExportRegistry.json`, `scripts/pdf-export-preflight-lib.mjs`, and `scripts/pdf-export-postflight-lib.mjs`.

## Workflow

- `PORTFOLIO COLLECTION` opens the `/export` selection editor.
- The editor controls selected projects, order, UI Works, games, and section inclusion.
- The Playwright/pdf-lib pipeline performs the actual collection export.
- Never bypass the editor and automatically export all projects.
- Do not restore the obsolete A4 rendering workflow.

## Data safety

- Dynamic browser drafts must be staged non-destructively before the headless capture browser navigates to them (it has no access to the owner's real localStorage/IndexedDB).
- Staging must include metadata, the correct content model, referenced assets, and a MIME manifest.
- Support `imageId`, `localImageId`, `publicPath`, and template-specific image fields — a project's real images may live in any of these depending on its content system.
- Never substitute an empty default draft when a real browser draft should exist.
- Referenced images that fail to resolve must abort the export loudly, not ship silently broken.
- Genuinely empty slots (no image was ever assigned) may collapse only in collection-export mode — never in the normal owner/public page.
- Normal owner/public pages must remain visually and functionally unchanged by anything built for this pipeline.

## Visual rules

- Every project uses one canonical height rule: measure the bottom-most visible project-content bound in the settled real DOM, add 32px separation, append the Collection page chrome measured from its own real rendered content (never a fixed constant — a wrapping summary grows the chrome instead of being clipped), then keep a 24px final page margin. Print one continuous page at the capturing browser's own current CSS viewport width (`window.innerWidth`) — never a hardcoded page-width constant — so the captured layout matches whatever responsive state that browser was actually showing, and no module is cut by a fixed-height PDF boundary. Never use wrapper `scrollHeight`, cached/historical PDF height, per-project crops, project-ID branches, or automatic `project-overrides` substitution.

- **Collection page geometry HARD INVARIANT** (supersedes the older "different physical widths are expected" rule): in the FINAL merged Portfolio Collection PDF, every physical page — Cover, TOC, every Project, UI Works, Game Experience, Contact — must share one identical MediaBox width, so continuous viewing has aligned left/right page edges. Project CAPTURE width is unchanged and still varies with the real exporting browser's `window.innerWidth` (see above) — that is not what this invariant governs. Uniform final width is achieved once, in `mergeCollection` (`scripts/portfolioCollectionExportPlugin.ts`'s `unifyCollectionPageWidths`), strictly by canvas/MediaBox extension + horizontal centering (`page.setSize` + `page.translateContent`) on whichever pages are narrower than `targetWidth = max(actual width of every page in this export)` — never by scaling content, never by re-fixing project capture to a constant like 1440. Any local change to footer/chrome, UI Works, Game Experience, project capture, or a template must not cause the merged PDF to end up with different physical page widths — that is an architecture regression per this invariant, not a local defect, and must stop for a report rather than be patched locally (see CLAUDE.md's Repository Change Safety Rule).
  - Project pages and fixed composition pages deliberately use different width behavior. Project pages are never scaled: they retain their captured responsive geometry and may only receive MediaBox expansion plus centering. Cover and TOC use a 1440px authored baseline but are rendered natively at the export's final target physical width; every coordinate, graphic, image, font, gap, footer and TOC navigation rectangle shares one renderer scale. Never restore global `page.scaleContent()` to obtain this result, and never leave a 1440px Cover/TOC composition centered inside a wider final canvas.
  - **Full-bleed regions** that intentionally remain viewport-wide in an Exact-Web snapshot are detected structurally, not by project ID — `markFullBleedRegions` (`src/components/ProjectExactWebExportAction.tsx`) tags any element whose rendered rect reaches both viewport edges with a real painted background color, and `measureFullBleedRegions` (`scripts/exactWebExportPlugin.ts`) records each one's Y-range and computed color into the project's own diagnostics. `phase-milestones` is the explicit template-level exception: the live website keeps its `calc(100vw - 8px)` breakout, but the detached Exact-Web clone normalizes that decorative surface to the template's already-rendered content rail before full-bleed detection. Its >6-node track still uses the generic horizontal-row fit. Never implement this as a project-ID branch or alter the live DOM. For regions that remain full-bleed, `unifyCollectionPageWidths` may extend only an exact flat color into newly added canvas strips; unsafe image/gradient/backdrop surfaces remain warnings rather than approximations.

- Cover and TOC use a 1440px authored baseline scaled inside their renderer to the final target physical width; Contact remains fixed-width. UI Works and Game Experience use the fixed section width with a measured content-driven height (one physical page per section, sized to whatever content is actually selected — never fixed-count pagination).
- Project pages preserve readable content width and use content-driven continuous height; never force project modules through fixed-height page slicing.
- Do not flatten complete project pages into JPEG/PNG screenshots.
- Body text must remain selectable and searchable (vector PDF output, not rasterized).
- Only actual image assets should be raster-compressed — never the whole page.
- Project sections should not clip horizontally.
- Fit-scale only explicitly supported wide visual containers (an allowlist) — do not generically shrink every template instance because one nested element overflows.
- Export-only top-level module spacing should remain compact; do not carry double-mode or card-oriented spacing into a single/direct-view layout.
- Background glow must be procedural, subtle, and behind content — never a separate visible dark external board/frame.
- Normal website spacing/background must not be changed to achieve any of the above.

## Verification

- Use the real selected projects where available, not synthetic placeholders.
- Check actual PDF page boxes (dimensions), not just that a PDF was produced.
- Check text extraction to confirm body text is real vector text, not raster.
- Check missing-image diagnostics.
- Check segment seams and blank tails between merged pages.
- Check selected order and the table of contents.
- Check the final PDF visually, page by page.
- Target under 10 MB through asset optimization (mozjpeg/WebP re-encoding of staged images), not full-page blur or heavy downscaling.
- Do not call the result complete based only on a diagnostics JSON file — open and inspect the actual PDF.

## Long-term rule: fix oversized/incorrectly-encoded images at the staging step, not by rewriting the final PDF

"Target under 10 MB through asset optimization" (above) means re-encoding/right-sizing images at the **staging** step — before the headless Chromium capture browser ever navigates to a project page and calls `page.pdf()` — not by post-processing the already-generated PDF's image XObjects afterward. Chromium's print pipeline always embeds whatever pixel resolution the `<img>`'s source has, regardless of its on-page CSS display size, and always flattens raster content to raw FlateDecode samples (never preserves source JPEG encoding) — so if the staged image is already right-sized and pre-encoded well, the resulting PDF is efficient automatically, for every project, forever, with no per-image special-casing. Reaching into the finished PDF to rewrite image dictionaries, ICC profiles, SMask streams, PNG predictors, and color spaces after the fact **in order to correct a sizing or rendering mistake** is a fragile second image pipeline that needs bespoke handling of every encoding/color-space/mask case a downstream image might have — see the "Fix upstream root causes, not downstream symptoms" rule in `CLAUDE.md`. `scripts/exportImageResize.ts` (in-page, before `page.pdf()`) is the sizing fix; it must stay the only place image dimensions are decided.

**Allowed scope of the final PDF-level pass** (`scripts/pdfStreamEncodingOptimizer.ts`, called from `mergeCollection` in `scripts/portfolioCollectionExportPlugin.ts`, right after the canonical merge produces literal bytes and before they're written to disk): this stage exists ONLY to work around a Chromium *encoding* limitation on images that are already correctly sized — it is not a place to repair upstream rendering, layout, or sizing problems. It may:
- losslessly re-filter an already-correctly-sized raw `/FlateDecode` image stream with a real PNG-style adaptive predictor (`/DecodeParms /Predictor 15`) — verified byte-for-byte identical to the original before use;
- re-encode a non-alpha image stream as DCTDecode/JPEG at a fixed, uniform quality **only** when that candidate is genuinely smaller than the lossless one — this rule (alpha images and their SMask companions always stay lossless; everything else is JPEG-eligible) was reverse-engineered from a real Smallpdf-compressed reference export of this same portfolio, not invented, and is a single structural fact (does this exact image object declare its own `/SMask`) rather than a guess about photo vs. UI/diagram content;
- deduplicate byte-identical image objects by repointing references and deleting the dead copy;
- save with `useObjectStreams` enabled.
It must never: resize anything, rasterize a page, reconstruct project content, alter text/links/page dimensions, or change what does/doesn't have an alpha channel. If a future bug is found in image sizing or rendering, fix it upstream (staging or `exportImageResize.ts`) — do not extend this pass's JPEG/predictor logic to compensate for it.

## Long-term rule: register every discovered PDF bug, don't patch in isolation

Whenever a new PDF bug reveals a missing content type, template behavior, sizing rule, asset source, or validation rule:

1. Fix the immediate cause.
2. Register the discovered case as a row (or an update to an existing row) in `src/lib/pdf/pdfExportRegistry.json`.
3. Add its preflight and/or postflight validation in `scripts/pdf-export-preflight-lib.mjs` / `scripts/pdf-export-postflight-lib.mjs`.
4. Update this skill file.
5. Update `TASKS.md` / `PROJECT_STATUS.md`.
6. Record the fix in `CHANGELOG.md` only after it is verified against a real generated PDF opened in a real viewer — a passing postflight report alone is not verification.

Do not repeatedly solve PDF failures as isolated one-off exceptions. See `docs/PDF_EXPORT_ARCHITECTURE.md` for the full registry, preflight/postflight rules, and the confirmed engine quirk that `page.pdf()` always evaluates `@media print` regardless of `emulateMedia`.

## Shared Collection page chrome and Figma export mode

- Exact-Web owns project content only. `PROJECT END`, the canonical localized summary, selected-order indicator, and `Back to Index` belong to one separately rendered vector Collection page-chrome layer with page-level margins.
- The bottom-right `Back to Index` label has a real PDF `GoTo` annotation targeting the Collection index page. Directory-to-project links remain unchanged.
- Every selected project follows the same canonical DOM -> exact-web content capture -> visible-content bound -> shared page chrome -> shared link generation path. Historical PDFs, alternate DOM, project-ID branches, and tail-image repainting are not valid inputs.
- Figma uses one explicit `exportMode`: `live` may instantiate its iframe and falls back only on genuine failure; `pdf` and `offline` never instantiate or wait for an iframe and immediately render the canonical fallback image.
- Artifact capture must record zero Figma iframes and a decoded, visibly sized fallback for every configured fallback frame. Acceptance is three newly generated final Collection PDFs opened and visually inspected, not source inspection, HTTP success, or an Exact-Web fragment alone.
