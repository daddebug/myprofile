// Shared "is this actually a real, intact image file" check, used
// identically wherever a byte payload is about to become (or already is) a
// published image on disk: fresh bundle blobs before they are ever written,
// and existing disk files before they are trusted as an already-published
// disk fallback. Decode failures, empty payloads, near-empty payloads, and
// payloads that don't match any known image file signature are all rejected
// the same way -- a plausible-looking id, reference, or declared MIME type is
// never accepted as proof of real content.
//
// Root cause this exists for (2026-08-17): a real browser export produced
// ~3-byte (`AAAA` -> 3 null bytes) base64 for 35 images across the
// game-experience-covers and ui-practice-images adapters. Every existing
// check (reference resolution, byte-size metadata, the dry-run diff) only
// asked "is there a reference / a byte count," never "do the decoded bytes
// look like a real image," so the corrupted bundle sailed through preflight
// and the dry-run report and was about to overwrite 70 real published files
// with 3 bytes on --confirm.
//
// Validity rests ENTIRELY on the decoded bytes matching a real, recognized
// image file signature -- never on the declared/expected MIME type or file
// extension agreeing with it. A live re-diagnosis of the same incident (same
// day) found dozens of real, currently-published, non-corrupted files whose
// extension disagrees with their actual encoded format (`.jpg`-named files
// that are really WEBP, from an earlier compression pass that kept the
// original extension for stable referencing) -- re-fetching those same files
// through the exporter's normal disk-fallback path reproduces that "mismatch"
// on every single legitimate republish. Treating that as corruption would
// block essentially all real game-cover/template-image publishes, drowning
// the one signal that actually matters (no recognizable image data at all)
// in noise from an unrelated, harmless, pre-existing naming quirk.
const IMAGE_SIGNATURES = [
  { mime: "image/png", check: (bytes) => bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a },
  { mime: "image/jpeg", check: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { mime: "image/webp", check: (bytes) => bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" },
  { mime: "image/gif", check: (bytes) => bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6)) },
  { mime: "image/avif", check: (bytes) => bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis", "mif1", "msf1"].includes(bytes.toString("ascii", 8, 12)) },
  { mime: "image/svg+xml", check: (bytes) => /^\s*(<\?xml|<svg)/i.test(bytes.subarray(0, Math.min(bytes.length, 256)).toString("utf8")) },
];

const MIME_ALIASES = { "image/jpg": "image/jpeg" };

// A secondary, redundant floor -- never the primary signal. The smallest of
// the signatures above (WEBP/AVIF headers) needs 12 bytes just to be
// checkable at all; nothing recognizable as a real photo/screenshot exists
// below this either way, but the signature check above is what actually
// decides validity, not this number.
export const MIN_PLAUSIBLE_IMAGE_BYTES = 12;

function normalizeMime(mime) {
  const lower = String(mime || "").toLowerCase().split(";")[0].trim();
  return MIME_ALIASES[lower] || lower;
}

export function detectImageSignature(bytes) {
  if (!bytes || !bytes.length) return null;
  for (const signature of IMAGE_SIGNATURES) {
    if (signature.check(bytes)) return signature.mime;
  }
  return null;
}

// Source adapters whose bundle/disk payloads are always images and must
// therefore pass signature validation. Every other registered adapter
// (playable-game-builds' html/js/wasm files, external-embeds URLs, etc.) is
// out of scope for this specific check.
const IMAGE_SOURCE_ADAPTER_IDS = new Set([
  "project-covers-indexeddb",
  "project-covers-disk",
  "project-body-indexeddb-assets",
  "game-experience-covers",
  "dynamic-template-images",
  "ui-practice-images",
  "playable-game-covers",
]);

export function isImageSourceAdapter(adapterId) {
  return IMAGE_SOURCE_ADAPTER_IDS.has(adapterId);
}

// declaredMime is only ever used to report a mismatch (informational,
// mimeMismatch: true) -- it never affects validity. See the module comment
// above for why: a naming/labeling disagreement is not corruption.
export function validateImageBytes(bytes, declaredMime) {
  if (!bytes || bytes.length === 0) return { valid: false, reason: "Decoded asset is empty (0 bytes)." };
  if (bytes.length < MIN_PLAUSIBLE_IMAGE_BYTES) return { valid: false, reason: `Decoded asset is only ${bytes.length} byte(s) -- far below any real image file.` };
  const detectedMime = detectImageSignature(bytes);
  if (!detectedMime) return { valid: false, reason: "Decoded bytes do not match any recognized image file signature (PNG/JPEG/WEBP/GIF/AVIF/SVG)." };
  const normalizedDeclared = declaredMime ? normalizeMime(declaredMime) : null;
  const mimeMismatch = Boolean(normalizedDeclared && normalizedDeclared !== detectedMime);
  return { valid: true, detectedMime, byteSize: bytes.length, mimeMismatch };
}
