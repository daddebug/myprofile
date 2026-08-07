# Tasks

## Unresolved

- **Playable-game embeds (`PlayableGameTemplate`) don't load in production — separate from the template-image fix.** Discovered while live-verifying `game-jam-8lzejf`: `content.game.entryPublicPath` (the actual embedded game bundle, ~109MB/17 files) and `content.cover.publicUrl` (its thumbnail) both point at the dev server's local-only `/portfolio-assets/playable-games/<projectId>/...`, staged via `stagePlayableGame`/`stagePlayableGameCover` in `portfolioContentClient.ts` — a different persistence mechanism from the `imageId`-based template images already fixed. Not fixed: out of scope for the image-loading fix (different content type, much larger payload, needs its own review of how a 100MB+ game bundle should be exported/hosted).

## Pending verification

(none — the UI Practice production-image gap was fixed in `50ff4e3` and verified visually in the owner's real Chrome; this supersedes the earlier URL-only image check.)

## Deferred

(none)
