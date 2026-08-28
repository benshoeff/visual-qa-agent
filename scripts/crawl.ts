import { chromium, Page } from "playwright";
import fs from "fs";
import path from "path";
import { runBaselineForPage } from "../src/agent.js";
import { readConfig, PageConfig } from "../src/config.js";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RESULTS_DIR = path.join(ROOT, "crawl-results");

interface DiscoveredPage {
  url: string;
  name: string;
  depth: number;
  parentUrl?: string;
}

const startUrl = process.env.CRAWL_URL!;
const jobId = process.env.CRAWL_JOB_ID!;
const autoCapture = process.env.AUTO_CAPTURE_BASELINE !== "false";
let crawlConfig: Partial<{
  maxPages: number;
  maxDepth: number;
  sameDomainOnly: boolean;
  excludePatterns: string[];
  waitFor: "networkidle" | "domcontentloaded" | "load";
}> = {};
try {
  crawlConfig = process.env.CRAWL_CONFIG ? JSON.parse(process.env.CRAWL_CONFIG) : {};
} catch {
  crawlConfig = {};
}

const appConfig = readConfig();
const excludePatterns =
  crawlConfig.excludePatterns ??
  [
    "/login", "/signup", "/signin", "/admin", "/api", "/auth", "/cart",
    "/checkout", "/account", "/password", "/reset", "/verify", "/logout",
    "/oauth", "/callback", "/webhook", "/.well-known",
  ];
const maxPages = crawlConfig.maxPages ?? 50;
const maxDepth = crawlConfig.maxDepth ?? 3;
const sameDomainOnly = crawlConfig.sameDomainOnly ?? true;
const waitFor = crawlConfig.waitFor ?? "networkidle";

function normalizeUrl(base: string, href: string): string {
  try { return new URL(href, base).href; } catch { return ""; }
}

function sameDomain(u1: string, u2: string): boolean {
  try { return new URL(u1).origin === new URL(u2).origin; } catch { return false; }
}

function isExcluded(url: string): boolean {
  try {
    const p = new URL(url).pathname;
    return excludePatterns.some((pat) => p.startsWith(pat));
  } catch { return true; }
}

function urlToPageName(url: string): string {
  try {
    const u = new URL(url);
    let pathname = u.pathname;
    if (pathname === "/") return "homepage";
    pathname = pathname.replace(/^\//, "").replace(/\/$/, "");
    pathname = pathname.replace(/\.[a-z]+$/i, "").replace(/[^a-zA-Z0-9/_-]/g, "-").replace(/-+/g, "-");
    return pathname || "homepage";
  } catch { return "page"; }
}

async function discoverLinks(page: Page, currentUrl: string, baseUrl: string): Promise<DiscoveredPage[]> {
  const links = await page.evaluate((excl: string[]) => {
    return Array.from(document.querySelectorAll("a[href]"))
      .map((a) => a.getAttribute("href"))
      .filter((h): h is string => !!h)
      .filter((h) => !h.startsWith("#") && !h.startsWith("mailto:") && !h.startsWith("tel:") && !h.startsWith("javascript:"))
      .map((h) => new URL(h, location.href).href)
      .filter((h) => !excl.some((p) => new URL(h).pathname.startsWith(p)));
  }, excludePatterns);

  const unique = new Map<string, DiscoveredPage>();
  for (const link of links) {
    if (sameDomainOnly && !sameDomain(link, baseUrl)) continue;
    if (isExcluded(link)) continue;
    if (!unique.has(link)) {
      unique.set(link, { url: link, name: urlToPageName(link), depth: 1, parentUrl: currentUrl });
    }
  }
  return Array.from(unique.values());
}

function writeResult(partial: Partial<{ status: string; discoveredPages: DiscoveredPage[]; error?: string }>) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, `${jobId}.json`);
  const base = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : {
    id: jobId,
    status: "pending",
    startUrl,
    discoveredPages: [],
    createdAt: new Date().toISOString(),
  };
  const next = { ...base, ...partial, updatedAt: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf-8");
}

async function run() {
  writeResult({ status: "running" });
  const baseUrl = new URL(startUrl).origin;
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const queue: { url: string; depth: number; parentUrl?: string }[] = [{ url: startUrl, depth: 0 }];
  const visited = new Set<string>();
  const discovered: DiscoveredPage[] = [];

  while (queue.length > 0 && discovered.length < maxPages) {
    const { url, depth, parentUrl } = queue.shift()!;
    if (visited.has(url)) continue;
    if (depth > maxDepth) continue;
    try {
      await page.goto(url, { waitUntil: waitFor, timeout: 30000 });
      await page.waitForTimeout(500);
      visited.add(url);
      if (depth === 0) {
        discovered.push({ url, name: urlToPageName(url), depth: 0 });
      }
      const links = await discoverLinks(page, url, baseUrl);
      for (const link of links) {
        if (!visited.has(link.url) && !queue.some((q) => q.url === link.url) && discovered.length < maxPages) {
          link.depth = depth + 1;
          link.parentUrl = url;
          discovered.push(link);
          queue.push({ url: link.url, depth: depth + 1, parentUrl: url });
        }
      }
    } catch (err) {
      console.warn("Crawl error:", (err as Error).message);
    }
  }

  await browser.close();
  writeResult({ status: "completed", discoveredPages: discovered });

  if (autoCapture && discovered.length > 0) {
    let captured = 0;
    for (const dp of discovered) {
      if (appConfig.pages.some((p) => p.name === dp.name)) continue;
      const pageConfig: PageConfig = {
        name: dp.name,
        url: dp.url,
        waitForSelector: undefined,
        mask: [],
        threshold: appConfig.threshold,
      };
      try {
        await runBaselineForPage(appConfig, pageConfig);
        captured++;
      } catch (err) {
        console.warn(`Baseline failed for ${dp.name}:`, (err as Error).message);
      }
    }
    console.log(`Captured ${captured} new baselines`);
  }
}

run()
  .then(() => console.log("Crawl job completed"))
  .catch((err) => {
    console.error("Crawl failed:", err);
    writeResult({ status: "failed", error: (err as Error).message });
    process.exitCode = 1;
  });
