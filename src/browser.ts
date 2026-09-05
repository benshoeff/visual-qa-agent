import { chromium, firefox, webkit, Browser, BrowserType, Page, ConsoleMessage, Locator } from "playwright";
import { injectAxe, getAxeResults } from "axe-playwright";
import { A11yAnalysisResult } from "./a11y/index.js";
import { BASELINES_DIR, CaptureMode } from "./config.js";
import path from "path";
import fs from "fs";
import { PNG } from "pngjs";

export const DEFAULT_FULLPAGE_MAX_HEIGHT = 20000;

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

export async function captureFullPageScreenshot(
  page: Page,
  outputPath: string,
  options: {
    maskSelectors?: string[];
    keepVisibleSelectors?: string[];
    scrollableSelector?: string;
    maxHeight?: number;
  } = {}
): Promise<Buffer> {
  const maxHeight = options.maxHeight ?? DEFAULT_FULLPAGE_MAX_HEIGHT;
  const scrollableSelector = options.scrollableSelector?.trim() || undefined;

  if (scrollableSelector) {
    return takeScreenshot(page, outputPath, {
      maskSelectors: options.maskSelectors,
      keepVisibleSelectors: options.keepVisibleSelectors,
      fullPage: true,
      maxHeight,
      scrollableSelector,
    });
  }

  await preScrollForLazyContent(page, maxHeight);

  const height = await page.evaluate(() =>
    Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight ?? 0
    )
  );

  if (height > maxHeight) {
    throw new FullPageLimitError(height, maxHeight);
  }

  console.log(`  📐 Full-page capture (${height}px tall)`);

  return takeScreenshot(page, outputPath, {
    maskSelectors: options.maskSelectors,
    keepVisibleSelectors: options.keepVisibleSelectors,
    fullPage: true,
    maxHeight,
  });
}

export async function takeScreenshotForConfig(
  page: Page,
  outputPath: string,
  mode: CaptureMode,
  options: {
    maskSelectors?: string[];
    keepVisibleSelectors?: string[];
    scrollableSelector?: string;
    maxHeight?: number;
  } = {}
): Promise<Buffer> {
  if (mode === "fullPage") {
    return captureFullPageScreenshot(page, outputPath, options);
  }
  return takeScreenshot(page, outputPath, { maskSelectors: options.maskSelectors });
}

export class FullPageLimitError extends Error {
  constructor(
    public readonly pageHeight: number,
    public readonly maxHeight: number
  ) {
    super(
      `Page height ${pageHeight}px exceeds full-page capture limit of ${maxHeight}px. ` +
        `Increase "fullPage.maxHeight" or switch the page to "viewport" capture.`
    );
    this.name = "FullPageLimitError";
  }
}

export interface ScreenshotOptions {
  maskSelectors?: string[];
  fullPage?: boolean;
  maxHeight?: number;
  keepVisibleSelectors?: string[];
  scrollableSelector?: string;
}

export async function takeScreenshot(
  page: Page,
  outputPath: string,
  options: ScreenshotOptions = {}
): Promise<Buffer> {
  const {
    maskSelectors = [],
    fullPage = false,
    keepVisibleSelectors = [],
    scrollableSelector,
  } = options;

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

  let restoreFixedSticky: (() => Promise<void>) | null = null;

  try {
    if (fullPage) {
      restoreFixedSticky = await hideFixedSticky(page, [
        ...keepVisibleSelectors,
        ...maskSelectors,
      ]);
    }

    let screenshot: Buffer;
    if (fullPage && scrollableSelector) {
      screenshot = await captureScrollableElement(
        page,
        page.locator(scrollableSelector),
        options.maxHeight ?? DEFAULT_FULLPAGE_MAX_HEIGHT,
        outputPath
      );
    } else {
      screenshot = await page.screenshot({
        path: outputPath || undefined,
        fullPage,
      });
    }
    console.log(
      `  → Saved: ${outputPath || "buffer"}${fullPage ? " (full page)" : ""}`
    );
    return screenshot;
  } finally {
    if (restoreFixedSticky) {
      await restoreFixedSticky();
    }
  }
}

async function captureScrollableElement(
  page: Page,
  locator: Locator,
  maxHeight: number,
  outputPath?: string
): Promise<Buffer> {
  const info = await locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      scrollHeight: el.scrollHeight,
      clientWidth: el.clientWidth,
      scrollTop: el.scrollTop,
      scrollLeft: el.scrollLeft,
      elementTop: rect.top + window.scrollY,
      elementLeft: rect.left + window.scrollX,
    };
  });

  if (info.scrollHeight > maxHeight) {
    throw new FullPageLimitError(info.scrollHeight, maxHeight);
  }

  console.log(
    `  📐 Capturing scrollable container (${info.scrollHeight}px tall)`
  );

  await locator.evaluate(
    (el, top) => {
      el.scrollTop = 0;
      el.scrollLeft = 0;
      window.scrollTo(0, Math.max(0, top - 1));
    },
    info.elementTop
  );
  await page.waitForTimeout(80);

  const slices: Array<{ buffer: Buffer; offsetY: number }> = [];
  let offset = 0;
  while (offset < info.scrollHeight) {
    await locator.evaluate((el, o) => {
      el.scrollTop = o;
    }, offset);
    await page.waitForTimeout(60);

    const box = await locator.boundingBox();
    if (!box) {
      throw new Error(`Scrollable container not visible: ${locator}`);
    }
    const clipH = Math.max(1, Math.floor(Math.min(box.height, info.scrollHeight - offset)));
    const buffer = await page.screenshot({
      clip: {
        x: Math.max(0, Math.floor(box.x)),
        y: Math.max(0, Math.floor(box.y)),
        width: Math.max(1, Math.floor(box.width)),
        height: clipH,
      },
    });
    slices.push({ buffer, offsetY: offset });
    offset += Math.max(1, clipH - 8);
    if (slices.length > Math.max(2, Math.ceil(maxHeight / 100))) break;
  }

  if (slices.length === 0) {
    throw new Error(`No slices captured for scrollable container: ${locator}`);
  }

  return stitchSlices(slices, info.scrollHeight, outputPath);
}

function stitchSlices(
  slices: Array<{ buffer: Buffer; offsetY: number }>,
  totalHeight: number,
  outputPath?: string
): Buffer {
  const decoded = slices.map((s) => PNG.sync.read(s.buffer));
  const width = decoded.reduce((w, d) => Math.max(w, d.width), 0);
  if (width === 0) {
    throw new Error("Capture failed: zero-width slices produced by the browser");
  }
  const height = Math.max(1, totalHeight);
  const canvas = new PNG({ width, height });

  for (let i = 0; i < slices.length; i++) {
    const data = decoded[i];
    const dstStart = Math.round(slices[i].offsetY);
    for (let y = 0; y < data.height; y++) {
      const dst = dstStart + y;
      if (dst >= height) break;
      const srcRow = y * data.width * 4;
      const dstRow = dst * width * 4;
      for (let px = 0; px < width * 4; px++) {
        canvas.data[dstRow + px] =
          px < data.width * 4 ? data.data[srcRow + px] : 0;
      }
    }
  }

  const buffer = PNG.sync.write(canvas);
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);
  }
  return buffer;
}

async function preScrollForLazyContent(
  page: Page,
  maxHeight: number
): Promise<void> {
  const viewportHeight =
    (await page.evaluate(() => window.innerHeight)) || 720;
  const steps = Math.min(80, Math.ceil(maxHeight / viewportHeight));

  console.log(`  ♻️  Pre-scrolling to trigger lazy content (${steps} steps)`);

  for (let i = 1; i <= steps; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * viewportHeight);
    if (i % 3 === 0) {
      await page
        .waitForLoadState("networkidle", { timeout: 3000 })
        .catch(() => {});
    }
    await page.waitForTimeout(120);
  }

  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight)
  );
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});

  await page.evaluate(async () => {
    for (let i = 0; i < 30; i++) {
      const pendingImages = Array.from(document.images).filter(
        (img) => !img.complete || img.naturalWidth === 0
      ).length;
      if (pendingImages === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
}

async function hideFixedSticky(
  page: Page,
  keepVisibleSelectors: string[]
): Promise<() => Promise<void>> {
  const hiddenCount = await page.evaluate((keepSelectors) => {
    const keep = new Set<Element>();
    for (const selector of keepSelectors) {
      document.querySelectorAll(selector).forEach((el) => keep.add(el));
    }

    const affected: HTMLElement[] = [];
    const all = document.querySelectorAll("body *");
    for (const el of all) {
      if (!(el instanceof HTMLElement)) continue;
      const pos = getComputedStyle(el).position;
      if (pos !== "fixed" && pos !== "sticky") continue;

      let node: HTMLElement | null = el;
      let keepIt = false;
      while (node && !keepIt) {
        if (keep.has(node)) keepIt = true;
        node = node.parentElement;
      }
      if (keepIt) continue;

      el.dataset.vqaOrigVisibility = el.style.visibility;
      el.style.visibility = "hidden";
      affected.push(el);
    }
    return affected.length;
  }, keepVisibleSelectors);

  if (hiddenCount > 0) {
    console.log(
      `  🧷 Hid ${hiddenCount} fixed/sticky element(s) during full-page capture`
    );
  }

  return async () => {
    await page.evaluate(() => {
      document.querySelectorAll("[data-vqa-orig-visibility]").forEach((el) => {
        if (el instanceof HTMLElement) {
          el.style.visibility = el.dataset.vqaOrigVisibility || "";
          delete el.dataset.vqaOrigVisibility;
        }
      });
    });
  };
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
    const screenshot = await takeScreenshot(page, "", { maskSelectors });
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