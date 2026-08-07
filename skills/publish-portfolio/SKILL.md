# Publish Portfolio

Stable workflow for moving browser-only owner drafts into source control and production.

## Workflow

1. Generate a complete production export from current browser data (`EXPORT FOR PUBLISH`), including dynamic drafts, template instances, and every referenced image.
2. Import with `--confirm` only after a successful dry run (`pnpm portfolio:import`, then `pnpm portfolio:import -- --confirm`). The dry run must be reviewed, not skipped.
3. Verify `src/data/publishedPortfolio.json` actually contains the real content (drafts, covers, assets) — not an empty or partial result.
4. Run `pnpm typecheck` and `pnpm build`.
5. Review the exact `git diff` and staged file list before committing anything.

## Exclude from commits

- `output/`, temporary files, recovery/backup data
- `.env` and any credentials file
- `.zip`, `.data`, `.br` files
- Oversized assets that don't belong in source control

## Git and deploy safety

- Never force push or modify the remote's branch protection/config.
- Commit and push only after explicit publishing approval from the user — not implied by "looks good" on an unrelated change.
- After pushing, verify the real cloud deployment and the live pages actually reflect the change.

## Scope

Publishing (moving drafts to source control and deploying) and Portfolio Collection PDF generation (see `skills/portfolio-collection/SKILL.md`) are separate tasks. Do not conflate a request for one with the other.
