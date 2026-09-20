# Figma Template Sync

Applies to any portfolio **visual / project template / artboard / layout / hero / presentation** task. This supersedes `skills/psd-template-sync/SKILL.md` — see that skill's own deprecation banner. Figma is now the single authoritative visual source; PSD is no longer used to sync new web work.

**Before implementation, read, in this order:**
1. `docs/design/FIGMA_TEMPLATE_WORKFLOW.md` — the full process and every hard rule
2. `docs/design/FIGMA_LAYER_NAMING.md` — how Figma Frames/elements are identified
3. `docs/design/FIGMA_TEMPLATE_SPEC.md` — what `figma-template-map.json`'s fields mean (and why it's a mapping, not a second measurement database)
4. `docs/design/figma-template-map.json` — the current Frame → node → web-component mapping for whatever Frame this task touches

This applies even in a brand-new conversation that never mentioned Figma — the rule lives here precisely so the workflow survives a change of conversation.

## Non-negotiables (see FIGMA_TEMPLATE_WORKFLOW.md for the full list)

- **Figma is the single authoritative visual source.** The web is a faithful, proportionally-scaled implementation — never a reinterpretation, even when a "web best practice" instinct disagrees with what Figma shows.
- **No tolerance band.** "Visually close enough" / "a few px is acceptable" / "adjusted for the web" are not acceptable outcomes. At the 1920px design viewport, Figma geometry = web geometry.
- **Read the target node directly — don't re-scan the whole file.** Look up the Frame's `nodeId` in `figma-template-map.json` first; only do a broader page read the first time a brand-new Frame appears.
- **Responsive redesign is paused.** No `clamp()`/`vw`/independent per-element responsive sizing inside an Artboard. A viewport narrower than 1920 gets exactly one whole-Artboard `scale = availableWidth / 1920` transform.
- **A Figma Frame's internal relationships are preserved as one Artboard**, not split into separate web sections — reuse `src/project-presentation/` (`ProjectArtboard`, `ArtboardStack`, `ArtboardTemplateSlot`, `ArtboardInstanceRenderer`), don't rebuild it and don't revert to normal document flow.
- **GLOBAL/ITEM/DECOR roles come from Figma's own layer hierarchy**, not from re-interpreting a screenshot. A hidden Figma node is still real design information (**hidden != unused**).
- **Font is always Microsoft YaHei** (`"Microsoft YaHei", "Microsoft YaHei UI", sans-serif`) — system font only, never bundled, regardless of what a Figma text node itself is set to.
- **Data layer and visual layer stay separate.** If a Figma design would require a schema/backend/persistence change, stop and report to the user first — do not fold a backend change into a visual sync.
- **Verification is Frame-level.** The acceptance check is a whole-Frame screenshot compare (Figma vs. web), not a list of individually-matching element coordinates — those are debugging tools, not the deliverable.
- **Match the verification tier to what actually changed** — an ordinary single-Frame visual sync needs `pnpm typecheck` + `pnpm build` + a Frame-level screenshot compare, not the full schema/AI-contract/PDF/every-other-template pipeline.

## Tooling

Figma MCP tools (`get_design_context`, `get_screenshot`, `get_metadata`, etc.) read the live file directly — use them against the specific `nodeId` from `figma-template-map.json`, not a full-page scan. There is no local parser/cache step the way PSD needed one (see FIGMA_TEMPLATE_SPEC.md for why the map deliberately doesn't duplicate Figma's own geometry data).

## PSD is legacy

`docs/design/PSD_TEMPLATE_WORKFLOW.md`, `PSD_LAYER_NAMING.md`, `PSD_TEMPLATE_SPEC.md`, `psd-template-spec.json`, `skills/psd-template-sync/SKILL.md`, and `scripts/psd/` still exist and are not deleted, but are deprecated — do not use them as the entry point for new visual work. They may still be useful for inspecting an old PSD file if one ever needs historical reference.
