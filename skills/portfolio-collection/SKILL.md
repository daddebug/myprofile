# Portfolio Collection

Applies to the multi-project "Portfolio Collection" PDF export pipeline (`/:locale/export` editor → Playwright/pdf-lib capture → merged collection PDF).

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

- Cover, UI Works, Games, and Contact pages use one consistent collection-page system (1440x900 landscape).
- Project pages preserve readable content width and may use variable height — never force every project to the same height.
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
