import { chromium, Browser, Page } from "playwright";
import { jobStore } from "./utils/jobStore.js";
import { CrawlJob, CrawlConfig, DiscoveredPage, CrawlResult, CrawlJobStatus } from "./types/crawl.js";
import { readConfig, DEFAULT_CRAWL_CONFIG, PageConfig, BASELINES_DIR, resolveProjectId, getProject, ProjectConfig, screenshotPath } from "./config.js";
import { runBaselineForPage } from "./agent.js";
import { assertNavigablePage } from "./browser.js";
import fs from "fs";
import path from "path";

function generateId(): string {
  return crypto.randomUUID();
}

function normalizeUrl(base: string, href: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return "";
  }
}

function sameDomain(url1: string, url2: string): boolean {
  try {
    return new URL(url1).origin === new URL(url2).origin;
  } catch {
    return false;
  }
}

function isExcluded(url: string, patterns: string[]): boolean {
  const pathname = new URL(url).pathname;
  return patterns.some((p) => pathname.startsWith(p));
}

const NON_HTML_EXT_RE = /\.(?:pdf|png|jpe?g|gif|webp|svg|ico|bmp|avif|zip|tar|gz|rar|7z|exe|dmg|apk|ipa|mp3|mp4|mov|avi|wav|ogg|woff2?|ttf|otf|eot)$/i;

function isHtmlAsset(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    const lastSegment = pathname.split("/").pop() ?? "";
    if (!lastSegment.includes(".")) return true;
    if (lastSegment.endsWith(".html") || lastSegment.endsWith(".htm") || lastSegment.endsWith(".php") || lastSegment.endsWith(".aspx")) return true;
    return !NON_HTML_EXT_RE.test(lastSegment) ? true : false;
  } catch {
    return true;
  }
}

function urlToPageName(url: string, baseUrl: string): string {
  try {
    const u = new URL(url);
    const base = new URL(baseUrl);
    let pathname = u.pathname;
    if (pathname === "/") return "homepage";
    pathname = pathname.replace(/^\//, "").replace(/\/$/, "");
    pathname = pathname.replace(/\.[a-z]+$/i, "");
    pathname = pathname.replace(/[^a-zA-Z0-9/_-]/g, "-");
    pathname = pathname.replace(/-+/g, "-");
    return pathname || "homepage";
  } catch {
    return "page";
  }
}

async function discoverLinks(page: Page, currentUrl: string, baseUrl: string, config: CrawlConfig): Promise<DiscoveredPage[]> {
  const links = await page.evaluate((args: { currentUrl: string; baseUrl: string; excludePatterns: string[] }) => {
    const { currentUrl: cu, baseUrl: bu, excludePatterns } = args;
    const anchors = Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[];
    const results: { url: string; depth: number }[] = [];
    for (const a of anchors) {
      const href = a.getAttribute("href");
      if (!href) continue;
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
      const absolute = new URL(href, cu).href;
      if (absolute === cu) continue;
      if (excludePatterns.some((p) => new URL(absolute).pathname.startsWith(p))) continue;
      results.push({ url: absolute, depth: 0 });
    }
    return results;
  }, { currentUrl, baseUrl, excludePatterns: config.excludePatterns });

  const unique = new Map<string, DiscoveredPage>();
  for (const link of links) {
    if (config.sameDomainOnly && !sameDomain(link.url, baseUrl)) continue;
    if (isExcluded(link.url, config.excludePatterns)) continue;
    if (!isHtmlAsset(link.url)) continue;
    if (!unique.has(link.url)) {
      unique.set(link.url, {
        url: link.url,
        name: urlToPageName(link.url, baseUrl),
        depth: 1,
        parentUrl: currentUrl,
      });
    }
  }
  return Array.from(unique.values());
}

export async function startCrawlJob(startUrl: string, configOverrides: Partial<CrawlConfig> = {}, autoCaptureBaseline = true, projectId?: string): Promise<string> {
  const jobId = generateId();
  const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, ...configOverrides };
  const baseUrl = new URL(startUrl).origin;

const job: CrawlJob = {
    id: jobId,
    status: "pending",
    startUrl,
    config,
    progress: { current: 0, total: 1, currentUrl: startUrl },
    discoveredPages: [],
    results: [],
    projectId: projectId ?? "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  jobStore.create(job);

  runCrawlInBackground(jobId, startUrl, config, baseUrl, autoCaptureBaseline, projectId);

  return jobId;
}

async function runCrawlInBackground(jobId: string, startUrl: string, config: CrawlConfig, baseUrl: string, autoCaptureBaseline: boolean, requestedProjectId?: string) {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const context = await browser.newContext({ viewport: config.viewport });
  const page = await context.newPage();

  const job = jobStore.get(jobId);
  if (!job) { await browser.close(); return; }

  job.status = "running";
  job.progress = { current: 0, total: 1, currentUrl: startUrl };
  jobStore.update(jobId, job);

  const queue: { url: string; depth: number; parentUrl?: string }[] = [{ url: startUrl, depth: 0 }];
  const visited = new Set<string>();
  const discovered: DiscoveredPage[] = [];
  const results: CrawlResult[] = [];

  while (queue.length > 0 && discovered.length < config.maxPages) {
    const { url, depth, parentUrl } = queue.shift()!;
    if (visited.has(url)) continue;
    if (depth > config.maxDepth) continue;

    const currentJob = jobStore.get(jobId);
    if (!currentJob) break;

    currentJob.progress = { current: discovered.length + 1, total: config.maxPages, currentUrl: url };
    jobStore.update(jobId, { progress: currentJob.progress });

    try {
      await assertNavigablePage(url);
      await page.goto(url, { waitUntil: config.waitFor, timeout: 30000 });
      await page.waitForTimeout(500);
      visited.add(url);

      if (depth === 0) {
        discovered.push({ url, name: urlToPageName(url, baseUrl), depth: 0 });
      }

      const links = await discoverLinks(page, url, baseUrl, config);
      for (const link of links) {
        if (!visited.has(link.url) && !queue.some((q) => q.url === link.url) && discovered.length < config.maxPages) {
          link.depth = depth + 1;
          link.parentUrl = url;
          discovered.push(link);
          queue.push({ url: link.url, depth: depth + 1, parentUrl: url });
        }
      }
    } catch (err) {
      console.warn(`Crawl error for ${url}:`, (err as Error).message);
    }
  }

  const finalJob = jobStore.get(jobId);
  if (!finalJob) { await browser.close(); return; }

  finalJob.discoveredPages = discovered;
  finalJob.progress = { current: discovered.length, total: discovered.length, currentUrl: "" };
  jobStore.update(jobId, { discoveredPages: discovered, progress: finalJob.progress });

  if (autoCaptureBaseline && discovered.length > 0) {
    const appConfig = readConfig();
    const project = requestedProjectId
      ? getProject(appConfig, requestedProjectId) ?? getProject(appConfig)
      : getProject(appConfig);
    if (project) {
      for (let i = 0; i < discovered.length; i++) {
        const dp = discovered[i];
        const currentJob = jobStore.get(jobId);
        if (!currentJob) break;

        currentJob.progress = { current: i + 1, total: discovered.length, currentUrl: dp.url };
        jobStore.update(jobId, { progress: currentJob.progress });

        const pageName = dp.name;
        const existingPages = appConfig.projects
          .find((p) => p.id === project.id)
          ?.pages.filter((p) => p.name === pageName);
        if (existingPages && existingPages.length > 0) {
          results.push({ pageName, url: dp.url, success: true, baselinePath: screenshotPath(BASELINES_DIR, project.id, pageName), error: "Already exists in config" });
          continue;
        }

        const pageConfig: PageConfig = {
          name: pageName,
          url: dp.url,
          waitForSelector: undefined,
          mask: [],
          threshold: project.threshold,
        };

        try {
          await runBaselineForPage(appConfig, project, pageConfig);
          const baselinePath = screenshotPath(BASELINES_DIR, project.id, pageName);
          results.push({ pageName, url: dp.url, success: true, baselinePath });
        } catch (err) {
          results.push({ pageName, url: dp.url, success: false, error: (err as Error).message });
        }
      }
    }
  }

  await browser.close();

  const completedJob = jobStore.get(jobId);
  if (completedJob) {
    jobStore.update(jobId, { status: "completed", results, updatedAt: new Date().toISOString() });
  }
}

export async function confirmBaselines(jobId: string, pageNames: string[]): Promise<{ added: number; skipped: number }> {
  const job = jobStore.get(jobId);
  if (!job) throw new Error("Job not found");
  if (job.status !== "completed") throw new Error("Job not completed");

  const appConfig = readConfig();
  const project = getProject(appConfig, job.projectId);
  if (!project) throw new Error("Project not found for crawl job");

  let added = 0;
  let skipped = 0;

  for (const pageName of pageNames) {
    const dp = job.discoveredPages.find((p) => p.name === pageName);
    if (!dp) { skipped++; continue; }

    if (project.pages.some((p) => p.name === pageName)) {
      skipped++;
      continue;
    }

    const pageConfig: PageConfig = {
      name: pageName,
      url: dp.url,
      waitForSelector: undefined,
      mask: [],
      threshold: project.threshold,
    };
    project.pages.push(pageConfig);
    added++;
  }

  if (added > 0) {
    import("./config.js").then(({ writeConfig }) => writeConfig(appConfig));
  }

  return { added, skipped };
}

export function getCrawlJob(jobId: string): CrawlJob | null {
  return jobStore.get(jobId);
}

export function listCrawlJobs(): CrawlJob[] {
  return jobStore.list();
}