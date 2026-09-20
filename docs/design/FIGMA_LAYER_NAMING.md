# Figma Layer Naming Protocol

Shared convention between the user and the AI for naming Figma layers/frames/groups, so a Frame and its elements can be located and reasoned about programmatically instead of by eyeballing a layer thumbnail. Supersedes `PSD_LAYER_NAMING.md` (see that file's deprecation banner) — the same underlying ideas (GLOBAL/ITEM/DECOR roles, Frame → Section/Group → Element hierarchy) carry over, expressed through Figma's own structure instead of PSD groups.

## Frame level

```
FRAME_01_COVER
FRAME_02_PROBLEM
FRAME_03_ANALYSIS
...
```

The numeric prefix is the Frame's vertical order on the page; the suffix should read as the Frame's own concept. Every Frame is either `1920×1080` (FULL) or `1920×540` (HALF) — see `FIGMA_TEMPLATE_WORKFLOW.md`'s Artboard rules.

## Element level, inside a Frame

```
HERO_CATEGORY
HERO_TITLE_LINE_01
HERO_TITLE_LINE_02
HERO_ORB

PHASE_BASELINE

PHASE_ITEM_01
  NUMBER
  TITLE
  DESC_01
  DESC_02
```

`PHASE_ITEM_<n>` repeats once per item for a Frame with a variable-count row; its children (`NUMBER`, `TITLE`, `DESC_<n>`) are Figma's own nested layers/groups, not something the AI invents by looking at the rendered image.

## GLOBAL / ITEM / DECOR — inferred from Figma hierarchy, not visual guessing

- **GLOBAL** — one Figma layer/shape that spans or governs the whole Frame (e.g. a single `Rectangle` used as a baseline running the full row width). Never split into per-item segments on the web side.
- **ITEM** — belongs to one repeating unit (a `PHASE_ITEM_<n>` group) or one single-instance field (`HERO_CATEGORY`, a title line).
- **DECOR** — purely decorative, no data behind it (`HERO_ORB`).

A Figma `Group 1`..`Group N` set of siblings means N item groups on the web — read the grouping Figma already encodes; don't re-derive it from the screenshot.

## The user does not have to name everything by hand

Figma layers arrive with Figma's own default names (`Rectangle 2`, `Group 4`, `Frame 17`, etc.) — normal, expected, not a blocker. When asked to help tidy a Figma file, the AI proposes (or applies, once write access exists and is used) a name from this protocol based on:

- which Frame the layer sits in
- the layer's actual text/image content
- its geometry (position relative to siblings, size)
- its layer type (text, shape, frame, group, component)

A layer whose role can't be confidently inferred is left alone and flagged, not force-renamed with a guess.

## What the AI may change in Figma by default, and what it may not

- **Allowed by default**: renaming layers/frames/groups, regrouping, adding a missing Frame/element-role label.
- **Forbidden by default** (only with the user's explicit request): position, size, font, fill, gradient, stroke, radius, opacity, visibility, layer stacking order — any actual geometry or style property.

In short: the AI may tidy and label a Figma file so both the user and future AI sessions read it the same way — it may never redesign what's actually drawn.

## Hidden nodes are still design information

A hidden Figma layer/frame/group is not automatically "unused." It can represent a count/state variant not currently shown (see `FIGMA_TEMPLATE_WORKFLOW.md`'s "Variants use Figma's own structure"), an alternate composition, or content staged for later. Read it with the same weight as a visible node unless it's explicitly named/marked as scrap.
