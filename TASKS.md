# Tasks

Last reviewed: 2026-09-22

Only unresolved work belongs here. Historical implementation and verification evidence lives in `CHANGELOG.md` and `PROJECT_STATUS.md`.

## Homepage completion - MAIN only

- Complete only the current Homepage in `D:\myprofilegit\myprofile` on `main`; never resume or copy the old worktree Homepage.
- Make the WebGL square-cell hover work for every active project (8/8), including the first hover after a fresh reload.
- Make each card footprint art-directed and independent of the source image's aspect ratio; square covers must not automatically become huge or full-row.
- Preserve paired/two-column compositions on mobile instead of flattening every project into a single-column feed.
- Finish the Hero shell first; defer complex 3D work. Improve above-the-fold cover loading and performance as part of the Homepage completion pass.
- After a separately approved publish, verify self-hosted font loading and cold-load timing in the real production browser/network. The local production preview removed the blocking Google Fonts request, but this is not yet an online performance acceptance.
- Verify the reported old blue/green first-load substrate in the user's actual cold browser/online environment after a separately approved publish. The local production preview now has cream `html`/`body`/`#root` before CSS or JS and did not reproduce the old color; do not claim its historical source was identified.

## Publishing

- Generate a fresh real `EXPORT FOR PUBLISH` after the explicit project `DELETE`-intent exporter fix.
- Verify the final plan contains exactly 8 active projects and 9 `REMOVED` projects, then confirm that production `publishedPortfolio.json` contains only the intended active projects after an explicitly approved publish.
- Verify the online Homepage contains no deleted or stale project.

## DILIDA Desk

- Investigate the deployment-progress UI remaining stuck on "waiting for Vercel" after online verification has already succeeded.
- Inspect DILIDA Desk's own Git repository and remote before adding a DESK GIT entry.

## Current authority and safety rules

- Authoritative checkout: `D:\myprofilegit\myprofile`, branch `main`.
- Real Chrome is the authority for Owner/local browser state; the Claude/Codex browser pane is a separate profile.
- Current confirmed Owner lifecycle: 8 ACTIVE + 9 DELETE.
- `publishedPortfolio.json` is the published baseline, not Owner truth.
- Structural difference from published data is not corruption by itself.
- Only explicit `deletedProjectIds` may remove projects; absence from a bundle is not deletion.
