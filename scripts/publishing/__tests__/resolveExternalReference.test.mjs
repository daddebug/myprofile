import assert from "node:assert/strict";
import { resolveExternalReference, validateExternalReferenceUrl } from "../resolveExternalReference.mjs";

// 7. valid external URL -> RESOLVED
{
  const result = resolveExternalReference({ url: "https://www.figma.com/design/abc123" }, "changed");
  assert.equal(result.status, "RESOLVED");
  assert.equal(result.url, "https://www.figma.com/design/abc123");
}
console.log("7. valid external URL -> RESOLVED, passed");

// 8. invalid changed external URL -> BLOCKED
{
  const notHttps = resolveExternalReference({ url: "http://example.com/insecure" }, "changed");
  assert.equal(notHttps.status, "BLOCKED");
  assert.match(notHttps.reason, /HTTPS/);

  const localhost = resolveExternalReference({ url: "https://localhost:5173/preview" }, "changed");
  assert.equal(localhost.status, "BLOCKED");
  assert.match(localhost.reason, /local/i);

  const empty = resolveExternalReference({ url: "" }, "changed");
  assert.equal(empty.status, "BLOCKED");
}
console.log("8. invalid changed external URL -> BLOCKED (http, localhost, empty), passed");

// An inherited reference is validated with the exact same rule -- no special
// trust just because it's unchanged (unlike single-file assets, there is no
// disk-fallback candidate to gate for a URL, so referenceIntent doesn't
// change the outcome).
{
  const inherited = resolveExternalReference({ url: "https://www.figma.com/design/abc123" }, "inherited");
  assert.equal(inherited.status, "RESOLVED");
  const inheritedInvalid = resolveExternalReference({ url: "http://example.com/insecure" }, "inherited");
  assert.equal(inheritedInvalid.status, "BLOCKED", "an invalid URL must BLOCK even if referenceIntent is inherited");
}
console.log("inherited external references validated identically to changed ones, passed");

{
  assert.equal(validateExternalReferenceUrl("https://example.com").valid, true);
  assert.equal(validateExternalReferenceUrl("https://example.com\\..\\temp\\x").valid, false);
  assert.equal(validateExternalReferenceUrl(undefined).valid, false);
}
console.log("validateExternalReferenceUrl direct unit checks passed");

console.log("resolveExternalReference.mjs coverage tests passed");
