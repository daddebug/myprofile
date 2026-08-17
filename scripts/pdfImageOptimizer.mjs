// ============================================================================
// EXPERIMENTAL / UNUSED — NOT PART OF THE LIVE EXPORT PIPELINE.
// ============================================================================
// This file is not imported by scripts/exactWebExportPlugin.ts or
// scripts/portfolioCollectionExportPlugin.ts, and nothing calls it in a real
// export. It was an exploratory approach (rewrite an already-generated PDF's
// image XObjects after the fact) that was superseded by fixing the actual
// root cause upstream: scripts/exportImageResize.ts now right-sizes oversized
// images inside the disposable Playwright capture page, before Chromium ever
// calls page.pdf(), so the generated PDF is efficient from the start and
// never needs this kind of post-hoc repair. See the "Fix upstream root
// causes, not downstream symptoms" rule in CLAUDE.md.
//
// Kept only for reference — it also documents a real, confirmed sharp bug
// (sharp's .png() encoder silently switches to indexed/palette output for
// low-color-count images, which corrupts an image if the caller assumes a
// fixed truecolor byte layout, as this file originally did before that was
// fixed). Do not wire this into the live pipeline; do not build on it further.
// ============================================================================
//
// Post-processing size-optimization pass for an already-generated,
// canonical Collection PDF. Operates ONLY on the PDF's own image XObjects
// (recompress/resize/dedupe) and never touches page content streams,
// fonts, or annotations — it cannot "reconstruct" a project page because
// it never looks at anything but already-embedded image resources.
//
// Root cause this addresses (see the real audit): Chromium's page.pdf()
// never preserves a source image's original JPEG encoding — every raster
// image gets flattened to raw, undifferentiated FlateDecode sample data
// (i.e. deflate-compressed raw pixels, not a real image codec). That
// alone is why a handful of screenshots/photos costs tens of megabytes.
// Most are also embedded at their full native/source resolution
// regardless of how small they're actually displayed on the page.
//
// This module: for every FlateDecode (or already-DCTDecode) image object,
// (1) decodes it to raw pixels, (2) downsamples only if its embedded
// resolution is meaningfully higher than what its real on-page CSS
// display size needs (via an optional domSizeMap keyed by "widthxheight"
// -> displayed CSS width, built by measureProjectImages.mjs), (3)
// re-encodes with a type-aware policy (alpha -> PNG/Flate lossless;
// opaque -> JPEG at a quality tuned by a lightweight photo-vs-graphic
// heuristic), then (4) writes the new bytes back into the SAME PDF object
// (same ref, so every page/resource dict that already pointed at it keeps
// working unchanged) — plus de-duplicates identical source images so
// repeated content is only recompressed once.
import zlib from "node:zlib";
import crypto from "node:crypto";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFDict, PDFRef, PDFArray } from "pdf-lib";

// A PDF FlateDecode image stream stores only raw, unfiltered sample bytes
// — plain zlib.deflateSync() on those bytes reproduces roughly the same
// size Chromium's own naive embedding already used (no improvement at
// all). PNG gets its real compression advantage from per-row prediction
// filtering *before* deflating. PDF's FlateDecode filter supports the
// exact same thing via /DecodeParms /Predictor 15 ("PNG optimum", adaptive
// per row) — so rather than reimplementing PNG's adaptive filter
// selection, this pulls the already-filtered, already-deflated IDAT
// payload straight out of sharp's own PNG encoder output and embeds that
// verbatim, with the matching Predictor DecodeParms telling any PDF
// reader how to reverse it. Real, standard PDF/PNG mechanism — not a
// hack.
function extractPngIdat(pngBuffer) {
  const chunks = [];
  let offset = 8; // past the 8-byte PNG signature
  while (offset < pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === "IDAT") chunks.push(pngBuffer.subarray(dataStart, dataStart + length));
    offset = dataStart + length + 4; // skip CRC
  }
  return Buffer.concat(chunks);
}

const RETINA_FACTOR = 2; // safe headroom above 1x CSS pixels for crisp screens
const MEANINGFUL_OVERSIZE_RATIO = 1.2; // only downsample if >20% over target
const OPAQUE_JPEG_QUALITY = 90; // see classifyAndEncode: a photo/UI auto-classifier was tested and found unreliable on this document's real content
const ALPHA_JPEG_QUALITY = 94; // higher than opaque color — soft alpha-matte edges show banding more readily than color detail does
const LOSSLESS_PREFERENCE_MARGIN = 1.15; // only take the lossy JPEG when it's meaningfully (>~13%) smaller than a real lossless recompression

function readName(dict, key) {
  const v = dict.lookup(PDFName.of(key));
  return v ? String(v).replace(/^\//, "") : undefined;
}
function readNum(dict, key) {
  const v = dict.lookup(PDFName.of(key));
  return v instanceof PDFNumber ? v.asNumber() : undefined;
}

function colorSpaceChannels(context, dict) {
  const cs = dict.lookup(PDFName.of("ColorSpace"));
  if (!cs) return 3;
  if (cs instanceof PDFArray) {
    const kind = String(cs.get(0)).replace(/^\//, "");
    if (kind === "ICCBased") {
      // The ICCBased colorspace's second array element points at a STREAM
      // (the ICC profile bytes) whose own dict carries /N — not a bare
      // dict, so it must be read via `.dict`, not `.lookup()` directly.
      const profile = context.lookup(cs.get(1));
      const profileDict = profile?.dict ?? profile;
      return profileDict ? (readNum(profileDict, "N") ?? 3) : 3;
    }
    return 3;
  }
  const name = String(cs).replace(/^\//, "");
  if (name === "DeviceGray" || name === "CalGray") return 1;
  if (name === "DeviceCMYK") return 4;
  return 3;
}

// Decodes a PDF image XObject's own stream to a plain sharp-consumable
// {data, width, height, channels} raw-pixel buffer, branching on its
// actual Filter — never assumes a format the object doesn't declare.
async function decodeImageObject(context, obj) {
  const dict = obj.dict;
  const width = readNum(dict, "Width") ?? 0;
  const height = readNum(dict, "Height") ?? 0;
  const bpc = readNum(dict, "BitsPerComponent") ?? 8;
  const filterRaw = dict.lookup(PDFName.of("Filter"));
  const filter = Array.isArray(filterRaw?.asArray?.())
    ? filterRaw.asArray().map((f) => String(f).replace(/^\//, ""))
    : filterRaw
      ? [String(filterRaw).replace(/^\//, "")]
      : [];
  const contents = obj.getContents();

  if (filter.includes("DCTDecode")) {
    // Already a real JPEG — sharp decodes it directly, no manual inflate.
    const img = sharp(Buffer.from(contents));
    const raw = await img.raw().toBuffer({ resolveWithObject: true });
    return { data: raw.data, width: raw.info.width, height: raw.info.height, channels: raw.info.channels, originalFilter: "DCTDecode" };
  }
  if (filter.length === 0 || filter.includes("FlateDecode")) {
    const channels = colorSpaceChannels(context, dict);
    if (bpc !== 8) return null; // don't touch non-8bpc raw samples — rare, not worth the risk here
    const inflated = filter.includes("FlateDecode") ? zlib.inflateSync(Buffer.from(contents)) : Buffer.from(contents);
    const expected = width * height * channels;
    if (inflated.length !== expected) return null; // guard: unexpected layout, leave this object untouched
    return { data: inflated, width, height, channels, originalFilter: filter.join(",") || "raw" };
  }
  return null; // JPXDecode / CCITTFax / LZW / etc. — not produced by this pipeline; leave untouched rather than risk it
}

async function decodeSMask(context, smaskRef) {
  if (!smaskRef) return null;
  const smaskObj = context.lookup(smaskRef);
  if (!(smaskObj instanceof PDFRawStream)) return null;
  return decodeImageObject(context, smaskObj);
}

async function classifyAndEncode({ data, width, height, channels }, alpha, targetWidth) {
  const base = sharp(data, { raw: { width, height, channels } });
  const needsResize = targetWidth && targetWidth < width / MEANINGFUL_OVERSIZE_RATIO;
  const resized = needsResize ? base.resize({ width: targetWidth, withoutEnlargement: true }) : base;

  if (alpha) {
    // JPEG has no alpha channel of its own, but PDF's /SMask can itself be
    // a DCTDecode (JPEG) grayscale stream — so both the color layer AND
    // the alpha matte are still JPEG-encoded (at a slightly higher quality
    // than opaque color, since a soft alpha edge is more sensitive to
    // banding than color detail is), instead of falling back to lossless
    // Flate for the whole thing. This was the single largest remaining
    // contributor after the first pass (alpha images kept as raw-Flate
    // were ~5-10x bigger than their JPEG-encoded opaque counterparts of
    // similar pixel count).
    const rgba = await resized.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixelCount = rgba.info.width * rgba.info.height;
    const rgb = Buffer.alloc(pixelCount * 3);
    const a = Buffer.alloc(pixelCount);
    for (let i = 0; i < pixelCount; i += 1) {
      rgb[i * 3] = rgba.data[i * 4];
      rgb[i * 3 + 1] = rgba.data[i * 4 + 1];
      rgb[i * 3 + 2] = rgba.data[i * 4 + 2];
      a[i] = rgba.data[i * 4 + 3];
    }
    const colorJpeg = await sharp(rgb, { raw: { width: rgba.info.width, height: rgba.info.height, channels: 3 } })
      .jpeg({ quality: OPAQUE_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    const alphaJpeg = await sharp(a, { raw: { width: rgba.info.width, height: rgba.info.height, channels: 1 } })
      .jpeg({ quality: ALPHA_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    return {
      method: `resize+jpeg(rgb=q${OPAQUE_JPEG_QUALITY},smask=q${ALPHA_JPEG_QUALITY})`,
      color: { jpeg: colorJpeg, width: rgba.info.width, height: rgba.info.height },
      alpha: { jpeg: alphaJpeg, width: rgba.info.width, height: rgba.info.height },
    };
  }

  // A "photo vs. UI/diagram" auto-classifier was tested here (edge-density
  // and near-white-pixel-ratio heuristics against real images from this
  // exact document) and found unreliable: a low-poly game-render screenshot
  // scored HIGHER on edge-energy than a real text-heavy UI screenshot, and
  // near-white-pixel ratio didn't separate a dark UI mockup from a dark 3D
  // scene either. Instead of guessing content "type" from statistics, let
  // actual compressibility decide: compute both a lossless re-compression
  // and a high-quality JPEG, and only take the lossy result when it's
  // meaningfully smaller. Flat/gradient/vector-style graphics (e.g. this
  // pipeline's own cover-page screenshot) genuinely compress *better*
  // losslessly and show visible banding/color shift under JPEG's chroma
  // subsampling — verified directly on the real cover image, which grew
  // visible gradient artifacts under a uniform JPEG pass and disappeared
  // once this comparison was added. Real photos/renders are large
  // losslessly and shrink dramatically under JPEG, so they still end up
  // lossy exactly as intended.
  const rgb = await resized.removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const rawArgs = { raw: { width: rgb.info.width, height: rgb.info.height, channels: 3 } };
  const [lossless, jpeg] = await Promise.all([
    // palette:false is required — sharp auto-selects indexed/palette PNG
    // output for low-color-count images (common for flat UI screenshots),
    // whose IDAT payload is 1 byte/pixel (a palette index) plus a separate
    // PLTE chunk, not the 3-bytes/pixel truecolor layout extractPngIdat's
    // caller declares via /DecodeParms /Colors 3 below. Embedding a
    // palette IDAT under a truecolor DecodeParms produced a corrupted
    // image (readers ran out of real data 3x early, leaving the rest of
    // the image blank) — found via direct before/after visual comparison.
    sharp(rgb.data, rawArgs).png({ compressionLevel: 9, effort: 10, palette: false }).toBuffer(),
    sharp(rgb.data, rawArgs).jpeg({ quality: OPAQUE_JPEG_QUALITY, mozjpeg: true }).toBuffer(),
  ]);
  const useLossless = lossless.length <= jpeg.length * LOSSLESS_PREFERENCE_MARGIN;
  return {
    method: useLossless ? "resize+flate(lossless,predictor)" : `resize+jpeg(q${OPAQUE_JPEG_QUALITY})`,
    format: useLossless ? "flate-predictor" : "jpeg",
    bytes: useLossless ? extractPngIdat(lossless) : jpeg,
    width: rgb.info.width,
    height: rgb.info.height,
  };
}

function buildJpegImageDict(context, width, height) {
  const dict = context.obj({
    Type: "XObject",
    Subtype: "Image",
    Width: width,
    Height: height,
    ColorSpace: "DeviceRGB",
    BitsPerComponent: 8,
    Filter: "DCTDecode",
  });
  return dict;
}

function buildJpegSMaskDict(context, width, height) {
  return context.obj({
    Type: "XObject",
    Subtype: "Image",
    Width: width,
    Height: height,
    ColorSpace: "DeviceGray",
    BitsPerComponent: 8,
    Filter: "DCTDecode",
  });
}

// Standard PDF mechanism for embedding PNG-equivalent compression inside a
// plain FlateDecode image stream — see extractPngIdat's comment above.
function buildPredictorFlateImageDict(context, width, height) {
  return context.obj({
    Type: "XObject",
    Subtype: "Image",
    Width: width,
    Height: height,
    ColorSpace: "DeviceRGB",
    BitsPerComponent: 8,
    Filter: "FlateDecode",
    DecodeParms: { Predictor: 15, Colors: 3, BitsPerComponent: 8, Columns: width },
  });
}

export async function optimizeCollectionPdf(inputBytes, options = {}) {
  const { domSizeMap = new Map(), onProgress } = options;
  const doc = await PDFDocument.load(inputBytes, { updateMetadata: false });
  const context = doc.context;

  const objects = context.enumerateIndirectObjects();
  const imageEntries = objects.filter(([, obj]) => obj instanceof PDFRawStream && readName(obj.dict, "Subtype") === "Image");
  const smaskRefs = new Set(
    imageEntries
      .map(([, obj]) => obj.dict.get(PDFName.of("SMask")))
      .filter((ref) => ref instanceof PDFRef)
      .map((ref) => `${ref.objectNumber} ${ref.generationNumber}`),
  );

  const beforeTotalImageBytes = imageEntries.reduce((sum, [, obj]) => sum + obj.getContents().length, 0);
  const cache = new Map(); // original content sha256 -> { dict, contents } already computed
  const results = [];
  let processed = 0;

  for (const [ref, obj] of imageEntries) {
    const key = `${ref.objectNumber} ${ref.generationNumber}`;
    if (smaskRefs.has(key)) continue; // SMask objects are handled as part of their owning color image, never standalone
    const dict = obj.dict;
    const contents = obj.getContents();
    const beforeBytes = contents.length;
    const hash = crypto.createHash("sha256").update(contents).digest("hex");

    if (cache.has(hash)) {
      const cached = cache.get(hash);
      context.assign(ref, cached.stream);
      if (cached.smaskRef) dict.set(PDFName.of("SMask"), cached.smaskRef);
      results.push({ objNum: ref.objectNumber, beforeBytes, afterBytes: cached.afterBytes, method: `${cached.method} (deduped)`, skipped: false });
      processed += 1;
      onProgress?.(processed, imageEntries.length);
      continue;
    }

    try {
      const decoded = await decodeImageObject(context, obj);
      if (!decoded) {
        results.push({ objNum: ref.objectNumber, beforeBytes, afterBytes: beforeBytes, method: "skipped (unsupported filter/layout)", skipped: true });
        processed += 1;
        onProgress?.(processed, imageEntries.length);
        continue;
      }
      const smaskRefRaw = dict.get(PDFName.of("SMask"));
      const smaskDecoded = smaskRefRaw instanceof PDFRef ? await decodeSMask(context, smaskRefRaw) : null;
      const hasAlpha = Boolean(smaskDecoded);

      const domKey = `${decoded.width}x${decoded.height}`;
      const domCssWidth = domSizeMap.get(domKey);
      const targetWidth = domCssWidth ? Math.round(domCssWidth * RETINA_FACTOR) : undefined;

      let combined = decoded;
      if (hasAlpha && smaskDecoded) {
        // Merge color + alpha into one RGBA raw buffer for a single resize pass.
        const rgbaBuf = Buffer.alloc(decoded.width * decoded.height * 4);
        for (let i = 0; i < decoded.width * decoded.height; i += 1) {
          rgbaBuf[i * 4] = decoded.data[i * decoded.channels];
          rgbaBuf[i * 4 + 1] = decoded.data[i * decoded.channels + (decoded.channels > 1 ? 1 : 0)];
          rgbaBuf[i * 4 + 2] = decoded.data[i * decoded.channels + (decoded.channels > 2 ? 2 : 0)];
          rgbaBuf[i * 4 + 3] = smaskDecoded.data[i * smaskDecoded.channels] ?? 255;
        }
        combined = { data: rgbaBuf, width: decoded.width, height: decoded.height, channels: 4 };
      }

      const encoded = await classifyAndEncode(combined, hasAlpha, targetWidth);
      let afterBytes;
      let newRef = ref;
      let newSmaskRef;

      if (hasAlpha) {
        newSmaskRef = context.register(PDFRawStream.of(buildJpegSMaskDict(context, encoded.alpha.width, encoded.alpha.height), encoded.alpha.jpeg));
        const newDict = buildJpegImageDict(context, encoded.color.width, encoded.color.height);
        newDict.set(PDFName.of("SMask"), newSmaskRef);
        const newStream = PDFRawStream.of(newDict, encoded.color.jpeg);
        context.assign(ref, newStream);
        afterBytes = encoded.color.jpeg.length + encoded.alpha.jpeg.length;
        cache.set(hash, { stream: newStream, smaskRef: newSmaskRef, afterBytes, method: encoded.method });
      } else {
        const newDict = encoded.format === "jpeg"
          ? buildJpegImageDict(context, encoded.width, encoded.height)
          : buildPredictorFlateImageDict(context, encoded.width, encoded.height);
        const newStream = PDFRawStream.of(newDict, encoded.bytes);
        context.assign(ref, newStream);
        dict.delete(PDFName.of("SMask"));
        afterBytes = encoded.bytes.length;
        cache.set(hash, { stream: newStream, smaskRef: undefined, afterBytes, method: encoded.method });
      }

      results.push({ objNum: ref.objectNumber, beforeBytes, afterBytes, method: encoded.method, skipped: false, matchedDisplaySize: Boolean(domCssWidth) });
    } catch (error) {
      results.push({ objNum: ref.objectNumber, beforeBytes, afterBytes: beforeBytes, method: `skipped (error: ${error.message})`, skipped: true });
    }
    processed += 1;
    onProgress?.(processed, imageEntries.length);
  }

  const bytes = await doc.save({ useObjectStreams: true });
  const afterTotalImageBytes = results.reduce((sum, r) => sum + r.afterBytes, 0);
  return {
    bytes,
    report: {
      imageCount: imageEntries.length - smaskRefs.size,
      beforeTotalImageBytes,
      afterTotalImageBytes,
      results,
    },
  };
}
