# PSD → Web Template Visual Workflow

> **DEPRECATED / LEGACY.** Superseded by `docs/design/FIGMA_TEMPLATE_WORKFLOW.md` — the user now does all portfolio visual design in Figma, not PSD. This file is kept for historical reference (inspecting an old PSD file) only; it is **not** the entry point for new visual work. See `skills/figma-template-sync/SKILL.md`.

**Any portfolio visual/template task must read this file before implementation** — see `CLAUDE.md`'s Task skills section for how this is wired into every session, not just this conversation. Also read `PSD_LAYER_NAMING.md` (how PSD layers are identified) and `PSD_TEMPLATE_SPEC.md` (what the machine-readable spec's fields mean) before touching a template that has a PSD source.

## Roles

```
PSD = the single authoritative visual source
Web = a faithful implementation layer
AI  = a read / map / sync tool
```

The PSD defines every visual relationship a template renders: internal proportions, element position, font size, font weight, line height, letter spacing, color, gradients, line/circle/decoration dimensions, a template's own top/bottom padding, the vertical gap between templates, manual line breaks, and alignment. The web can scale that relationship responsively — see "Proportional implementation" below — but nothing here authorizes redesigning it. When a web best-practice instinct (e.g. "this padding would read better a bit larger") conflicts with what the PSD actually shows, **the PSD wins**. The goal is not a generically well-designed website; it is that what the user drew in the PSD is what renders on the web.

## What the AI must never invent

By default, do not:
- Change a font-size ratio
- Change an element's width/height ratio
- Change the gap inside a template, or the gap between templates
- Widen a section's top/bottom padding
- Change a color or a color relationship
- Change a gradient
- Change a left/right alignment position, or a decoration's position
- Re-wrap a manually-authored line break
- Reorganize a layout, or turn a left-aligned composition into a centered one, "for better responsiveness"
- Extrapolate a confirmed N-item design into an unconfirmed N+1/N+2 variant

Proportional imbalance is never acceptable. If the PSD does not define a state or a count variant, **report the gap and ask** — do not guess. `psd-template-spec.json`'s `variants` block is where an unconfirmed count gets recorded until the user confirms it (see `SECTION_02_PHASE_MILESTONES.variants` for a worked example: 3 items confirmed, 4-5 explicitly marked unconfirmed with the reasoning).

## Frames: the 1920x1080 design unit

The PSD document's own height is variable — it keeps growing as more content is added below. But each major portfolio section is designed, as much as possible, to fit inside one independent **1920 × 1080 Frame** — one visual page. `FRAME_01_COVER` (Hero + Phase Milestones together) is the first example.

```
baseWidth       = 1920   (design-frame width)
baseFrameHeight = 1080   (design-frame height, per Frame)
psdDocumentHeight = variable (grows as Frames are added)
```

Do not conflate the PSD document's own (variable) height with a Frame's height — `psd-template-spec.json`'s `document.baseFrameHeight` is the per-Frame constant; `document.measuredHeight` is just how tall the current file happens to be.

Each Frame is recorded as:

```jsonc
{
  "frameId": "FRAME_01_COVER",
  "bounds": { "x": ..., "y": ..., "width": 1920, "height": 1080 },
  "sections": { "SECTION_01_HERO": {...}, "SECTION_02_PHASE_MILESTONES": {...} }
}
```

If a given template doesn't fill a full 1080px Frame, its actual PSD-marked range is what's used — never force it to exactly 1080 just to match the target unit.

Why this matters: it keeps the web's own scroll rhythm consistent, gives a future PDF/Portfolio-print pipeline a natural one-Frame-per-page boundary, and gives the AI a way to understand which templates belong together on one visual page instead of treating every template as an isolated component.

### Cover Bundle

Hero (`SECTION_01_HERO`) + Phase Milestones (`SECTION_02_PHASE_MILESTONES`) together are the default **Cover Bundle** for a new project — one title/summary/metadata block plus one table-of-contents-style node row, forming a complete cover page. A new project's creation flow is expected to eventually offer project title / summary / metadata fields plus an *optional* Phase Milestones content block in the same form, so a new project starts with a complete cover instead of the milestones template being added by hand afterward. **This is architecture only for now — the project-creation form itself is not being changed until that work is explicitly requested.**

## Section / Frame boundaries: guide layers first, inferred bounds only as a fallback

The user annotates ranges directly in the PSD's base/guide layers using this convention (see `PSD_LAYER_NAMING.md`):

```
GUIDE_FRAME
GUIDE_SECTION
GUIDE_ALIGN
GUIDE_RANGE
```

**Guide layers are read first, before any bounding-box inference.** Never derive a Frame or Section boundary purely from "where the visible content happens to end" when a `GUIDE_*` layer for that boundary exists — that guesses at authorial intent the user has already stated explicitly. When no guide layer exists yet for a given boundary (true of every boundary in the current PSD, as of this file's last update — see `psd-template-spec.json.guideLayers`), an inferred bounding-box value may be recorded, but it must be explicitly marked `"status": "inferred, not GUIDE_FRAME-confirmed"` (or the Section equivalent) so nobody later treats it as more certain than it is.

## Alignment is a hard constraint, not a per-template style choice

Every template's left edge, right edge, content start, title start, image start, text baseline, and vertical start-of-template must follow the PSD's real coordinate relationships. It is not acceptable for template A to use a 72px left margin, template B 96px, and template C 64px, each because that template's own CSS was written independently. When multiple PSD templates share the same alignment anchor, the web must share that same anchor too — never a separately-tuned approximation per template.

`psd-template-spec.json.alignmentAnchors` records these shared anchors (currently: `contentLeft`, confirmed at ~92px/0.0479 of canvas width from both Hero and Phase Milestones; `contentRight`, not yet confirmed — see the spec file for why). A template-local CSS token (see below) that expresses a left margin should reference the shared anchor's ratio, not invent its own.

## Proportional implementation

PSD baseline width for the current file: **1920** (`psd-template-spec.json.document.baseWidth`).

```
scale = viewportContentWidth / 1920
WebSize ≈ PsdSize × scale
```

This applies uniformly to position, size, font-size, gaps, padding, line thickness, and decoration size — never scale one of these independently of the others (no "the title got its own responsive treatment while the body text didn't"), unless the PSD itself defines a distinct responsive variant for that breakpoint.

Prefer `%`, `vw`, `clamp()`, CSS Grid, and CSS custom properties over hardcoding a PSD px value as a fixed web px — these are implementation techniques for holding the PSD's ratio, not opportunities to adjust it. A ratio survives a viewport resize; a hardcoded px does not.

## Spacing is visual data, not a feel-good default

`padding: 120px 0;` because it "looks comfortable" is not acceptable once a template has a PSD source. Every spacing value — a template's own top/bottom padding, the gap between two templates (`previousSectionBottom` to `currentSectionTop`), number-to-baseline, baseline-to-title, title-to-description — must come from measuring the PSD, converted to a ratio, and recorded in `psd-template-spec.json`.

## Fonts: Microsoft YaHei, unconditionally

The web's default visual font is fixed, regardless of what any individual PSD text layer currently shows:

```css
font-family: "Microsoft YaHei", "Microsoft YaHei UI", sans-serif;
```

This applies even if a PSD layer is set to some other font — the web still renders Microsoft YaHei. (In the current PSD, the real text layers already use Microsoft YaHei, so this hasn't yet come up as an actual conflict — but the policy is unconditional, not "match whatever the PSD says.") When helping tidy the PSD, the AI may suggest or apply switching a layer to Microsoft YaHei for consistency. Never download, copy, bundle, or commit a font file — always the system font.

## Manual line breaks

A title's line break is a design decision, not something the browser's own wrapping should decide. Reuse the existing data shape wherever it can already express this (a literal `\n` inside the existing localized string, matching the PSD's own technique — see `TITLE_MAIN.line2IndentTechnique` in the spec, which uses leading space characters inside the text run itself, not a CSS offset). An explicit `titleLines: string[]` array is acceptable if the current structure truly cannot express it, but do not migrate data broadly just for this.

## Hidden layers are official design information — "hidden != unused"

A hidden PSD layer/group must be read with the same weight as a visible one. It can represent a 3/4/5-item count variant, an active/inactive state, an alternate composition, or content staged for future use. Only a layer explicitly marked `UNUSED`, `DELETE`, `ARCHIVE`, or `BACKUP` is excluded from the formal spec.

### Canonical master + hidden variants (count-variant templates)

For a template whose item count varies (phase-milestones, concept-diagnosis-cards, etc.), the user's authoring pattern is: draw the **full canonical count** (e.g. 5 items), then hide the ones a given project doesn't currently use. A visible-3/hidden-2 PSD state therefore means:

```
canonicalVariant = 5
current visible variant = 3
```

— **not** "the PSD only designed 3 items." Record both:

```jsonc
{
  "canonicalVariant": 5,
  "variants": {
    "3": { "confirmedByPsd": true, ... },
    "4": { "confirmedByPsd": false, "note": "..." },
    "5": { "confirmedByPsd": false, "note": "..." }
  }
}
```

Important nuance already on file for `SECTION_02_PHASE_MILESTONES`: "hidden" does not automatically mean "trust it as finished," either. The hidden 4th/5th columns in the current PSD carry a visibly different, more muted green and an inconsistent placeholder font/size compared to the three real, visible columns — read as an in-progress state of the canonical master, not a completed 4/5-item design, and not yet promoted into the shipped web layout on that basis. Never invent a web layout for an item count purely because a hidden group exists at that count; the hidden group must actually look finished (consistent color, real content, consistent font) before it's trusted as the canonical source for that count.

## `GLOBAL` / `ITEM` / `DECOR` / `GUIDE` — every element has a role

See `PSD_LAYER_NAMING.md` for the full definitions. The one rule worth restating here: a `GLOBAL` element (e.g. `GLOBAL_LINE_BASE`, a baseline that runs the full row) must always span its full section width in the web implementation, regardless of how many `ITEM`s are currently visible — never truncate it to "reach the last visible item." This must be recognized from the PSD's own geometry (a line/shape layer whose bounds span the whole section, independent of how many item columns exist), not something the user has to point out by hand each time.

## Template-local CSS tokens

Template-specific visual parameters live in that template's own CSS file as custom properties, not scattered into the shared global stylesheet:

```css
.phase-milestones {
  --pm-number-size: ...;
  --pm-title-size: ...;
  --pm-description-size: ...;
  --pm-line-height: ...;
  --pm-section-padding-top: ...;
  --pm-section-padding-bottom: ...;
  --pm-item-gap: ...;
}
```

Each token's value traces back to a specific `psd-template-spec.json` measurement — not a number picked because it looked right on screen. A token expressing a shared alignment (a left margin, for instance) should reference `alignmentAnchors`, not a value re-derived from that one template's own layers.

## Motion is out of this workflow for now

This workflow's scope is `static layout = PSD`. Do not add new motion just to make a template feel more alive while implementing a PSD sync. Existing motion may stay; do not expand it. A future "Motion Spec" is a separate, later concern, and motion must never be allowed to change the static geometry this workflow defines.

## Standard per-template sync procedure

When the user says something like "I updated phase-milestones in the PSD, sync the web to it," the AI runs exactly this:

1. Locate the PSD section (by its `SECTION_NN_*` layer group name via `psd-template-spec.json`'s `sourceLayerGroup`, or a `GUIDE_SECTION` layer if one exists — see `PSD_LAYER_NAMING.md`)
2. Read the PSD layers for that section — `node scripts/psd/diff-psd.mjs "<psd>"` reports whether it actually changed since the last sync (fingerprint comparison); skip the rest if it's unchanged
3. Extract geometry / typography / colors — `node scripts/psd/extract-template-spec.mjs "<psd>" --section <ID>` patches that section's `rawExtraction` (raw, unreasoned measurements) without touching its curated `elements`/`variants`/`status`/notes
4. Reason over `rawExtraction` and update that section's curated `elements` in `psd-template-spec.json` by hand/AI-judgment (this is the step that decides "which layer is the real title vs. a stale placeholder," corrects a Free-Transform-scaled font size, etc. — see `PSD_TEMPLATE_SPEC.md`'s worked examples)
5. Diff the current renderer/CSS against the updated curated spec
6. Modify only the corresponding template's renderer/CSS
7. Render it at a matching viewport
8. Screenshot-compare against the PSD
9. `pnpm typecheck`
10. `pnpm build`

Never do `screenshot → guess → CSS → guess again`. The spec file is the intermediate, checkable artifact between "read the PSD" and "write the CSS" — skipping it is what produces the guessing loop this workflow replaces.

## Verification tiers

Most visual syncs need only:

```
screenshot compare against the PSD
+ pnpm typecheck
+ pnpm build
```

Escalate only when the change actually crosses one of these boundaries:

- A **schema change** → also check the AI / Project Code contracts (`src/lib/projectCodeTemplateContracts.ts`)
- A **print primitive / export layout change** → also check the PDF pipeline (`src/lib/pdf/pdfExportRegistry.json`, `ProjectExactWebExportAction.tsx`)
- A **shared/global component change** → also check every other template or page that shares it

Do not run the full pipeline (schema + AI contract + PDF + every other template) for an ordinary single-template visual sync. Matching the escalation to what actually changed is itself part of this workflow, not an optional shortcut.

## Scope: frontend/presentation layer only, for now

The current priority is the frontend visual/presentation layer — bringing the existing portfolio's layout, rhythm, and reading structure in line with the user's own PSD-authored design. The already-largely-complete backend/data/AI pipeline (schema, database/storage shape, Project Code import/export, PDF export architecture, persistence) is **not** in scope and must not be touched incidentally while doing PSD sync work.

If implementing a PSD sync would actually require changing schema, storage/database shape, the Project Code contract, AI import/export, PDF architecture, or any other backend/persistence concern: **stop and report to the user before making that change.** Do not silently expand a frontend visual sync into a backend change because it seemed like the more thorough fix.

## Tooling: PSD reading is now a repo script

`scripts/psd/` (Node, uses the `ag-psd` devDependency):

```
node scripts/psd/inspect-psd.mjs "<psd path>" [--json]
node scripts/psd/diff-psd.mjs "<psd path>" [--update-cache]
node scripts/psd/extract-template-spec.mjs "<psd path>" --section <SECTION_ID> [--force]
```

- `inspect-psd.mjs` — read-only full layer-tree dump (visible **and** hidden layers, per "hidden != unused" above). No writes.
- `diff-psd.mjs` — computes each known section's fingerprint and compares it against `docs/design/psd-spec-cache.json`; reports `NEW` / `CHANGED` / `UNCHANGED` per section, plus any top-level PSD group that isn't mapped to a section yet. Dry-run unless `--update-cache` is passed.
- `extract-template-spec.mjs --section <ID>` — the only one of the three that writes `psd-template-spec.json`, and only that one section's `rawExtraction` + `lastExtractedAt` fields; every curated field on that section (`elements`, `variants`, `status`, hand-written `note`s) is left untouched. Skips the extraction entirely (prints and exits) if the section's fingerprint hasn't changed, unless `--force` is passed.

See `PSD_TEMPLATE_SPEC.md` for the fingerprint/cache mechanics and the `extracted` / `confirmed` / `manual` provenance model this is built on.

### PSD write-back

The AI cannot currently write to the PSD file at all — everything above is read-only against the PSD. If/when write-back becomes available, the default permissions are:

- **Allowed by default**: renaming layers/groups, regrouping, filling in a missing Frame/Section/role/variant/state name, establishing a web `templateId` ↔ PSD section mapping
- **Forbidden by default** (only with explicit user request): x/y, width/height, visibility, font size, color, opacity, gradient, actual visual layer stacking order

In short: the AI may tidy and label the PSD so both the user and future AI sessions read it the same way — it may never redesign the PSD's actual content.
