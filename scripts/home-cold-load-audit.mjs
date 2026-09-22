import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const auditUrl = process.argv[2] || "http://localhost:5173/zh";
const runLabel = process.argv[3] || "current";
const outputDir = path.resolve("tmp/home-cold-load-audit", new URL(auditUrl).port || "default", runLabel);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
await page.addInitScript(() => {
  const events = {};
  const longTasks = [];
  window.__homeColdTimeline = { events, longTasks };
  const mark = (name) => { if (events[name] === undefined) events[name] = Math.round(performance.now()); };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push({ startMs: Math.round(entry.startTime), durationMs: Math.round(entry.duration) });
    }).observe({ type: "longtask", buffered: true });
  } catch { /* Long Task API is optional. */ }
  const timer = setInterval(() => {
    if (getComputedStyle(document.documentElement).backgroundColor === "rgb(247, 246, 237)") mark("creamSubstrateReady");
    const hero = document.querySelector(".home-v2__name");
    if (hero) mark("heroHtmlMounted");
    if (hero && !document.querySelector(".home-intro-overlay") && Number(getComputedStyle(hero.closest("main")).opacity) > 0.95) mark("heroTextReadable");
    const images = [...document.querySelectorAll(".home-project-card img")];
    if (images[0]?.complete && images[0].naturalWidth) mark("firstCoverDecoded");
    if (images.slice(0, 3).length === 3 && images.slice(0, 3).every((image) => image.complete && image.naturalWidth)) mark("firstThreeCoversDecoded");
    if (images[0] && getComputedStyle(images[0]).opacity === "0") mark("webglFirstCoverTakeover");
    if (document.querySelector(".home-contour-background canvas")) mark("topolinesMounted");
    if (["heroTextReadable", "firstCoverDecoded", "firstThreeCoversDecoded", "webglFirstCoverTakeover", "topolinesMounted"].every((name) => events[name] !== undefined)) {
      mark("visuallyComplete");
      clearInterval(timer);
    }
  }, 40);
});
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 120,
  downloadThroughput: 1_000_000,
  uploadThroughput: 1_000_000,
});
await cdp.send("Page.enable");

const errors = [];
const requests = [];
const firstCoverRequests = [];
cdp.on("Network.requestWillBeSent", (event) => {
  if (!/project-1ua2677-w(?:640|1280|1920)\.webp/.test(event.request.url)) return;
  firstCoverRequests.push({
    url: event.request.url,
    initiatorType: event.initiator.type,
    initiatorUrl: event.initiator.url ?? null,
    stack: event.initiator.stack?.callFrames.slice(0, 3).map((frame) => `${frame.functionName}@${frame.url}`) ?? [],
  });
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (/\.(png|jpe?g|webp|avif|svg)(?:\?|$)/i.test(request.url())) requests.push(request.url());
});

const frames = [];
let start = 0;
let lastSavedAt = -100;
const pendingWrites = [];
cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
  const elapsedMs = Date.now() - start;
  if (start && elapsedMs <= 20000 && elapsedMs - lastSavedAt >= 90) {
    lastSavedAt = elapsedMs;
    const filename = `frame-${String(elapsedMs).padStart(4, "0")}.jpg`;
    frames.push({ elapsedMs, filename });
    pendingWrites.push(writeFile(path.join(outputDir, filename), Buffer.from(data, "base64")));
  }
  void cdp.send("Page.screencastFrameAck", { sessionId });
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, everyNthFrame: 1 });
start = Date.now();
const navigation = page.goto(auditUrl, { waitUntil: "commit" });
await Promise.all([navigation, new Promise((resolve) => setTimeout(resolve, 20000))]);
await cdp.send("Page.stopScreencast");
await Promise.all(pendingWrites);

const state = await page.evaluate(() => {
  const cover = document.querySelector(".home-project-card img");
  return {
    readyState: document.readyState,
    html: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
    home: document.querySelector(".home-v2")
      ? getComputedStyle(document.querySelector(".home-v2")).backgroundColor : null,
    cover: cover?.currentSrc ?? null,
    coverVisible: cover ? getComputedStyle(cover).opacity : null,
  };
});

const performanceData = await page.evaluate(() => ({
  timeline: window.__homeColdTimeline,
  paint: performance.getEntriesByType("paint").map((entry) => ({ name: entry.name, startMs: Math.round(entry.startTime) })),
  resources: performance.getEntriesByType("resource")
    .filter((entry) => /\.(png|jpe?g|webp|avif|svg|js|css)(?:\?|$)/i.test(entry.name))
    .map((entry) => ({ url: entry.name, initiatorType: entry.initiatorType, startMs: Math.round(entry.startTime), responseEndMs: Math.round(entry.responseEnd), transferBytes: entry.transferSize })),
}));
await page.mouse.wheel(0, 720);
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(outputDir, "first-cover-after-scroll.png") });
const firstCover = await page.evaluate(() => {
  const card = document.querySelector(".home-project-card");
  const image = card?.querySelector("img");
  const rect = card?.getBoundingClientRect();
  return {
    cardVisible: Boolean(rect && rect.bottom > 0 && rect.top < innerHeight),
    imageLoaded: Boolean(image?.complete && image.naturalWidth),
    imageOpacity: image ? getComputedStyle(image).opacity : null,
    canvasPresent: Boolean(document.querySelector("canvas")),
  };
});
await context.close();
await browser.close();
const report = { frames, url: auditUrl, state, firstCover, firstCoverRequests, requestedImages: requests, ...performanceData, errors };
await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
