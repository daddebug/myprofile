# PSD Layer Naming Protocol

> **DEPRECATED / LEGACY.** Superseded by `docs/design/FIGMA_LAYER_NAMING.md`. Kept for historical reference only — see `skills/figma-template-sync/SKILL.md` for current work.

Shared convention between the user and the AI for naming layers/groups inside the source PSD, so a section and its elements can be located programmatically instead of by eyeballing a layer thumbnail.

## Section level

Top-level (or near-top-level) groups that correspond to one web template/page-section each:

```
SECTION_01_HERO
SECTION_02_PHASE_MILESTONES
SECTION_03_CONCEPT_DIAGNOSIS
SECTION_04_...
```

The numeric prefix is the section's vertical order on the page; the suffix should read as the template's own concept, not a literal Chinese working title (the current file's actual group names — `标题`, `目录` — are what mapping currently keys off; renaming them to this convention is a future PSD-tidy task, not required before the workflow can be used).

## Element level, inside a section

```
META_CATEGORY
META_YEAR

TITLE_MAIN
TITLE_LINE_01
TITLE_LINE_02
DESC

DECOR_ORB_RIGHT
GLOBAL_LINE_BASE

NODE_01_NUMBER
NODE_01_TITLE
NODE_01_DESC

NODE_02_NUMBER
NODE_02_TITLE
NODE_02_DESC
```

## Every element carries a role: GLOBAL / ITEM / DECOR / GUIDE

- **GLOBAL** — spans or governs the whole section, not one item (e.g. `GLOBAL_LINE_BASE`, the baseline that runs the full row). A GLOBAL element must never be truncated to only reach the last currently-visible item — if the PSD's line spans the full section width, the web's does too, regardless of whether the row currently renders 3, 4, or 5 items.
- **ITEM** — belongs to one repeating unit (`NODE_<n>_NUMBER/TITLE/DESC`, `META_CATEGORY`, `TITLE_MAIN`, `DESC`).
- **DECOR** — a decorative element with no data behind it (`DECOR_ORB_RIGHT`, `DECOR_RULER`).
- **GUIDE** — a guide/annotation layer, never rendered on the web at all (see below).

`psd-template-spec.json` records this as each element's `role` field. Getting an element's role right is what lets the AI apply "a GLOBAL line must span the full section" or "hidden ITEM columns are a variant, not clutter" automatically, instead of the user having to say it out loud every time.

## Frame / Section / Element hierarchy

```
DOCUMENT
  └── FRAME
        └── SECTION (= one web template)
              └── ELEMENT (role: GLOBAL / ITEM / DECOR / GUIDE)
```

```
FRAME_01_COVER
  ├── SECTION_01_HERO
  └── SECTION_02_PHASE_MILESTONES

FRAME_02_...
```

A Frame is one full portfolio-page visual unit (see `PSD_TEMPLATE_WORKFLOW.md`'s "1920x1080 Frame" section) — this is what lets the web know which templates belong to the same visual page, and gives a future PDF pipeline a natural one-Frame-per-page boundary.

## Guide layers

```
GUIDE_FRAME
GUIDE_SECTION
GUIDE_ALIGN
GUIDE_RANGE
```

These are never rendered — they exist purely to tell the AI where a Frame/Section boundary or an alignment anchor actually is, instead of the AI inferring it from the bounding box of whatever content happens to be visible (which `PSD_TEMPLATE_WORKFLOW.md`'s "Section boundaries" rule explicitly forbids). **The current source PSD has none of these yet** (checked both visible and hidden layers) — every Frame/Section bound in `psd-template-spec.json` today is marked `"status": "inferred, not GUIDE_FRAME-confirmed"` for exactly this reason. The moment a `GUIDE_*` layer exists for a given boundary, it overrides any inferred bound for that same boundary.

`NODE_<index>_*` repeats once per item for a template with a variable-count row (phase-milestones, concept-diagnosis-cards, etc.). `TITLE_LINE_<n>` is only needed when a title's manual line breaks are split across separate layers rather than one text layer with an embedded newline — either is fine; record which one a given PSD actually uses in that section's `psd-template-spec.json` entry (see `TITLE_MAIN.line2IndentTechnique` for a worked example, which uses embedded newline + leading spaces).

## The user does not have to name everything by hand

Real PSD layers arrive as `图层 43`, `副本 2`, `xxx`, `01`, and similar Photoshop-default names — the current source file is entirely like this. When asked to help tidy the PSD, the AI should propose (or, once write-back exists, apply) a name from this protocol based on:

- which section the layer sits in
- the layer's actual text/image content
- its geometry (position relative to siblings, size)
- its layer type (text, shape, group)

A layer whose role cannot be confidently inferred should be left alone and flagged, not force-renamed with a guess.

## Reading layers that don't follow this convention yet

Every extraction so far (see `psd-template-spec.json`) has been done against the PSD's real, un-renamed layer names (`标题`, `目录`, `01`, `方向选择`, etc.) — this naming protocol does not block reading a PSD; `sourceLayerName` in the spec always records the layer's actual current name so the mapping stays traceable even before any renaming happens.
