// Final, narrow PDF image-stream optimization pass for the Collection PDF.
//
// Why this exists: the upstream fix (scripts/exportImageResize.ts) already
// makes Chromium embed every image at its correct, display-appropriate
// resolution. What's left is a pure encoding-efficiency gap: Chromium's
// page.pdf() always writes raster images as completely RAW, UNFILTERED
// /FlateDecode samples — never PNG-style filtered, never a real photo
// codec — regardless of content. That gap is a Chromium encoding
// limitation, not an upstream rendering bug, so it is fixed here, once, on
// the literal already-correct PDF.
//
// Architecture:
//   canonical rendered page
//   -> export-only DOM image right-sizing (exportImageResize.ts)
//   -> Chromium page.pdf()
//   -> this pass: narrow PDF image-encoding optimization
//   -> final downloadable PDF
//
// The encoding rule below is not a guess — it was reverse-engineered
// directly from a real Smallpdf-compressed export of this same portfolio
// (user-supplied reference, ~4.1MB, inspected object-by-object): every
// image WITHOUT its own /SMask entry got re-encoded as DCTDecode/JPEG;
// every image WITH its own /SMask entry (and that SMask object itself)
// stayed losslessly Flate-encoded, both re-filtered with a real PNG-style
// predictor rather than raw. That is a single structural fact already
// present in the PDF (does this exact image object declare its own alpha
// channel) — not a guess about photo vs. UI/diagram content, and not a
// per-project rule.
//
// What this pass does:
//   - for every raw, unfiltered /FlateDecode image stream (Chromium's own
//     output) WITH its own /SMask entry, or that IS another image's
//     /SMask companion: re-filters it with real PNG-style adaptive
//     per-row prediction (/DecodeParms /Predictor 15) and re-deflates —
//     same pixels, same dimensions, same color space, same alpha
//     semantics, purely a more efficient encoding of the same samples;
//   - for every other raw, unfiltered /FlateDecode image stream (no alpha
//     of its own, not an alpha companion): computes BOTH the same
//     lossless re-filter above AND a fixed-quality DCTDecode/JPEG
//     re-encode, and keeps whichever is genuinely smaller — this is a
//     real-size comparison of two fully-computed candidates, not a
//     statistical or content-based classifier;
//   - deduplicates PDF image OBJECTS that are byte-identical before this
//     pass runs, by repointing every reference to one survivor and
//     deleting the rest — never touches page content streams, only the
//     object graph;
//   - saves with useObjectStreams enabled, a lossless PDF object-structure
//     optimization pdf-lib already supports.
//
// It deliberately does NOT: resize anything (that's exportImageResize.ts's
// job, upstream of Chromium), rasterize pages, reconstruct project pages,
// touch ColorSpace/ICC profiles, or change what has vs. doesn't have an
// alpha channel. Every lossless candidate is decoded back and verified
// byte-for-byte identical to the source before it is ever used; every JPEG
// candidate is decoded back and dimension-checked; either candidate is
// discarded (leaving the object untouched) on any failure or if it isn't
// actually smaller than the original.
import zlib from "node:zlib";
import crypto from "node:crypto";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFDict, PDFArray, PDFRef } from "pdf-lib";

// Fixed, uniform quality applied to every JPEG-eligible image — not tuned
// per image or per "type". Matches the real Smallpdf reference this rule
// was reverse-engineered from (independently measured at ~quality 65 on
// several of its own re-encoded RGB image objects).
const JPEG_QUALITY = 70;

function readNum(dict: PDFDict, key: string): number | undefined {
  const v = dict.lookup(PDFName.of(key));
  return v instanceof PDFNumber ? v.asNumber() : undefined;
}

function readNameList(dict: PDFDict, key: string): string[] {
  const v = dict.lookup(PDFName.of(key));
  if (!v) return [];
  if (v instanceof PDFArray) return v.asArray().map((f) => String(f).replace(/^\//, ""));
  return [String(v).replace(/^\//, "")];
}

// Read-only: determines how many 8-bit samples make up one pixel from the
// existing ColorSpace entry. Never writes to ColorSpace. ICCBased profiles
// store their component count (/N) on the profile STREAM's own dict, not a
// bare dict — must be read via `.dict`, not `.lookup()` directly.
function colorSpaceChannels(context: PDFDocument["context"], dict: PDFDict): number {
  const cs = dict.lookup(PDFName.of("ColorSpace"));
  if (!cs) return 3;
  if (cs instanceof PDFArray) {
    const kind = String(cs.get(0)).replace(/^\//, "");
    if (kind === "ICCBased") {
      const profile = context.lookup(cs.get(1) as PDFRef) as unknown as { dict?: PDFDict } | PDFDict | undefined;
      const profileDict = (profile as { dict?: PDFDict } | undefined)?.dict ?? (profile as PDFDict | undefined);
      return profileDict ? (readNum(profileDict, "N") ?? 3) : 3;
    }
    return 3;
  }
  const name = String(cs).replace(/^\//, "");
  if (name === "DeviceGray" || name === "CalGray") return 1;
  if (name === "DeviceCMYK") return 4;
  return 3;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function predict(type: number, a: number, b: number, c: number): number {
  switch (type) {
    case 1: return a;
    case 2: return b;
    case 3: return (a + b) >> 1;
    case 4: return paeth(a, b, c);
    default: return 0;
  }
}

function scoreRow(row: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < row.length; i += 1) {
    const v = row[i];
    sum += v < 128 ? v : 256 - v;
  }
  return sum;
}

// Applies real PNG-style adaptive per-row filtering (types 0-4, chosen per
// row by minimum sum-of-absolute-values — the same heuristic libpng's
// default filter selection uses) to raw, unfiltered 8-bit sample data, then
// deflates the result. Pure byte-level math: it never interprets what the
// bytes mean, so it cannot misinterpret channel count, alpha, or color.
function filterAndDeflate(raw: Buffer, width: number, height: number, bpp: number): Buffer {
  const rowBytes = width * bpp;
  const filtered = Buffer.alloc(height * (rowBytes + 1));
  const candidates = [0, 1, 2, 3, 4].map(() => new Uint8Array(rowBytes));
  let prevRow: Buffer | null = null;
  for (let y = 0; y < height; y += 1) {
    const row = raw.subarray(y * rowBytes, (y + 1) * rowBytes);
    for (let type = 0; type < 5; type += 1) {
      const out = candidates[type];
      for (let i = 0; i < rowBytes; i += 1) {
        const a = i >= bpp ? row[i - bpp] : 0;
        const b = prevRow ? prevRow[i] : 0;
        const c = prevRow && i >= bpp ? prevRow[i - bpp] : 0;
        out[i] = (row[i] - predict(type, a, b, c)) & 0xff;
      }
    }
    let bestType = 0;
    let bestScore = Infinity;
    for (let type = 0; type < 5; type += 1) {
      const score = scoreRow(candidates[type]);
      if (score < bestScore) {
        bestScore = score;
        bestType = type;
      }
    }
    const offset = y * (rowBytes + 1);
    filtered[offset] = bestType;
    filtered.set(candidates[bestType], offset + 1);
    prevRow = row;
  }
  return zlib.deflateSync(filtered, { level: 9 });
}

// Inverse of filterAndDeflate — used only to verify a recompressed stream
// reproduces the exact original bytes before it's ever trusted.
function inflateAndUnfilter(deflated: Buffer, width: number, height: number, bpp: number): Buffer | null {
  const rowBytes = width * bpp;
  let inflated: Buffer;
  try {
    inflated = zlib.inflateSync(deflated);
  } catch {
    return null;
  }
  if (inflated.length !== height * (rowBytes + 1)) return null;
  const reconstructed = Buffer.alloc(height * rowBytes);
  let prevRow: Uint8Array | null = null;
  for (let y = 0; y < height; y += 1) {
    const offset = y * (rowBytes + 1);
    const filterType = inflated[offset];
    if (filterType > 4) return null;
    const filteredRow = inflated.subarray(offset + 1, offset + 1 + rowBytes);
    const row = new Uint8Array(rowBytes);
    for (let i = 0; i < rowBytes; i += 1) {
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prevRow ? prevRow[i] : 0;
      const c = prevRow && i >= bpp ? prevRow[i - bpp] : 0;
      row[i] = (filteredRow[i] + predict(filterType, a, b, c)) & 0xff;
    }
    reconstructed.set(row, y * rowBytes);
    prevRow = row;
  }
  return reconstructed;
}

function losslessCandidate(inflated: Buffer, width: number, height: number, channels: number): Buffer | null {
  const recompressed = filterAndDeflate(inflated, width, height, channels);
  const roundTrip = inflateAndUnfilter(recompressed, width, height, channels);
  if (!roundTrip || Buffer.compare(roundTrip, inflated) !== 0) return null; // never trust — verify losslessness before using
  return recompressed;
}

// JPEG has no indexed/palette ambiguity (unlike PNG), so encoding via sharp
// here carries none of the color-mode-misinterpretation risk a past
// approach hit with sharp's PNG encoder — channel count is fixed by us,
// not chosen by the encoder. Still never trusted blindly: the result is
// decoded back and its dimensions checked before use.
async function jpegCandidate(inflated: Buffer, width: number, height: number, channels: number): Promise<Buffer | null> {
  if (channels !== 1 && channels !== 3) return null; // grayscale or RGB only — no CMYK guessing
  try {
    const jpeg = await sharp(inflated, { raw: { width, height, channels } })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    const decoded = await sharp(jpeg).metadata();
    if (decoded.width !== width || decoded.height !== height) return null;
    return jpeg;
  } catch {
    return null;
  }
}

type EncodedResult = { bytes: Buffer; format: "flate-predictor" | "jpeg"; channels: number; width: number; height: number; originalBytes: number };

function isRawUnfilteredFlate(dict: PDFDict): boolean {
  const filters = readNameList(dict, "Filter");
  if (filters.length !== 1 || filters[0] !== "FlateDecode") return false;
  return !dict.has(PDFName.of("DecodeParms")) && !dict.has(PDFName.of("DP"));
}

async function encodeImageStream(
  context: PDFDocument["context"],
  dict: PDFDict,
  contents: Uint8Array,
  jpegEligible: boolean,
): Promise<EncodedResult | null> {
  if (!isRawUnfilteredFlate(dict)) return null; // only ever touch Chromium's own raw output, never something already filtered
  const bpc = readNum(dict, "BitsPerComponent");
  if (bpc !== 8) return null;
  const width = readNum(dict, "Width") ?? 0;
  const height = readNum(dict, "Height") ?? 0;
  if (!width || !height) return null;
  const channels = colorSpaceChannels(context, dict);
  const buffer = Buffer.from(contents);
  let inflated: Buffer;
  try {
    inflated = zlib.inflateSync(buffer);
  } catch {
    return null;
  }
  if (inflated.length !== width * height * channels) return null; // unexpected layout — leave untouched rather than risk it

  const lossless = losslessCandidate(inflated, width, height, channels);
  const jpeg = jpegEligible ? await jpegCandidate(inflated, width, height, channels) : null;

  let chosen: { bytes: Buffer; format: "flate-predictor" | "jpeg" } | null = null;
  if (lossless && jpeg) chosen = jpeg.length < lossless.length ? { bytes: jpeg, format: "jpeg" } : { bytes: lossless, format: "flate-predictor" };
  else if (jpeg) chosen = { bytes: jpeg, format: "jpeg" };
  else if (lossless) chosen = { bytes: lossless, format: "flate-predictor" };
  if (!chosen || chosen.bytes.length >= buffer.length) return null; // only apply when it actually helps

  return { bytes: chosen.bytes, format: chosen.format, channels, width, height, originalBytes: buffer.length };
}

// Rewrites every occurrence of `fromRef` anywhere in the document's object
// graph (page/Form Resources, nested dicts/arrays — walked generically
// rather than assuming a specific shape) to `toRef`, then removes the now
// entirely unreferenced `fromRef` object. This is how object-level
// deduplication actually saves bytes: reassigning what an object number
// points to does nothing by itself, since the old number still has to
// exist somewhere in the file as long as something references it.
function redirectAndDelete(context: PDFDocument["context"], fromRef: PDFRef, toRef: PDFRef) {
  const visited = new Set<unknown>();
  const isFromRef = (v: unknown) => v instanceof PDFRef && v.objectNumber === fromRef.objectNumber && v.generationNumber === fromRef.generationNumber;
  const walk = (value: unknown) => {
    if (!value || visited.has(value)) return;
    if (value instanceof PDFDict) {
      visited.add(value);
      for (const [key, entry] of value.entries()) {
        if (isFromRef(entry)) value.set(key, toRef);
        else walk(entry);
      }
    } else if (value instanceof PDFArray) {
      visited.add(value);
      for (let i = 0; i < value.size(); i += 1) {
        const entry = value.get(i);
        if (isFromRef(entry)) value.set(i, toRef);
        else walk(entry);
      }
    } else if (value instanceof PDFRawStream) {
      visited.add(value);
      walk(value.dict);
    }
  };
  for (const [, obj] of context.enumerateIndirectObjects()) walk(obj);
  context.delete(fromRef);
}

export type PdfStreamEncodingResult = {
  bytes: Uint8Array;
  report: {
    imageCount: number;
    recompressedCount: number;
    jpegCount: number;
    beforeTotalImageBytes: number;
    afterTotalImageBytes: number;
    duplicateObjectsRemoved: number;
  };
};

export async function optimizeCollectionPdfStreams(inputBytes: Uint8Array): Promise<PdfStreamEncodingResult> {
  const doc = await PDFDocument.load(inputBytes, { updateMetadata: false });
  const context = doc.context;

  const imageEntries = context
    .enumerateIndirectObjects()
    .filter(([, obj]) => obj instanceof PDFRawStream && readNameList(obj.dict, "Subtype")[0] === "Image") as Array<[PDFRef, PDFRawStream]>;

  // An image object counts as "alpha" — and stays lossless-only — if it
  // declares its own /SMask, OR if it IS another image's /SMask companion.
  // This is the exact structural distinction the real Smallpdf reference
  // draws; it is evaluated purely from each object's own dict, never from
  // pixel content.
  const smaskCompanionRefs = new Set<string>();
  for (const [, obj] of imageEntries) {
    const smaskRef = obj.dict.get(PDFName.of("SMask"));
    if (smaskRef instanceof PDFRef) smaskCompanionRefs.add(`${smaskRef.objectNumber} ${smaskRef.generationNumber}`);
  }

  let beforeTotalImageBytes = 0;
  let afterTotalImageBytes = 0;
  let recompressedCount = 0;
  let jpegCount = 0;
  // original-content hash -> the ref chosen as the surviving canonical copy
  const canonicalByHash = new Map<string, PDFRef>();

  for (const [ref, obj] of imageEntries) {
    const contents = obj.getContents();
    beforeTotalImageBytes += contents.length;
    const hash = crypto.createHash("sha256").update(contents).digest("hex");

    const existingCanonical = canonicalByHash.get(hash);
    if (existingCanonical) {
      // Byte-identical source image already handled under an earlier ref —
      // repoint every reference to this one to that ref and drop this
      // object entirely, rather than recompressing (and keeping) a
      // redundant copy.
      redirectAndDelete(context, ref, existingCanonical);
      continue;
    }
    canonicalByHash.set(hash, ref);

    const dict = obj.dict;
    const key = `${ref.objectNumber} ${ref.generationNumber}`;
    const hasOwnAlpha = dict.has(PDFName.of("SMask"));
    const isAlphaCompanion = smaskCompanionRefs.has(key);
    const jpegEligible = !hasOwnAlpha && !isAlphaCompanion;

    const result = await encodeImageStream(context, dict, contents, jpegEligible);
    if (!result) {
      afterTotalImageBytes += contents.length;
      continue;
    }

    if (result.format === "flate-predictor") {
      dict.set(
        PDFName.of("DecodeParms"),
        context.obj({ Predictor: 15, Colors: result.channels, BitsPerComponent: 8, Columns: result.width }),
      );
    } else {
      dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
      dict.delete(PDFName.of("DecodeParms"));
      jpegCount += 1;
    }
    const newStream = PDFRawStream.of(dict, result.bytes);
    context.assign(ref, newStream);
    recompressedCount += 1;
    afterTotalImageBytes += result.bytes.length;
  }

  const duplicateObjectsRemoved = imageEntries.length - canonicalByHash.size;
  const bytes = await doc.save({ useObjectStreams: true });
  return {
    bytes,
    report: {
      imageCount: imageEntries.length,
      recompressedCount,
      jpegCount,
      beforeTotalImageBytes,
      afterTotalImageBytes,
      duplicateObjectsRemoved,
    },
  };
}
