# Figma → Web Template Visual Workflow

**Any portfolio visual/project template/artboard/layout/hero/presentation task must read this file before implementation** — see `CLAUDE.md`'s Task skills section. Also read `FIGMA_LAYER_NAMING.md` (how Figma layers/frames/elements are identified) and `FIGMA_TEMPLATE_SPEC.md` (what `figma-template-map.json`'s fields mean) before touching a Frame that has a Figma source.

This supersedes `PSD_TEMPLATE_WORKFLOW.md` — see that file's own deprecation banner. PSD is no longer an authoritative visual source for new work; do not treat PSD and Figma as two simultaneous sources of truth.

## Roles

```
Figma = the single authoritative visual source
Web   = implementation
PSD   = deprecated visual source — not used for new web sync
```

Figma defines every visual relationship a Frame renders: position, size, typography, alignment, fill, gradient, stroke, radius, opacity, layer hierarchy, visibility. The web is a faithful, proportionally-scaled implementation of it — never a reinterpretation, never "close enough," never adjusted because it would read better in a browser. If a web-best-practice instinct disagrees with what Figma shows, **Figma wins**.

## Current Figma source

```
fileKey: hSSB0YpQ1UfCNI5FqaGuKZ
```

See `figma-template-map.json` for the live Frame → node → web-component mapping. Do not hardcode `fileKey` or `nodeId` anywhere else — read them from that file.

## Artboard rules

The project-internal presentation layer uses exactly two Frame sizes:

```
FULL = 1920 × 1080
HALF = 1920 × 540
```

One Figma Frame = one web Artboard (`ProjectArtboard`, already built in `src/project-presentation/` — see "Reused architecture" below). Multiple Frames stack top to bottom, seamlessly:

```
Artboard 01
Artboard 02
Artboard 03
...
```

`gap: 0; margin: 0` between them, always — `ArtboardStack` already enforces this. Each Frame owns its own complete background. There is no single global project-page background with templates floating on top of it.

## Figma geometry is absolute truth

The web must read positions/sizes/typography/etc. directly from the target Figma node — never re-estimate from a screenshot. Forbidden phrases for this workflow: "visually close enough," "6px is acceptable," "adjusted for what reads better on the web." At the 1920px design viewport:

```
Figma geometry = Web geometry
```

No tolerance band. If a measured web value doesn't match the Figma node's own value, that is a defect to fix, not a rounding difference to accept.

## Responsive redesign is paused

1920px is the only design coordinate system right now. Inside an Artboard, the web must NOT independently use `clamp()`, `vw`, responsive font resizing, responsive gap, responsive padding, or auto-layout reflow — none of these are allowed to change the *proportions* between elements. For a viewport narrower than 1920, the whole Artboard scales as one unit:

```
scale = availableWidth / 1920
```

One transform on the whole board — never per-element independent scaling. This is already how `ProjectArtboard` works; do not add per-element responsive behavior on top of it.

## A Figma Frame's internal relationships must be preserved

`FRAME_01_COVER` (node `1:2`) contains Hero and Phase Milestones. They are not two web sections — they share one `1920×1080` coordinate system and must be implemented as one Artboard, exactly like the existing Cover implementation. The same rule applies to every future multi-element Frame: everything inside one Frame shares that Frame's own coordinate system, full stop.

## Title / line rules come directly from Figma layers

An independent text layer in Figma is an independent web element. Do not concatenate Figma's separate text layers into one string and let the browser auto-wrap it. The current Cover title is two explicit layers (line 1, line 2) — implemented as two elements, not one wrapped string. If Figma shows line 1 left-anchored and line 2 right-anchored, the web matches: as line 2's content grows, its right edge stays fixed and its left edge grows leftward — the anchor never changes because a container happens to resize.

## GLOBAL / GROUP / ITEM come from Figma hierarchy, not visual guessing

A single Figma rectangle spanning the full row (e.g. `Rectangle 2`, `x=0, width=2054`) is one GLOBAL element — never split into per-item segments on the web side just because it visually sits under several items. Likewise, `Group 1`..`Group 5` in Figma means five item groups on the web — the AI infers structure from Figma's actual grouping, not from re-interpreting the rendered image.

## Variants use Figma's own structure

Count/state variants (e.g. a 3/4/5-item Phase Milestones row) are expressed with Figma's native mechanisms — Frame, Group, Component, Variant, or a hidden/visible node — not invented from scratch on the web side. A hidden Figma node can still be real design information (**hidden != unused**) — never assume a hidden node is irrelevant by default.

## Figma naming is the shared language

See `FIGMA_LAYER_NAMING.md` for the convention. The user does not have to hand-organize every layer to this standard before work can start; the AI may propose or apply renames/regrouping. By default the AI may change only *organizational* information (names, grouping, Frame labels, element-role labels) — position, size, font, fill, gradient, visibility, opacity, and any other geometry/style property require the user's explicit request to change.

## Fonts

Unconditionally Microsoft YaHei, regardless of what any individual Figma text node is set to:

```css
font-family: "Microsoft YaHei", "Microsoft YaHei UI", sans-serif;
```

System font only — never download, copy, bundle, or commit a font file.

## Motion is paused

Current priority: `Figma static composition = Web static composition`. Do not add new motion while doing a visual sync. Existing motion may stay; do not expand it.

## Data layer and visual layer stay separate

Figma decides presentation, geometry, typography, visual hierarchy, background, and composition. Figma never decides the project database, template schema, the AI Project Code paste pipeline, persistence, or actual project content. If a Figma design would require a schema/backend change to implement: **stop and report to the user before making that change.** Do not silently expand a visual sync into a backend change.

## Reused architecture: Artboard stays

`src/project-presentation/` (`ProjectPresentation`, `ArtboardStack`, `ProjectArtboard`, `ArtboardTemplateSlot`, `ArtboardInstanceRenderer`, `ProjectHeroLayer`) is the presentation layer for both PSD-era and Figma-era work — it is not being rebuilt. A Figma `1920×1080` Frame maps to `ProjectArtboard` with `height={1080}`; a `1920×540` Frame maps to `height={540}`. Do not revert to normal-flow document sections for anything that has a Figma Frame.

The Artboard invariant from the PSD-era work still applies unchanged: an `ArtboardTemplateSlot`'s own `(x, y, width, height)` is the only thing that controls a template's outer placement inside an Artboard; a template renderer placed inside an Artboard must not contribute extra outer margin/padding that changes that placement (zero it via an Artboard-scoped CSS override, never by adjusting the mapping's own Figma-sourced coordinate to compensate).

## Reading Figma efficiently — don't re-scan the whole file

Default: **do not** read/analyze the entire Figma file to sync one Frame. The normal flow:

1. The user names a Frame (e.g. "sync FRAME_03_ANALYSIS").
2. Look up that Frame's `nodeId` in `figma-template-map.json`.
3. Read only that target node (design context, geometry, hierarchy, screenshot).

Only when a *brand-new* Frame appears for the first time (not yet in the map) is a broader page-metadata read needed, to locate its node and record the mapping. After that, every future sync for that Frame is a direct node read.

## Standard per-Frame sync procedure

When the user says "I updated Figma's FRAME_01_COVER, sync the web":

1. Read `figma-template-map.json`
2. Locate that Frame's `nodeId`
3. Read the target Figma node's design context
4. Read a screenshot of that node
5. Inspect geometry / hierarchy / style
6. Diff against the current web Artboard
7. Modify only the corresponding presentation renderer/CSS
8. Render at the 1920 design viewport
9. Screenshot-compare the **whole Frame** (see "Verification is Frame-level" below)
10. `pnpm typecheck`
11. `pnpm build`

No PSD step anywhere in this procedure.

## Verification is Frame-level, not element-level

Do not report success as "title coordinates match / orb coordinates match / phase coordinates match" in isolation. The actual acceptance check is:

```
Figma Frame screenshot  vs.  Web Artboard screenshot
```

— compared as one whole composition. Per-element numeric measurement is a debugging tool for finding *why* the whole-Frame comparison fails, not the deliverable itself.

## Escalation tiers (unchanged from the PSD-era rule)

Most visual syncs need only a Frame-level screenshot compare + `pnpm typecheck` + `pnpm build`. Escalate only when the change actually crosses a boundary: a schema change → also check the AI/Project Code contracts; a print primitive/export layout change → also check the PDF pipeline; a shared/global component change → also check every other page/template that shares it. Don't run the full pipeline for an ordinary single-Frame visual sync.
