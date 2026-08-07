import { PDFDocument } from "pdf-lib";
import fs from "node:fs/promises";

const inputPath = process.argv[2];
const bytes = await fs.readFile(inputPath);
const doc = await PDFDocument.load(bytes);
for (let i = 0; i < doc.getPageCount(); i++) {
  const single = await PDFDocument.create();
  const [page] = await single.copyPages(doc, [i]);
  single.addPage(page);
  const singleBytes = await single.save({ useObjectStreams: false });
  const { width, height } = page.getSize();
  console.log(`page ${i + 1}: ${Math.round(singleBytes.byteLength / 1024)} KB, size ${Math.round(width)}x${Math.round(height)}pt`);
}
