import fs from "fs";
import path from "path";

export interface IgnoreZone {
  id: string;
  name: string;
  type: "bounding-box" | "selector";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  selector?: string;
  enabled: boolean;
}

export type CaptureMode = "viewport" | "fullPage";

export interface PageConfig {
  name: string;
  url: string;
  waitForSelector?: string;
  mask?: string[];
  ignoreZones?: IgnoreZone[];
  threshold?: number;
  captureMode?: CaptureMode;
  fullPageScrollable?: string;
  fullPageKeepVisible?: string[];
}

export interface CrawlConfig {
  maxPages: number;
  maxDepth: number;
  sameDomainOnly: boolean;
  excludePatterns: string[];
  waitFor: "networkidle" | "domcontentloaded" | "load";
  viewport: { width: number; height: number };
}

export interface BrowserProject {
  name: string;
  browser: "chromium" | "firefox" | "webkit";
  viewport: { width: number; height: number };
  deviceScaleFactor?: number;
  isMobile?: boolean;
  userAgent?: string;
  locale?: string;
  timezoneId?: string;
}

export interface FullPageConfig {
  defaultMode: CaptureMode;
  maxHeight: number;
}

export interface AIConfig {
  enabled: boolean;
  model: string;
  baseUrl: string;
  threshold: number;
  autoApproveThreshold: number;
  fallbackToPixelMatch: boolean;
  dynamicSelectors: string[];
  ignoreRegions: { x: number; y: number; width: number; height: number }[];
}

export interface PerformanceConfig {
  enabled: boolean;
  budget: {
    lcp: number;
    fid: number;
    cls: number;
    fcp: number;
    ttfb: number;
    inp: number;
    performanceScore: number;
  };
  thresholds: {
    lcp: { warning: number; error: number };
    fid: { warning: number; error: number };
    cls: { warning: number; error: number };
    fcp: { warning: number; error: number };
    inp: { warning: number; error: number };
  };
  lighthouseOptions?: {
    formFactor: "desktop" | "mobile";
    throttling: "none" | "simulated" | "applied";
  };
}

export interface Config {
  viewport: { width: number; height: number };
  threshold: number;
  waitFor: "networkidle" | "domcontentloaded" | "load";
  pages: PageConfig[];
  globalIgnoreZones?: IgnoreZone[];
  ai?: AIConfig;
  browsers?: BrowserProject[];
  performance?: PerformanceConfig;
  fullPage?: Partial<FullPageConfig>;
}

const ROOT = process.cwd();

export const BASELINES_DIR = path.join(ROOT, "baselines");
export const CURRENT_DIR = path.join(ROOT, "current");
export const DIFFS_DIR = path.join(ROOT, "diffs");
export const REPORTS_DIR = path.join(ROOT, "reports");

export const DEFAULT_AI_CONFIG: AIConfig = {
  enabled: false,
  model: "llama3.2-vision:11b",
  baseUrl: "http://localhost:11434",
  threshold: 0.1,
  autoApproveThreshold: 0.05,
  fallbackToPixelMatch: true,
  dynamicSelectors: [
    "[data-testid*='timestamp']",
    "[data-testid*='date']",
    ".ad-slot",
    ".advertisement",
    "[id*='google_ads']",
    ".recommended-products",
    "[data-user-content]",
  ],
  ignoreRegions: [],
};

export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  enabled: false,
  budget: {
    lcp: 2500,
    fid: 100,
    cls: 0.1,
    fcp: 1800,
    ttfb: 800,
    inp: 200,
    performanceScore: 90,
  },
  thresholds: {
    lcp: { warning: 2500, error: 4000 },
    fid: { warning: 100, error: 300 },
    cls: { warning: 0.1, error: 0.25 },
    fcp: { warning: 1800, error: 3000 },
    inp: { warning: 200, error: 500 },
  },
  lighthouseOptions: {
    formFactor: "desktop",
    throttling: "simulated",
  },
};

export const DEFAULT_BROWSER_PROJECTS: BrowserProject[] = [
  { name: "chromium-desktop", browser: "chromium", viewport: { width: 1280, height: 720 } },
  { name: "firefox-desktop", browser: "firefox", viewport: { width: 1280, height: 720 } },
  { name: "webkit-desktop", browser: "webkit", viewport: { width: 1280, height: 720 } },
  { name: "chromium-mobile", browser: "chromium", viewport: { width: 375, height: 667 }, isMobile: true, deviceScaleFactor: 2 },
  { name: "webkit-mobile", browser: "webkit", viewport: { width: 375, height: 667 }, isMobile: true, deviceScaleFactor: 2 },
];

export const DEFAULT_FULLPAGE_CONFIG: FullPageConfig = {
  defaultMode: "viewport",
  maxHeight: 20000,
};

export const DEFAULT_CRAWL_CONFIG: CrawlConfig = {
  maxPages: 50,
  maxDepth: 3,
  sameDomainOnly: true,
  excludePatterns: [
    "/login",
    "/signup",
    "/signin",
    "/admin",
    "/api",
    "/auth",
    "/cart",
    "/checkout",
    "/account",
    "/password",
    "/reset",
    "/verify",
    "/logout",
    "/oauth",
    "/callback",
    "/webhook",
    "/.well-known",
  ],
  waitFor: "networkidle",
  viewport: { width: 1280, height: 720 },
};

export function screenshotPath(dir: string, name: string, browserProject?: string) {
  const suffix = browserProject ? `-${browserProject}` : "";
  return path.join(dir, `${name}${suffix}.png`);
}

export function a11yBaselinePath(name: string) {
  return path.join(BASELINES_DIR, `${name}.a11y.json`);
}

export function captureModeFor(pageConf: PageConfig, config: Config): CaptureMode {
  return pageConf.captureMode ?? config.fullPage?.defaultMode ?? DEFAULT_FULLPAGE_CONFIG.defaultMode;
}

export function fullPageMaxHeight(config: Config): number {
  const maxHeight = config.fullPage?.maxHeight;
  return typeof maxHeight === "number" && maxHeight > 0 ? maxHeight : DEFAULT_FULLPAGE_CONFIG.maxHeight;
}

export function readConfig(): Config {
  const config = JSON.parse(
    fs.readFileSync(path.join(ROOT, "config.json"), "utf-8")
  );
  return {
    ...config,
    globalIgnoreZones: config.globalIgnoreZones ?? [],
    ai: { ...DEFAULT_AI_CONFIG, ...config.ai },
    performance: { ...DEFAULT_PERFORMANCE_CONFIG, ...config.performance },
    browsers: config.browsers ?? DEFAULT_BROWSER_PROJECTS,
    fullPage: { ...DEFAULT_FULLPAGE_CONFIG, ...config.fullPage },
  };
}

export function writeConfig(config: Config): void {
  fs.writeFileSync(
    path.join(ROOT, "config.json"),
    JSON.stringify(config, null, 2),
    "utf-8"
  );
}
