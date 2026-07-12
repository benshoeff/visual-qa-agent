import { chromium, firefox, webkit, Browser, BrowserType, Page, ConsoleMessage } from "playwright";
import { injectAxe, getAxeResults } from "axe-playwright";
import { A11yAnalysisResult } from "./a11y/index.js";
import { BASELINES_DIR } from "./config.js";
import path from "path";

export function a11yBaselinePath(name: string): string {
  return path.join(BASELINES_DIR, `${name}.a11y.json`);
}

export interface ViewportConfig {
  width: number;
  height: number;
}

export interface BrowserProject {
  name: string;
  browser: "chromium" | "firefox" | "webkit";
  viewport: ViewportConfig;
  deviceScaleFactor?: number;
  isMobile?: boolean;
  userAgent?: string;
  locale?: string;
  timezoneId?: string;
}

export const DEFAULT_BROWSER_PROJECTS: BrowserProject[] = [
  { name: "chromium-desktop", browser: "chromium", viewport: { width: 1280, height: 720 } },
  { name: "firefox-desktop", browser: "firefox", viewport: { width: 1280, height: 720 } },
  { name: "webkit-desktop", browser: "webkit", viewport: { width: 1280, height: 720 } },
  { name: "chromium-mobile", browser: "chromium", viewport: { width: 375, height: 667 }, isMobile: true, deviceScaleFactor: 2 },
  { name: "webkit-mobile", browser: "webkit", viewport: { width: 375, height: 667 }, isMobile: true, deviceScaleFactor: 2 },
];

function getBrowserType(browserName: string): BrowserType {
  switch (browserName) {
    case "firefox": return firefox;
    case "webkit": return webkit;
    default: return chromium;
  }
}

export async function launchBrowser(): Promise<Browser> {
  return await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

export async function launchBrowserForProject(project: BrowserProject): Promise<Browser> {
  const browserType = getBrowserType(project.browser);
  return await browserType.launch({
    headless: true,
    args: project.browser === "chromium" ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
  });
}

export async function createContextForProject(
  browser: Browser,
  project: BrowserProject
): Promise<any> {
  return await browser.newContext({
    viewport: project.viewport,
    deviceScaleFactor: project.deviceScaleFactor,
    isMobile: project.isMobile,
    userAgent: project.userAgent,
    locale: project.locale,
    timezoneId: project.timezoneId,
  });
}

export interface DOMSnapshot {
  html: string;
  elements: Array<{
    selector: string;
    tagName: string;
    attributes: Record<string, string>;
    boundingBox: { x: number; y: number; width: number; height: number } | null;
    textContent: string;
    index: number;
  }>;
}

export interface ConsoleLogEntry {
  type: string;
  text: string;
  timestamp: number;
  location?: { url: string; lineNumber: number; columnNumber: number };
}

export interface NetworkErrorEntry {
  url: string;
  status: number;
  statusText: string;
  resourceType: string;
  timestamp: number;
}

export interface PageCaptureData {
  screenshot: Buffer;
  domSnapshot: DOMSnapshot;
  consoleLogs: ConsoleLogEntry[];
  networkErrors: NetworkErrorEntry[];
  viewport: ViewportConfig;
  url: string;
  timestamp: number;
  a11y?: A11yAnalysisResult;
}

export async function openPage(
  browser: Browser,
  url: string,
  viewport: ViewportConfig,
  waitFor: "networkidle" | "domcontentloaded" | "load" = "networkidle",
  waitForSelector?: string
): Promise<{ page: Page; captureData: PageCaptureData }> {
  const page = await browser.newPage();

  await page.setViewportSize(viewport);

  const consoleLogs: ConsoleLogEntry[] = [];
  const networkErrors: NetworkErrorEntry[] = [];

  page.on("console", (msg: ConsoleMessage) => {
    consoleLogs.push({
      type: msg.type(),
      text: msg.text(),
      timestamp: Date.now(),
      location: msg.location(),
    });
  });

  page.on("pageerror", (error: Error) => {
    consoleLogs.push({
      type: "error",
      text: error.message,
      timestamp: Date.now(),
    });
  });

  page.on("response", (response) => {
    if (response.status() >= 400) {
      networkErrors.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        resourceType: response.request().resourceType(),
        timestamp: Date.now(),
      });
    }
  });

  console.log(`  → Opening: ${url}`);
  await page.goto(url, { waitUntil: waitFor, timeout: 30000 });

  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, { timeout: 10000 });
  }

  await page.waitForTimeout(500);

  const domSnapshot = await captureDOMSnapshot(page);

  const captureData: PageCaptureData = {
    screenshot: Buffer.from([]),
    domSnapshot,
    consoleLogs,
    networkErrors,
    viewport,
    url,
    timestamp: Date.now(),
  };

  return { page, captureData };
}

export async function runA11yAnalysis(page: Page, url: string, viewport: ViewportConfig): Promise<A11yAnalysisResult> {
  try {
    await injectAxe(page);
    const results = await getAxeResults(page);

    return {
      violations: results.violations as any,
      passes: results.passes?.length || 0,
      incomplete: 0,
      inapplicable: 0,
      timestamp: new Date().toISOString(),
      url,
      viewport,
    };
  } catch (error) {
    console.warn(`  ⚠️  A11y analysis failed: ${(error as Error).message}`);
    return {
      violations: [],
      passes: 0,
      incomplete: 0,
      inapplicable: 0,
      timestamp: new Date().toISOString(),
      url,
      viewport,
    };
  }
}

async function captureDOMSnapshot(page: Page): Promise<DOMSnapshot> {
  return await page.$$eval("*", (elements: Element[]) => {
    const result: { selector: string; tagName: string; attributes: Record<string, string>; boundingBox: { x: number; y: number; width: number; height: number } | null; textContent: string; index: number }[] = [];

    elements.forEach((el, index) => {
      if (!(el instanceof HTMLElement)) return;
      const htmlEl = el;
      const rect = htmlEl.getBoundingClientRect();
      const attributes: Record<string, string> = {};

      for (const attr of htmlEl.attributes) {
        attributes[attr.name] = attr.value;
      }

      if (rect.width > 1 && rect.height > 1 && htmlEl.tagName !== "SCRIPT" && htmlEl.tagName !== "STYLE") {
        let selector = htmlEl.tagName.toLowerCase();
        if (htmlEl.id) {
          selector = `#${htmlEl.id}`;
        } else if (htmlEl.className) {
          const classes = htmlEl.className.split(" ").filter((c) => c && !c.startsWith("hash-")).slice(0, 3);
          if (classes.length) selector += "." + classes.join(".");
        }

        result.push({
          selector,
          tagName: htmlEl.tagName.toLowerCase(),
          attributes,
          boundingBox: rect.width > 0 ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
          textContent: (htmlEl.textContent ?? "").slice(0, 200),
          index,
        });
      }
    });

    return {
      html: document.documentElement.outerHTML.slice(0, 500000),
      elements: result,
    };
  });
}

export async function takeScreenshot(
  page: Page,
  outputPath: string,
  maskSelectors: string[] = []
): Promise<Buffer> {
  if (maskSelectors.length > 0) {
    await page.evaluate((selectors) => {
      selectors.forEach((selector) => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => {
          (el as HTMLElement).style.visibility = "hidden";
        });
      });
    }, maskSelectors);
  }

  const screenshot = await page.screenshot({ path: outputPath || undefined, fullPage: false });
  console.log(`  → Saved: ${outputPath || "buffer"}`);
  return screenshot;
}

export function computeDOMSnapshotDiff(baseline: DOMSnapshot, current: DOMSnapshot) {
  const baselineMap = new Map(baseline.elements.map((e) => [e.selector, e]));
  const currentMap = new Map(current.elements.map((e) => [e.selector, e]));

  const added: string[] = [];
  const removed: string[] = [];
  const modified: Array<{ selector: string; oldAttrs: Record<string, string>; newAttrs: Record<string, string> }> = [];
  const moved: Array<{ selector: string; oldIndex: number; newIndex: number }> = [];

  for (const [selector, currentEl] of currentMap) {
    const baselineEl = baselineMap.get(selector);
    if (!baselineEl) {
      added.push(selector);
    } else {
      const oldAttrs = baselineEl.attributes;
      const newAttrs = currentEl.attributes;
      const allKeys = new Set([...Object.keys(oldAttrs), ...Object.keys(newAttrs)]);
      const changed = Array.from(allKeys).some((k) => oldAttrs[k] !== newAttrs[k]);
      if (changed) {
        modified.push({ selector, oldAttrs, newAttrs });
      }

      if (baselineEl.boundingBox && currentEl.boundingBox) {
        const dx = Math.abs(baselineEl.boundingBox.x - currentEl.boundingBox.x);
        const dy = Math.abs(baselineEl.boundingBox.y - currentEl.boundingBox.y);
        if (dx > 5 || dy > 5) {
          moved.push({ selector, oldIndex: baselineEl.index, newIndex: currentEl.index });
        }
      }
    }
  }

  for (const [selector, baselineEl] of baselineMap) {
    if (!currentMap.has(selector)) {
      removed.push(selector);
    }
  }

  return { added, removed, modified, moved };
}

export async function capturePageData(
  browser: Browser,
  url: string,
  viewport: ViewportConfig,
  waitFor: "networkidle" | "domcontentloaded" | "load" = "networkidle",
  waitForSelector?: string,
  maskSelectors: string[] = [],
  runA11y: boolean = true
): Promise<PageCaptureData> {
  const { page, captureData } = await openPage(browser, url, viewport, waitFor, waitForSelector);
  try {
    const screenshot = await takeScreenshot(page, "", maskSelectors);
    captureData.screenshot = screenshot;
    
    if (runA11y) {
      console.log(`  ♿ Running accessibility analysis...`);
      captureData.a11y = await runA11yAnalysis(page, url, viewport);
    }
    
    return captureData;
  } finally {
    await page.close();
  }
}

export async function openPageWithProject(
  browser: Browser,
  project: BrowserProject,
  url: string,
  waitFor: "networkidle" | "domcontentloaded" | "load" = "networkidle",
  waitForSelector?: string
): Promise<{ page: Page; captureData: PageCaptureData; context: any }> {
  const context = await browser.newContext({
    viewport: project.viewport,
    deviceScaleFactor: project.deviceScaleFactor,
    isMobile: project.isMobile,
    userAgent: project.userAgent,
    locale: project.locale,
    timezoneId: project.timezoneId,
  });

  const page = await context.newPage();

  const consoleLogs: ConsoleLogEntry[] = [];
  const networkErrors: NetworkErrorEntry[] = [];

  page.on("console", (msg: ConsoleMessage) => {
    consoleLogs.push({
      type: msg.type(),
      text: msg.text(),
      timestamp: Date.now(),
      location: msg.location(),
    });
  });

  page.on("pageerror", (error: Error) => {
    consoleLogs.push({
      type: "error",
      text: error.message,
      timestamp: Date.now(),
    });
  });

  page.on("response", (response) => {
    if (response.status() >= 400) {
      networkErrors.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        resourceType: response.request().resourceType(),
        timestamp: Date.now(),
      });
    }
  });

  console.log(`  → Opening [${project.name}]: ${url}`);
  await page.goto(url, { waitUntil: waitFor, timeout: 30000 });

  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, { timeout: 10000 });
  }

  await page.waitForTimeout(500);

  const domSnapshot = await captureDOMSnapshot(page);

  const captureData: PageCaptureData = {
    screenshot: Buffer.from([]),
    domSnapshot,
    consoleLogs,
    networkErrors,
    viewport: project.viewport,
    url,
    timestamp: Date.now(),
  };

  return { page, captureData, context };
}