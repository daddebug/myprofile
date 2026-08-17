// External reference validation (Publishing Architecture V2, Phase C).
// figmaUrl/sourceUrl/embedUrl/playUrl (and any other `external-embeds`
// reference discoverReferences.mjs finds) are URLs, never disk assets --
// they never go through resolveAsset.mjs's bundle/published-fallback
// candidates, which only make sense for byte content. This module is the
// ONE place an external reference's validity is decided, mirroring V1's
// own rule exactly (see publishing-preflight-lib.mjs's INVALID_EXTERNAL_URL
// check): must be https://, and must not point at a location that could
// only ever exist on a developer's own machine (localhost/127.0.0.1/
// appdata/a Windows temp path) -- never something safe to publish.
//
// Browser diagnostics are never authoritative here, or anywhere in V2 --
// this is the only place that decides.
const VALID_PROTOCOL = /^https:\/\//i;
const FORBIDDEN_HOST_PATTERN = /localhost|127\.0\.0\.1|appdata|\\temp\\/i;

export function validateExternalReferenceUrl(url) {
  if (typeof url !== "string" || !url.trim()) return { valid: false, reason: "External reference is empty." };
  const trimmed = url.trim();
  if (!VALID_PROTOCOL.test(trimmed)) return { valid: false, reason: `External reference is not a production-safe HTTPS URL: ${trimmed}` };
  if (FORBIDDEN_HOST_PATTERN.test(trimmed)) return { valid: false, reason: `External reference points at a local/development-only location: ${trimmed}` };
  return { valid: true };
}

/**
 * @param {{ url: string }} reference -- from discoverReferences.mjs, kind: "external"
 * @param {"inherited" | "changed"} referenceIntent -- carried for reporting
 *   parity with resolveAsset.mjs's signature and so a BLOCKED item can say
 *   whether the bad value is newly introduced or was already there; unlike
 *   resolveAsset, validation itself never varies by intent -- there is no
 *   disk-fallback candidate to gate for a URL, so both "inherited" and
 *   "changed" values are always validated the same, unconditional way.
 * @returns {{ status: "RESOLVED", url: string } | { status: "BLOCKED", reason: string }}
 */
export function resolveExternalReference(reference, referenceIntent) {
  void referenceIntent;
  const validation = validateExternalReferenceUrl(reference.url);
  if (!validation.valid) return { status: "BLOCKED", reason: validation.reason };
  return { status: "RESOLVED", url: reference.url };
}
