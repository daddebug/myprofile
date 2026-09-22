import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const url = process.argv[2] || "http://127.0.0.1:4173/zh";
const outputDir = path.resolve("tmp/home-substrate-audit");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

async function runScenario(name, scriptDelayMs) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: 750_000,
    uploadThroughput: 750_000,
  });
  if (scriptDelayMs !== null) {
    await page.route(/\/assets\/.*\.js$/, async (route) => {
      if (scriptDelayMs < 0) await route.abort();
      else {
        await new Promise((resolve) => setTimeout(resolve, scriptDelayMs));
        await route.continue();
      }
    });
  }
  if (name === "stylesheet-blocked") {
    await page.route(/\/assets\/.*\.css$/, (route) => route.abort());
  }
  await page.goto(url, { waitUntil: "commit" });
  await page.waitForTimeout(1000);
  const before = await page.evaluate(() => {
    const selectors = ["html", "body", "#root", ".ambient-public-shell", ".ambient-light-background", ".home-v2", ".home-fixed-layer", ".home-project-canvas", ".home-project-canvas canvas", ".home-scroll-container", ".home-v2__content-stage", ".home-project-card__surface", ".home-intro-overlay"];
    return {
      url: location.href,
      readyState: document.readyState,
      layers: selectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) return { selector, present: false };
        const css = getComputedStyle(element);
        return { selector, present: true, background: css.backgroundColor, backgroundImage: css.backgroundImage, opacity: css.opacity, display: css.display };
      }),
    };
  });
  await page.screenshot({ path: path.join(outputDir, `${name}-before.png`) });
  let after = null;
  if (scriptDelayMs >= 0) {
    await page.waitForTimeout(scriptDelayMs + 2500);
    after = await page.evaluate(() => {
      const selectors = ["html", "body", "#root", ".ambient-public-shell", ".ambient-light-background", ".home-v2", ".home-fixed-layer", ".home-project-canvas", ".home-project-canvas canvas", ".home-scroll-container", ".home-v2__content-stage", ".home-project-card__surface", ".home-intro-overlay"];
      return selectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) return { selector, present: false };
        const css = getComputedStyle(element);
        return { selector, present: true, background: css.backgroundColor, backgroundImage: css.backgroundImage, opacity: css.opacity };
      });
    });
    await page.screenshot({ path: path.join(outputDir, `${name}-after.png`) });
  }
  await context.close();
  return { name, before, after };
}

const scenarios = [
  await runScenario("stylesheet-blocked", -1),
  await runScenario("javascript-blocked", -1),
  await runScenario("javascript-delayed", 4000),
  await runScenario("normal", null),
];
await browser.close();
await writeFile(path.join(outputDir, "report.json"), JSON.stringify(scenarios, null, 2));
console.log(JSON.stringify(scenarios, null, 2));
