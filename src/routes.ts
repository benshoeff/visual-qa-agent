import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { readConfig, writeConfig, PageConfig, REPORTS_DIR, BASELINES_DIR, CURRENT_DIR, DIFFS_DIR, screenshotPath } from "./config.js";
import {
  runBaseline,
  runTest,
  runBaselineForPage,
  runTestForPage,
} from "./agent.js";
import {
  getSchedules,
  addSchedule,
  updateSchedule,
  deleteSchedule,
  previewNextRun,
} from "./scheduler.js";
import { testCasesRouter } from "./routes/testCases.js";
import { flakyTestsRouter } from "./routes/flakyTests.js";
import { impactRouter } from "./routes/impact.js";
import { commentsRouter } from "./routes/comments.js";
import { approvalsRouter } from "./routes/approvals.js";
import { auditLogRouter } from "./routes/auditLog.js";
import { crawlRouter } from "./routes/crawl.js";
import { ignoreZonesRouter } from "./routes/ignoreZones.js";

export const router = Router();

router.use("/test-cases", testCasesRouter);
router.use("/flaky-tests", flakyTestsRouter);
router.use("/impact", impactRouter);
router.use("/comments", commentsRouter);
router.use("/approvals", approvalsRouter);
router.use("/audit", auditLogRouter);
router.use("/crawl", crawlRouter);
router.use("/ignore-zones", ignoreZonesRouter);

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
    const { viewport, threshold, waitFor } = req.body;
    if (viewport) config.viewport = viewport;
    if (threshold !== undefined) config.threshold = threshold;
    if (waitFor) config.waitFor = waitFor;
    writeConfig(config);
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Pages ───────────────────────────────────────────────────────────────

router.get("/pages", (_req: Request, res: Response) => {
  try {
    res.json(readConfig().pages);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/pages", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const newPage: PageConfig = req.body;
    if (!newPage.name || !newPage.url) {
      res.status(400).json({ error: "name and url are required" });
      return;
    }
    if (config.pages.some((p) => p.name === newPage.name)) {
      res
        .status(409)
        .json({ error: `Page "${newPage.name}" already exists` });
      return;
    }
    newPage.mask ??= [];
    config.pages.push(newPage);
    writeConfig(config);
    res.status(201).json(newPage);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put("/pages/:name", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const idx = config.pages.findIndex((p) => p.name === (req.params.name as string));
    if (idx === -1) {
      res.status(404).json({ error: `Page "${req.params.name}" not found` });
      return;
    }
    const oldName = req.params.name as string;
    const newName = req.body.name || oldName;
    config.pages[idx] = { ...config.pages[idx], ...req.body, name: newName };
    writeConfig(config);

    if (newName !== oldName) {
      for (const dir of [BASELINES_DIR, CURRENT_DIR, DIFFS_DIR]) {
        const oldPath = screenshotPath(dir, oldName);
        const newPath = screenshotPath(dir, newName);
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
        }
      }
    }

    res.json(config.pages[idx]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete("/pages/:name", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const idx = config.pages.findIndex((p) => p.name === (req.params.name as string));
    if (idx === -1) {
      res.status(404).json({ error: `Page "${req.params.name}" not found` });
      return;
    }
    config.pages.splice(idx, 1);
    writeConfig(config);
    res.json({ deleted: req.params.name as string });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/pages/:name/baseline", async (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const pageConf = config.pages.find((p) => p.name === req.params.name);
    if (!pageConf) {
      res.status(404).json({ error: `Page "${req.params.name as string}" not found` });
      return;
    }
    await runBaselineForPage(config, pageConf);
    res.json({ success: true, message: `Baseline captured for "${req.params.name as string}"` });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/pages/:name/test", async (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const pageConf = config.pages.find((p) => p.name === req.params.name);
    if (!pageConf) {
      res.status(404).json({ error: `Page "${req.params.name as string}" not found` });
      return;
    }
    const result = await runTestForPage(config, pageConf);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Run tests ───────────────────────────────────────────────────────────

router.post("/run/baseline", async (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const pages: string[] | undefined = req.body?.pages;
    await runBaseline(config, pages);
    res.json({ success: true, message: "Baseline updated successfully" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/run/test", async (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const pages: string[] | undefined = req.body?.pages;
    const results = await runTest(config, pages);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/run/scheduled", async (_req: Request, res: Response) => {
  try {
    console.log("\n⏰ Running scheduled job (Render Cron)");
    const config = readConfig();
    const results = await runTest(config);
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

router.get("/reports", (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(REPORTS_DIR)) {
      res.json([]);
      return;
    }
    const files = fs
      .readdirSync(REPORTS_DIR)
      .filter((f) => f.endsWith(".html"))
      .map((f) => {
        const stat = fs.statSync(path.join(REPORTS_DIR, f));
        return {
          filename: f,
          timestamp: stat.mtimeMs,
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
    const filePath = path.join(REPORTS_DIR, req.params.filename as string);
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

    let filePath: string;
    let contentType: string;
    let root: string;

    if (type === "report") {
      filePath = path.join(REPORTS_DIR, name);
      contentType = "text/html; charset=utf-8";
      root = REPORTS_DIR;
    } else {
      const dir =
        type === "baseline"
          ? BASELINES_DIR
          : type === "current"
            ? CURRENT_DIR
            : type === "diff"
              ? DIFFS_DIR
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

router.get("/schedules", (_req: Request, res: Response) => {
  try {
    const schedules = getSchedules();
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/schedules", (req: Request, res: Response) => {
  try {
    const { name, cronExpression, mode, enabled } = req.body;
    if (!name || !cronExpression || !mode) {
      res.status(400).json({ error: "name, cronExpression, and mode are required" });
      return;
    }
    const schedule = addSchedule({ name, cronExpression, mode, enabled: enabled ?? true });
    res.status(201).json(schedule);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put("/schedules/:id", (req: Request, res: Response) => {
  try {
    const schedule = updateSchedule(req.params.id as string, req.body);
    if (!schedule) {
      res.status(404).json({ error: "Schedule not found" });
      return;
    }
    res.json(schedule);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete("/schedules/:id", (req: Request, res: Response) => {
  try {
    const deleted = deleteSchedule(req.params.id as string);
    if (!deleted) {
      res.status(404).json({ error: "Schedule not found" });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/schedules/validate", (req: Request, res: Response) => {
  try {
    const { cronExpression } = req.body;
    const nextRun = previewNextRun(cronExpression);
    res.json({ valid: nextRun !== null, nextRun });
  } catch {
    res.json({ valid: false, nextRun: null });
  }
});
