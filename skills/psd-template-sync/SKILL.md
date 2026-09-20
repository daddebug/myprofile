# PSD Template Sync

> **DEPRECATED / LEGACY.** Superseded by `skills/figma-template-sync/SKILL.md` — the user now does all portfolio visual design in Figma, not PSD. This skill is kept only for inspecting an old PSD file for historical reference; it is not the entry point for new visual/template/artboard/layout/hero/presentation work.

Applies to any portfolio **visual/template** task — new template, template redesign, "sync X with the PSD," hero/cover work, or any layout/spacing/color/typography change to a template that has (or should have) a PSD source.

**Before implementation, read, in this order:**
1. `docs/design/PSD_TEMPLATE_WORKFLOW.md` — the full process and every hard rule
2. `docs/design/PSD_LAYER_NAMING.md` — how PSD layers/sections/elements are identified
3. `docs/design/PSD_TEMPLATE_SPEC.md` — what `psd-template-spec.json`'s fields mean
4. `docs/design/psd-template-spec.json` — the current measured spec for whatever section this task touches

This applies even in a brand-new conversation that never mentioned a PSD — the rule lives here precisely so the workflow survives a change of conversation.

## Non-negotiables (see PSD_TEMPLATE_WORKFLOW.md for the full list)

- **The PSD is the single authoritative visual source.** The web is a faithful, proportionally-scaled implementation of it — never a reinterpretation, even when a "web best practice" instinct disagrees with what the PSD shows.
- **Never invent a ratio, gap, color, alignment, or line-break the PSD doesn't show.** If a state or item-count variant isn't confirmed by the PSD, stop and ask — do not guess or extrapolate.
- **Hidden PSD layers are official design information**, not clutter — read them with the same weight as visible ones (unless marked `UNUSED`/`DELETE`/`ARCHIVE`/`BACKUP`).
- **Font is always Microsoft YaHei** (`"Microsoft YaHei", "Microsoft YaHei UI", sans-serif`) — system font only, never bundled.
- **Alignment anchors are shared, not per-template.** Check `psd-template-spec.json.alignmentAnchors` before writing a new left/right margin.
- **This phase is frontend/presentation only.** If a PSD sync would require a schema, database, Project Code contract, AI import/export, or PDF-architecture change, stop and report to the user first — do not fold a backend change into a visual sync.
- **Match the verification tier to what actually changed** (see PSD_TEMPLATE_WORKFLOW.md's "Verification tiers") — an ordinary single-template visual sync needs `pnpm typecheck` + `pnpm build` + a screenshot compare, not the full schema/AI-contract/PDF/every-other-template pipeline.

## Tooling

`scripts/psd/inspect-psd.mjs`, `diff-psd.mjs`, `extract-template-spec.mjs` — see `PSD_TEMPLATE_WORKFLOW.md`'s "Tooling" section for usage. `extract-template-spec.mjs` only ever writes a section's `rawExtraction`; turning that into curated `elements` is a separate, judgment-driven step described in the same doc's sync procedure.
