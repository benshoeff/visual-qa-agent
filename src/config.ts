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

export interface ProjectConfig {
  id: string;
  name: string;
  baseUrl: string;
  viewport: { width: number; height: number };
  threshold: number;
  waitFor: "networkidle" | "domcontentloaded" | "load";
  pages: PageConfig[];
  globalIgnoreZones?: IgnoreZone[];
  fullPage?: Partial<FullPageConfig>;
  createdAt?: number;
  updatedAt?: number;
}

export interface Config {
  version?: number;
  activeProjectId: string;
  projects: ProjectConfig[];
  ai?: AIConfig;
  browsers?: BrowserProject[];
  performance?: PerformanceConfig;
}

const ROOT = process.cwd();

export const BASELINES_DIR = path.join(ROOT, "baselines");
export const CURRENT_DIR = path.join(ROOT, "current");
export const DIFFS_DIR = path.join(ROOT, "diffs");
export const REPORTS_DIR = path.join(ROOT, "reports");

const CONFIG_PATH = path.join(ROOT, "config.json");

export const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
export const DEFAULT_THRESHOLD = 0.2;

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

export function normalizeProject(project: ProjectConfig): ProjectConfig {
  return {
    ...project,
    viewport: project.viewport ?? DEFAULT_VIEWPORT,
    threshold: project.threshold ?? DEFAULT_THRESHOLD,
    waitFor: project.waitFor ?? "networkidle",
    pages: project.pages ?? [],
    globalIgnoreZones: project.globalIgnoreZones ?? [],
    fullPage: { ...DEFAULT_FULLPAGE_CONFIG, ...project.fullPage },
  };
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export function readConfig(): Config {
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

  if (Array.isArray(raw.projects)) {
    const projects = (raw.projects as ProjectConfig[]).map(normalizeProject);
    const activeProjectId =
      projects.some((p) => p.id === raw.activeProjectId)
        ? raw.activeProjectId
        : projects[0]?.id ?? "";
    return {
      version: 2,
      activeProjectId,
      projects,
      ai: { ...DEFAULT_AI_CONFIG, ...raw.ai },
      performance: { ...DEFAULT_PERFORMANCE_CONFIG, ...raw.performance },
      browsers: raw.browsers ?? DEFAULT_BROWSER_PROJECTS,
    };
  }

  // ── v1 (legacy flat config) → migrate to a single default project ──────
  const legacy = raw as Record<string, any> & {
    pages?: PageConfig[];
    viewport?: { width: number; height: number };
    threshold?: number;
  };
  const baseUrl = legacy.pages?.[0]?.url ? safeOrigin(legacy.pages[0].url) : "";

  const project: ProjectConfig = normalizeProject({
    id: "default",
    name: legacy.name ?? (baseUrl ? new URL(baseUrl).hostname : "Default Project"),
    baseUrl,
    viewport: legacy.viewport ?? DEFAULT_VIEWPORT,
    threshold: legacy.threshold ?? DEFAULT_THRESHOLD,
    waitFor: legacy.waitFor ?? "networkidle",
    pages: legacy.pages ?? [],
    globalIgnoreZones: legacy.globalIgnoreZones ?? [],
    fullPage: { ...DEFAULT_FULLPAGE_CONFIG, ...legacy.fullPage },
  });

  return {
    version: 2,
    activeProjectId: project.id,
    projects: [project],
    ai: { ...DEFAULT_AI_CONFIG, ...legacy.ai },
    performance: { ...DEFAULT_PERFORMANCE_CONFIG, ...legacy.performance },
    browsers: legacy.browsers ?? DEFAULT_BROWSER_PROJECTS,
  };
}

export function writeConfig(config: Config): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

// ─── Project helpers ────────────────────────────────────────────────────────

export function resolveProjectId(config: Config, requestedId?: string): string {
  const id = (requestedId ?? process.env.PROJECT)?.trim();
  if (id && config.projects.some((p) => p.id === id)) return id;
  if (config.projects.some((p) => p.id === config.activeProjectId)) return config.activeProjectId;
  return config.projects[0]?.id ?? "";
}

export function getProject(config: Config, projectId?: string): ProjectConfig | undefined {
  const id = resolveProjectId(config, projectId);
  return config.projects.find((p) => p.id === id);
}

export function getActiveProject(config: Config): ProjectConfig | undefined {
  return getProject(config);
}

export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export function ensureUniqueProjectId(config: Config, desired: string): string {
  let id = slugify(desired) || "project";
  if (config.projects.some((p) => p.id === id)) {
    id = `${id}-${Date.now().toString(36).slice(-4)}`;
  }
  return id;
}

// ─── Per-project paths ──────────────────────────────────────────────────────

export function projectArtifactsDir(root: string, projectId: string): string {
  return path.join(root, projectId);
}

export function screenshotPath(dir: string, projectId: string, name: string, browserProject?: string): string {
  const suffix = browserProject ? `-${browserProject}` : "";
  return path.join(dir, projectId, `${name}${suffix}.png`);
}

export function a11yBaselinePath(projectId: string, name: string): string {
  return path.join(BASELINES_DIR, projectId, `${name}.a11y.json`);
}

export function perfBaselinePath(projectId: string, name: string): string {
  return path.join(BASELINES_DIR, projectId, `${name}.perf.json`);
}

export function reportPath(projectId: string, timestamp?: number): string {
  return path.join(REPORTS_DIR, projectId, `report-${timestamp ?? Date.now()}.html`);
}

export function captureModeFor(pageConf: PageConfig, project: ProjectConfig): CaptureMode {
  return pageConf.captureMode ?? project.fullPage?.defaultMode ?? DEFAULT_FULLPAGE_CONFIG.defaultMode;
}

export function fullPageMaxHeight(project: ProjectConfig): number {
  const maxHeight = project.fullPage?.maxHeight;
  return typeof maxHeight === "number" && maxHeight > 0 ? maxHeight : DEFAULT_FULLPAGE_CONFIG.maxHeight;
}