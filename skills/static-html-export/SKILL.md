# Static HTML Export

The live rendered website is the only renderer for the single-file HTML snapshot.

## Permanent invariants

- UI Practice is never forced. If `ui-personal-practice` is not selected, no card, page, route, cover, image, or asset from it may be exported.
- Checked and exported projects must match exactly, in order, by stable project ID. Never match by position, title, first N items, defaults, or stale state. Any mismatch blocks download.
- Finalize retained DOM before collecting assets. Only the homepage Logo/Hero, selected cards, selected pages, and explicitly selected sections may contribute assets.
- A captured element is not complete merely because it exists in the DOM. Framer Motion/viewport entrance states must be committed before serialization; manifesto, project content, and PLAY records remaining at `opacity: 0` are export failures.
- Deduplicate payloads and optimize only the exported copy. Preserve UI screenshot text detail and never modify source assets.
- Standard single-file delivery mode targets 10 MB or less when quality-safe.
- Complete offline portfolio mode is independent of Collection selection. It captures the real full homepage, Work archive, every openable public project, and the full public PLAY/Game Experience page through the same rendered-DOM pipeline. It keeps higher-quality export copies and has a hard 300 MB limit.
- Never remove selected Collection content or public complete-site content to meet either target; block the download and report the largest required assets when the applicable export exceeds its limit.

## Required validation

Report selected/exported IDs and counts, unselected assets, forced UI Practice, irrelevant Game assets, duplicate payloads, embedded image count, file size, and literal-file navigation/visual verification.

Regression combinations: `interaction-intelligence-system`; `3d-vdr4qg`; `ai-assisted-ui-environment-design`; Agent + 3D Temperature; and the current multi-project selection.
