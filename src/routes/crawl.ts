import { Router, Request, Response } from "express";
import {
  startCrawlJob,
  getCrawlJob,
  listCrawlJobs,
  confirmBaselines,
} from "../crawler.js";
import { StartCrawlRequest, ConfirmBaselinesRequest } from "../types/crawl.js";

export const crawlRouter = Router();

crawlRouter.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as StartCrawlRequest;
    if (!body.url) {
      res.status(400).json({ error: "url is required" });
      return;
    }

    try {
      new URL(body.url);
    } catch {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }

    const config = body.config || {};
    const autoCaptureBaseline = body.autoCaptureBaseline ?? true;

    const jobId = await startCrawlJob(body.url, config, autoCaptureBaseline);
    res.status(202).json({ jobId, status: "pending" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

crawlRouter.get("/", (_req: Request, res: Response) => {
  try {
    const jobs = listCrawlJobs();
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

crawlRouter.get("/:jobId", (req: Request, res: Response) => {
  try {
    const job = getCrawlJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

crawlRouter.post("/:jobId/confirm", async (req: Request, res: Response) => {
  try {
    const body = req.body as ConfirmBaselinesRequest;
    if (!Array.isArray(body.pageNames) || body.pageNames.length === 0) {
      res.status(400).json({ error: "pageNames array is required" });
      return;
    }

    const result = await confirmBaselines(req.params.jobId, body.pageNames);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});