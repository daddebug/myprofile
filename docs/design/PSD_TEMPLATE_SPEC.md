# PSD Template Spec — field reference

> **DEPRECATED / LEGACY.** Superseded by `docs/design/FIGMA_TEMPLATE_SPEC.md` / `figma-template-map.json`. Kept for historical reference only — see `skills/figma-template-sync/SKILL.md` for current work.

`psd-template-spec.json` is the machine-readable index this workflow reads from and writes to. This document explains what its fields mean and the rules for filling them in. See `PSD_TEMPLATE_WORKFLOW.md` for the process this file is used in, and `PSD_LAYER_NAMING.md` for how sections/elements are identified.

## Top-level shape

```jsonc
{
  "sourceFile": { /* which PSD, where, when read, with what tool */ },
  "document": { "baseWidth": 1920, "baseFrameHeight": 1080, "measuredHeight": 1752 /* variable, grows over time */ },
  "guideLayers": { /* whether GUIDE_* layers exist yet -- see PSD_LAYER_NAMING.md */ },
  "alignmentAnchors": { /* shared left/right/center anchors multiple sections must reference -- see below */ },
  "frames": {
    "FRAME_NN_NAME": {
      "coverBundle": false,
      "bounds": { /* the Frame's own bounding box -- mark "inferred" unless a GUIDE_FRAME layer confirms it */ },
      "sections": {
        "SECTION_NN_NAME": {
          "templateId": "the web template id this maps to, or a note that no mapping exists yet",
          "sourceLayerGroup": "the PSD group's actual current name",
          "status": "implemented | partially implemented | not implemented, plus whether it's in sync with the current web code",
          "canonicalVariant": 5,
          "variants": { /* only for templates with a variable item count -- see below */ },
          "section": { /* the section's own bounding box, if a container layer defines one */ },
          "elements": { /* per-element measurements, keyed by the naming protocol's element id, each carrying a role -- see below */ },
          "rawExtraction": { /* machine-written by scripts/psd/extract-template-spec.mjs; never hand-edited, never patched into `elements` automatically -- see "Provenance" below */ }
        }
      }
    }
  }
}
```

A template not yet organized under a Frame may temporarily live in a flat top-level `sections` map instead (kept for backward compatibility) — `scripts/psd/lib.mjs`'s `sectionMapFromSpec` reads both shapes. Prefer nesting under `frames` once a section's Frame is known.

## Every numeric value must be measured, never guessed

Nothing in this file may be filled in from a screenshot, a verbal description, or "what looks about right." Every `x`/`y`/`width`/`height`/`fontSize`/`fontWeight`/`lineHeight`/`letterSpacing`/`fill`/`gradient` must trace back to a real PSD layer read (position, bounds, text style, or vector fill/stroke/gradient data). If a value cannot currently be measured, the field is omitted or marked with an explicit note — never filled with a plausible-looking number.

## Ratios, not just absolute px

Every position/size field should carry a matching `...Ratio` field (`xRatio`, `widthRatio`, `fontSizeRatio`, etc.), computed as the absolute PSD value divided by the PSD canvas dimension it scales with (width for anything that scales horizontally, height only for something that is genuinely height-driven — most of this workflow's elements scale with width). The ratio is what actually survives translation to a responsive `vw`/`clamp()` web value; the absolute px is kept alongside it for traceability back to the PSD.

## A value's own gotchas belong in a `note`

Two concrete examples already on file, both worth reading before assuming a raw PSD field is directly usable:

- **A layer's own `style.fontSize` can be wrong.** `SECTION_02_PHASE_MILESTONES.elements.NODE_NUMBER` has `style.fontSize: 75`, but the layer also carries a `2.6359x` Free Transform scale in its transform matrix — the actually-rendered size is `75 × 2.6359 ≈ 197.7px`. Reading `fontSize` alone under-measures this element by ~62%. Always check the layer's transform, not just its nominal type-tool font size.
- **A PSD-measured ratio is not automatically safe for real content.** `SECTION_02_PHASE_MILESTONES.elements.NODE_DESC` has a measured `leading/fontSize` ratio of `0.75`, taken from Photoshop's own layer data — but that placeholder text was Latin `x`/`c` characters, which need much less vertical room per line than a real CJK glyph. Applying `0.75` to real Chinese description text was verified (live, in the browser) to make wrapped lines visually overlap. The shipped value (`1.5`) is a documented, deliberate exception — recorded in the spec's `note` field precisely so a future sync does not silently reintroduce the broken PSD-literal value. This is the model for how to record any other case where the literal measurement turns out not to transfer.

## `variants` — for templates with a variable item count

Only record a count as `"confirmedByPsd": true` when the PSD actually draws that many items as real, finished, visible content. A hidden group, a placeholder-styled duplicate, or an inconsistent copy is not confirmation — record it as `"confirmedByPsd": false` with a `note` explaining what was actually found and why it isn't being trusted (see `SECTION_02_PHASE_MILESTONES.variants["4"]` and `["5"]` for the worked example: hidden groups, a different/muted green, and an inconsistent placeholder font, all pointing at an unfinished leftover rather than a deliberate design).

A web implementation is allowed to support a count range the PSD hasn't fully confirmed (e.g. an earlier, independent decision to allow 3-5 items) — the spec should say so explicitly, rather than silently implying the PSD is where that range came from.

## `alignmentAnchors`

A small set of shared coordinates (as ratios) that more than one section's elements line up against — `contentLeft`, `contentRight`, `center`, `titleLeft`, etc., per `PSD_TEMPLATE_WORKFLOW.md`'s "Alignment is a hard constraint" rule. Each anchor carries a `source`/`status` (see Provenance below) and a `note` explaining which sections' measurements support it and how closely (e.g. `contentLeft` is supported by Hero at x=91-92 and Phase Milestones at x=94 — a 3px difference read as manual-placement tolerance around one shared anchor, not two deliberately different margins). Do not add a second, per-template left-margin value once a shared anchor for that edge exists — reference the anchor.

## `role` — every element in `elements` carries one

`GLOBAL` (spans/governs the whole section, e.g. a baseline that must never be truncated to fewer items than the section actually has), `ITEM` (belongs to one repeating unit or one single-instance field), `DECOR` (no data behind it, purely decorative), or `GUIDE` (never rendered — an annotation only). See `PSD_LAYER_NAMING.md` for the full definitions and why this drives automatic behavior like "a GLOBAL line spans the full row regardless of visible item count."

## `canonicalVariant` and hidden-variant templates

For a count-variant template, `canonicalVariant` records the item count the user intends to eventually draw in full (e.g. `5`), independent of which count is *currently visible* in this particular PSD state. `variants["<n>"].confirmedByPsd` stays `false` until that count's PSD content is both present (visible or hidden) **and** actually looks finished — consistent color, real (non-placeholder) content, consistent font. A hidden group existing is necessary but not sufficient for `confirmedByPsd: true`; see `SECTION_02_PHASE_MILESTONES.variants` for a worked example where hidden groups exist for counts 4 and 5 but neither is trusted yet because their color/font is inconsistent with the finished, visible columns.

## Provenance: `extracted` / `confirmed` / `manual`

A value-bearing field should be either a bare literal (for structural/descriptive fields) or an object with `source` and `status`:

```jsonc
{ "value": 56, "ratio": 0.0292, "source": "psd", "status": "confirmed" }
```

- **`source: "psd"`** — read directly off a PSD layer, not yet reasoned over by a human/AI pass.
- **`source: "policy"`** — comes from a project-wide rule in `PSD_TEMPLATE_WORKFLOW.md` (e.g. the forced Microsoft YaHei font family), not this specific PSD layer.
- **`source: "manual"`** — a deliberate, documented override of what the PSD literally measures, because the literal value doesn't transfer safely (the `NODE_DESC` line-height override — PSD measures `0.75`, shipped value is `1.5` — is the worked example; see its `note` for why).
- **`status: "confirmed"`** — safe to rely on for implementation.
- **`status: "unconfirmed"`** — present but not yet trustworthy (e.g. an `alignmentAnchors.contentRight` that can't yet be derived unambiguously).

This is also why `rawExtraction` (see below) is never blindly copied into `elements` — a `source: "manual"` override in `elements` must survive a later `extract-template-spec.mjs` run that only ever refreshes `rawExtraction`, not `elements`.

## `rawExtraction` — machine output, not curated data

`scripts/psd/extract-template-spec.mjs --section <ID>` writes a section's `rawExtraction` key: every layer in that PSD group's raw geometry/typography/color, with no role/naming/judgment applied. This is the *input* to the "update curated elements" step in `PSD_TEMPLATE_WORKFLOW.md`'s sync procedure, not the output. The script only ever touches `rawExtraction` and `lastExtractedAt` on the target section — it never writes `elements`, `variants`, `status`, or any hand-written `note`, so a re-extraction can never silently undo a human's earlier reasoning (e.g. "column 1's title is real, columns 2-5's `xxxx` placeholder is not" — a judgment call the raw layer data alone doesn't encode).

## Fingerprints and the incremental-sync cache

`docs/design/psd-spec-cache.json` (also committed, so this survives across sessions) records, per section:

```jsonc
{
  "psdPath": "...",
  "fileMtime": "...", "fileSize": ..., "fileHash": "...",
  "sections": {
    "SECTION_ID": { "layerIds": [...], "fingerprint": "sha256...", "lastParsedAt": "..." }
  }
}
```

A section's fingerprint is a hash of a normalized descriptor of its full layer subtree (name, visibility, bounds, text content/style, fill/gradient — see `scripts/psd/lib.mjs`'s `sectionFingerprint`), so it changes if and only if something a human would call "the design" actually changed, not because of an incidental internal PSD offset. `diff-psd.mjs` compares the PSD's current fingerprints against this cache and reports `NEW` / `CHANGED` / `UNCHANGED` per section without touching the spec file. `extract-template-spec.mjs` uses the same comparison to skip a section entirely (no `rawExtraction` write at all) when nothing changed, so a growing multi-Frame PSD does not require a full re-parse-and-re-reason pass every time one template is touched — only the changed section's `rawExtraction` is refreshed, and only that section then needs a human/AI reasoning pass to update its `elements`.

## `status`

One of:
- **not implemented** — no corresponding web code exists yet
- **partially implemented** — web code exists but was not built from this spec (e.g. built from an earlier screenshot-based guess) and has known discrepancies from the measured PSD; discrepancies belong in each affected element's `note`
- **implemented and synced** — the web code was written or last updated directly from this spec's current values

A discrepancy noted under `status: partially implemented` is not automatically a bug to fix — it is a flag for the next time this template is the subject of an explicit sync request. Do not fix it as a side effect of unrelated work.

## Template-local CSS tokens trace back here

Per `PSD_TEMPLATE_WORKFLOW.md`, a template's own CSS custom properties (`--pm-number-size`, `--pm-section-padding-top`, etc.) should each be traceable to one specific field in this file. If a token's value cannot be pointed at a measurement here, that is a sign it was guessed rather than sourced from the PSD.
