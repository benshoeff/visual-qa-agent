import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { readConfig, writeConfig, PageConfig, ProjectConfig, Config, REPORTS_DIR, BASELINES_DIR, CURRENT_DIR, DIFFS_DIR, screenshotPath, getProject, ensureUniqueProjectId, resolveProjectId, projectArtifactsDir } from "./config.js";
import {
  runBaseline,
  runTest,
  runBaselineForPage,
  runTestForPage,
} from "./agent.js";
import { getSchedules } from "./scheduler.js";
import { testCasesRouter } from "./routes/testCases.js";
import { flakyTestsRouter } from "./routes/flakyTests.js";
import { impactRouter } from "./routes/impact.js";
import { commentsRouter } from "./routes/comments.js";
import { approvalsRouter } from "./routes/approvals.js";
import { auditLogRouter } from "./routes/auditLog.js";
import { crawlRouter } from "./routes/crawl.js";
import { ignoreZonesRouter } from "./routes/ignoreZones.js";
import { startCrawlJob } from "./crawler.js";
import { createLocalRun, updateLocalRun, listLocalRuns } from "./localRuns.js";

export const router = Router();

router.use("/test-cases", testCasesRouter);
router.use("/flaky-tests", flakyTestsRouter);
router.use("/impact", impactRouter);
router.use("/comments", commentsRouter);
router.use("/approvals", approvalsRouter);
router.use("/audit", auditLogRouter);
router.use("/crawl", crawlRouter);
router.use("/ignore-zones", ignoreZonesRouter);

function resolveProject(req: Request, config?: Config): ProjectConfig | undefined {
  return getProject(config ?? readConfig(), req.query.project as string | undefined);
}

// ─── Projects ──────────────────────────────────────────────────────────────

router.get("/projects", (_req: Request, res: Response) => {
  try {
    const config = readConfig();
    res.json({ activeProjectId: config.activeProjectId, projects: config.projects });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/projects", (req: Request, res: Response) => {
  try {
    const config = readConfig();

    // Activate project: POST /api/projects?id=X&confirm=true
    if (req.query.confirm === "true") {
      const id = req.query.id as string;
      const idx = config.projects.findIndex((p) => p.id === id);
      if (idx === -1) {
        res.status(404).json({ error: `Project "${id ?? ""}" not found` });
        return;
      }
      config.activeProjectId = config.projects[idx].id;
      writeConfig(config);
      res.json({ activeProjectId: config.activeProjectId });
      return;
    }

    const { name, baseUrl } = req.body;
    if (!name || !baseUrl) {
      res.status(400).json({ error: "name and baseUrl are required" });
      return;
    }
    const project: ProjectConfig = {
      id: ensureUniqueProjectId(config, name),
      name,
      baseUrl,
      viewport: req.body.viewport ?? { width: 1280, height: 720 },
      threshold: req.body.threshold ?? 0.2,
      waitFor: req.body.waitFor ?? "networkidle",
      pages: req.body.pages ?? [],
      globalIgnoreZones: [],
      fullPage: { defaultMode: "viewport", maxHeight: 20000 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    config.projects.push(project);
    writeConfig(config);
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Project update/delete by ?id= (used by the UI), alongside /:id path forms
router.put("/projects", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const id = req.query.id as string;
    const idx = config.projects.findIndex((p) => p.id === id);
    if (idx === -1) {
      res.status(404).json({ error: `Project "${id ?? ""}" not found` });
      return;
    }
    const current = config.projects[idx];
    config.projects[idx] = {
      ...current,
      ...req.body,
      id: current.id,
      pages: req.body.pages ?? current.pages,
      updatedAt: Date.now(),
    };
    writeConfig(config);
    res.json(config.projects[idx]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete("/projects", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const id = req.query.id as string;
    const idx = config.projects.findIndex((p) => p.id === id);
    if (idx === -1) {
      res.status(404).json({ error: `Project "${id ?? ""}" not found` });
      return;
    }
    config.projects.splice(idx, 1);
    if (config.activeProjectId === id) {
      config.activeProjectId = config.projects[0]?.id ?? "";
    }
    writeConfig(config);
    res.json({ deleted: id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put("/projects/:id", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const idx = config.projects.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: `Project "${req.params.id as string}" not found` });
      return;
    }
    const current = config.projects[idx];
    config.projects[idx] = {
      ...current,
      ...req.body,
      id: current.id,
      pages: req.body.pages ?? current.pages,
      updatedAt: Date.now(),
    };
    writeConfig(config);
    res.json(config.projects[idx]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete("/projects/:id", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const idx = config.projects.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: `Project "${req.params.id as string}" not found` });
      return;
    }
    config.projects.splice(idx, 1);
    if (config.activeProjectId === req.params.id) {
      config.activeProjectId = config.projects[0]?.id ?? "";
    }
    writeConfig(config);
    res.json({ deleted: req.params.id as string });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/projects/:id/activate", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const idx = config.projects.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: `Project "${req.params.id as string}" not found` });
      return;
    }
    config.activeProjectId = req.params.id as string;
    writeConfig(config);
    res.json({ activeProjectId: config.activeProjectId });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Config ──────────────────────────────────────────────────────────────

router.get("/config", (_req: Request, res: Response) => {
  try {
    res.json(readConfig());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch("/config", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const { ai, browsers, performance, activeProjectId, viewport, threshold, waitFor } = req.body ?? {};
    if (ai) config.ai = { ...config.ai, ...ai };
    if (browsers) config.browsers = browsers;
    if (performance) config.performance = { ...config.performance, ...performance };
    if (activeProjectId && config.projects.some((p) => p.id === activeProjectId)) {
      config.activeProjectId = activeProjectId;
    }
    const project = req.query.project
      ? getProject(config, req.query.project as string)
      : getProject(config, config.activeProjectId);
    if (project) {
      if (viewport) project.viewport = viewport;
      if (threshold !== undefined) project.threshold = threshold;
      if (waitFor) project.waitFor = waitFor;
    }
    writeConfig(config);
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Pages ───────────────────────────────────────────────────────────────

router.get("/pages", (req: Request, res: Response) => {
  try {
    const project = resolveProject(req);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(project.pages);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/pages", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const newPage: PageConfig = req.body;
    if (!newPage.name || !newPage.url) {
      res.status(400).json({ error: "name and url are required" });
      return;
    }
    if (project.pages.some((p) => p.name === newPage.name)) {
      res
        .status(409)
        .json({ error: `Page "${newPage.name}" already exists` });
      return;
    }
    newPage.mask ??= [];
    project.pages.push(newPage);
    writeConfig(config);
    res.status(201).json(newPage);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put("/pages/:name", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const idx = project.pages.findIndex((p) => p.name === (req.params.name as string));
    if (idx === -1) {
      res.status(404).json({ error: `Page "${req.params.name}" not found` });
      return;
    }
    const oldName = req.params.name as string;
    const newName = req.body.name || oldName;
    project.pages[idx] = { ...project.pages[idx], ...req.body, name: newName };
    writeConfig(config);

    if (newName !== oldName) {
      for (const dir of [BASELINES_DIR, CURRENT_DIR, DIFFS_DIR]) {
        const oldPath = screenshotPath(dir, project.id, oldName);
        const newPath = screenshotPath(dir, project.id, newName);
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
        }
      }
    }

    res.json(project.pages[idx]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete("/pages/:name", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const idx = project.pages.findIndex((p) => p.name === (req.params.name as string));
    if (idx === -1) {
      res.status(404).json({ error: `Page "${req.params.name}" not found` });
      return;
    }
    project.pages.splice(idx, 1);
    writeConfig(config);
    res.json({ deleted: req.params.name as string });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Page update/delete by ?name= (used by the UI), alongside /pages/:name path forms
router.put("/pages", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const oldName = req.query.name as string;
    const idx = project.pages.findIndex((p) => p.name === oldName);
    if (idx === -1) {
      res.status(404).json({ error: `Page "${oldName}" not found` });
      return;
    }
    const newName = req.body.name || oldName;
    project.pages[idx] = { ...project.pages[idx], ...req.body, name: newName };
    writeConfig(config);

    if (newName !== oldName) {
      for (const dir of [BASELINES_DIR, CURRENT_DIR, DIFFS_DIR]) {
        const oldPath = screenshotPath(dir, project.id, oldName);
        const newPath = screenshotPath(dir, project.id, newName);
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
        }
      }
    }

    res.json(project.pages[idx]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete("/pages", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const name = req.query.name as string;
    const idx = project.pages.findIndex((p) => p.name === name);
    if (idx === -1) {
      res.status(404).json({ error: `Page "${name}" not found` });
      return;
    }
    project.pages.splice(idx, 1);
    writeConfig(config);
    res.json({ deleted: name });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/pages/:name/baseline", async (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const pageConf = project.pages.find((p) => p.name === req.params.name);
    if (!pageConf) {
      res.status(404).json({ error: `Page "${req.params.name as string}" not found` });
      return;
    }
    await runBaselineForPage(config, project, pageConf);
    res.json({ success: true, message: `Baseline captured for "${req.params.name as string}"` });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/pages/:name/test", async (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const pageConf = project.pages.find((p) => p.name === req.params.name);
    if (!pageConf) {
      res.status(404).json({ error: `Page "${req.params.name as string}" not found` });
      return;
    }
    const result = await runTestForPage(config, project, pageConf);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Run tests ───────────────────────────────────────────────────────────

router.post("/run/baseline", async (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const pages: string[] | undefined = req.body?.pages;
    await runBaseline(config, project, pages);
    res.json({ success: true, message: "Baseline updated successfully" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/run/test", async (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const pages: string[] | undefined = req.body?.pages;
    const results = await runTest(config, project, pages);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Local equivalents of the Vercel serverless /dispatch + /status endpoints.
// When running the UI against the local express server, "Run Tests"/"Capture
// Baseline" dispatch to GitHub Actions via /api/dispatch — that 404s locally.
// These handlers execute the run in-process and report progress via /api/status
// using the same response shape as the serverless API.

interface DispatchBody {
  mode?: "test" | "baseline" | "crawl";
  pages?: string[];
  url?: string;
  crawlConfig?: Record<string, unknown>;
  fullPageMode?: "page-default" | "viewport" | "fullPage";
  project?: string;
}

function latestReportUrl(projectId: string): string | null {
  const dir = path.join(REPORTS_DIR, projectId);
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".html"))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files.length > 0
    ? `/api/files?type=report&name=${encodeURIComponent(files[0].f)}&project=${encodeURIComponent(projectId)}`
    : null;
}

async function executeLocalRun(
  runId: number,
  mode: "test" | "baseline" | "crawl",
  project: ProjectConfig,
  body: DispatchBody
): Promise<void> {
  try {
    const previousFullPageMode = process.env.FULLPAGE_MODE;
    if (body.fullPageMode && body.fullPageMode !== "page-default") {
      process.env.FULLPAGE_MODE = body.fullPageMode;
    }
    try {
      const pages: string[] | undefined =
        Array.isArray(body.pages) && body.pages.length > 0 ? body.pages : undefined;

      if (mode === "crawl") {
        if (!body.url) throw new Error("url is required for crawl");
        await startCrawlJob(body.url, body.crawlConfig ?? {}, true, project.id);
        updateLocalRun(runId, { status: "completed", conclusion: "success" });
        return;
      }

      if (mode === "baseline") {
        await runBaseline(readConfig(), project, pages);
        updateLocalRun(runId, { status: "completed", conclusion: "success" });
        return;
      }

      const results = await runTest(readConfig(), project, pages);
      const failed = results.filter((r) => !r.passed).length;
      updateLocalRun(runId, {
        status: "completed",
        conclusion: failed > 0 ? "failure" : "success",
        htmlUrl: mode === "test" ? latestReportUrl(project.id) : null,
      });
    } finally {
      if (previousFullPageMode === undefined) delete process.env.FULLPAGE_MODE;
      else process.env.FULLPAGE_MODE = previousFullPageMode;
    }
  } catch (err) {
    console.error(`   ❌ Local run #${runId} failed:`, (err as Error).message);
    updateLocalRun(runId, { status: "completed", conclusion: "failure" });
  }
}

router.post("/dispatch", async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as DispatchBody;
    const mode = body.mode ?? "test";
    const config = readConfig();
    const project = getProject(config, body.project ?? (req.query.project as string | undefined));
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const run = createLocalRun(mode, project.id);
    res.status(202).json({ success: true, message: `Dispatched ${mode} run` });
    void executeLocalRun(run.id, mode, project, body);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/status", (req: Request, res: Response) => {
  try {
    const projectId = req.query.project as string | undefined;
    res.json({ runs: listLocalRuns(projectId) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/run/scheduled", async (_req: Request, res: Response) => {
  try {
    console.log("\n⏰ Running scheduled job (Render Cron)");
    const config = readConfig();
    const project = getProject(config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const results = await runTest(config, project);
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    console.log(`   📊 Scheduled run: ${passed} passed, ${failed} failed`);
    res.json({ results, summary: { passed, failed } });
  } catch (err) {
    console.error("   ❌ Scheduled run failed:", (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Reports ─────────────────────────────────────────────────────────────

function reportsDirFor(req: Request): string | null {
  const project = resolveProject(req);
  if (!project) return null;
  return path.join(REPORTS_DIR, project.id);
}

router.get("/reports", (req: Request, res: Response) => {
  try {
    const dir = reportsDirFor(req);
    if (!dir) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!fs.existsSync(dir)) {
      res.json([]);
      return;
    }
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".html"))
      .map((f) => {
        const stat = fs.statSync(path.join(dir, f));
        const match = f.match(/report-(\d+)\.html/);
        return {
          filename: f,
          timestamp: match ? parseInt(match[1], 10) : stat.mtimeMs,
          size: stat.size,
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/reports/:filename", (req: Request, res: Response) => {
  try {
    const dir = reportsDirFor(req);
    if (!dir) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const filePath = path.join(dir, req.params.filename as string);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Files (mirrors Vercel serverless api/files.ts) ─────────────────────

router.get("/files", (req: Request, res: Response) => {
  try {
    const type = req.query.type as string;
    const name = req.query.name as string;
    if (!type || !name) {
      res.status(400).json({ error: "type and name are required" });
      return;
    }

    const project = resolveProject(req);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    let filePath: string;
    let contentType: string;
    let root: string;

    if (type === "report") {
      filePath = path.join(REPORTS_DIR, project.id, name);
      contentType = "text/html; charset=utf-8";
      root = projectArtifactsDir(REPORTS_DIR, project.id);
    } else {
      const dir =
        type === "baseline"
          ? projectArtifactsDir(BASELINES_DIR, project.id)
          : type === "current"
            ? projectArtifactsDir(CURRENT_DIR, project.id)
            : type === "diff"
              ? projectArtifactsDir(DIFFS_DIR, project.id)
              : null;
      if (!dir) {
        res.status(400).json({ error: `Unknown type "${type}"` });
        return;
      }
      const base = name.replace(/\.png$/i, "");
      filePath = path.join(dir, `${base}.png`);
      contentType = "image/png";
      root = dir;
    }

    const resolved = path.resolve(filePath);
    const rootResolved = path.resolve(root);
    if (!resolved.startsWith(rootResolved + path.sep)) {
      res.status(400).json({ error: "Invalid file path" });
      return;
    }
    if (!fs.existsSync(resolved)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.setHeader("Content-Type", contentType);
    res.sendFile(resolved);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Schedules ──────────────────────────────────────────────────────────
// Read-only: schedules are defined in schedules.yml at the repo root.

router.get("/schedules", (_req: Request, res: Response) => {
  try {
    const schedules = getSchedules();
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});