# Figma Template Spec — field reference

`figma-template-map.json` is the machine-readable index this workflow reads from. This document explains what its fields mean and — importantly — what this file is deliberately **not**. See `FIGMA_TEMPLATE_WORKFLOW.md` for the process this file is used in, and `FIGMA_LAYER_NAMING.md` for how Frames/elements are identified.

## This is a mapping, not a second measurement database

The PSD-era `psd-template-spec.json` (now deprecated — see its own status field) hand-copied a large amount of measured geometry (x/y/width/height/font-size/color/…) into JSON, because a flattened PSD file has no other queryable source of truth once read. **Figma does not have this problem** — Figma already stores every geometry/style value natively, and the Figma API/MCP tools can read a live node directly at sync time. Duplicating that data into a second JSON file would immediately start drifting from the real file the moment someone edits Figma without also hand-updating the JSON — exactly the failure mode this migration exists to avoid.

`figma-template-map.json` therefore stores **only**:

- which Figma node corresponds to which Frame
- that Frame's nominal size (`1920×1080` or `1920×540` — enough to pick `ProjectArtboard`'s `height`, not a substitute for reading the node)
- which web component(s) implement it
- a coarse status (e.g. `"design-in-progress"`, `"implemented"`)

It does **not** store individual element coordinates, font sizes, colors, or any other measured value — those are read from the live Figma node every time a sync actually happens.

## Top-level shape

```jsonc
{
  "fileKey": "hSSB0YpQ1UfCNI5FqaGuKZ",
  "frames": {
    "FRAME_01_COVER": {
      "nodeId": "1:2",
      "width": 1920,
      "height": 1080,
      "status": "implemented",
      "web": {
        "artboard": "FRAME_01_COVER",
        "components": ["ProjectHeroLayer", "phase-milestones"]
      }
    }
  }
}
```

- `fileKey` — the single Figma file every Frame in this map lives in. If a second file is ever introduced, add a `fileKey` per-frame instead of assuming one global file.
- `frames.<FRAME_ID>.nodeId` — the only thing a sync needs to locate the real design. Read the node directly; never hand-transcribe its contents here.
- `width` / `height` — the Frame's nominal design size (1920×1080 or 1920×540 per the Artboard rules), used to pick which `ProjectArtboard height` to render into. Not a cache of the node's own geometry.
- `status` — `"design-in-progress"` (Frame exists in Figma, not yet implemented on the web), `"implemented"` (web matches Figma as of the last sync), or a similar short label. Not a substitute for actually checking — a stale `"implemented"` status is a documentation bug, not proof of correctness.
- `web.artboard` — which `ProjectArtboard` instance in the presentation layer this Frame maps to.
- `web.components` — which component(s) render this Frame's content (e.g. `ProjectHeroLayer` for Hero elements, `phase-milestones` for the reused generic template rendered via `ArtboardInstanceRenderer`).

## Adding a new Frame to the map

Per `FIGMA_TEMPLATE_WORKFLOW.md`'s "Reading Figma efficiently": the *first* time a new Frame is synced, a broader page-metadata read locates its `nodeId`; that gets recorded here (`status: "design-in-progress"` if not yet implemented). Every subsequent sync for that Frame reads `nodeId` directly from this map — no repeated full-file scan.

## GLOBAL / ITEM / DECOR roles still apply, just not stored here

Per-element role classification (`FIGMA_LAYER_NAMING.md`) happens during an actual sync, by reading the target node's live hierarchy — it is reasoning applied at sync time, not a field cached in this map. The map's job ends at "here is the node to go read."
