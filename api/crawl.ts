import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getFileText,
  commitFiles,
  dispatchWorkflow,
  corsHeaders,
} from "./_lib/github";

interface DiscoveredPage {
  url: string;
  name: string;
  depth: number;
  parentUrl?: string;
}

interface CrawlJobFile {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  startUrl: string;
  discoveredPages: DiscoveredPage[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

async function readJob(id: string): Promise<CrawlJobFile | null> {
  const file = await getFileText(`${jobPath(id)}`);
  if (!file) return null;
  return JSON.parse(file.content) as CrawlJobFile;
}

function jobPath(id: string): string {
  return `crawl-results/${id}.json`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeaders(corsHeaders()).end();
    return;
  }
  try {
    // POST /api/crawl -> dispatch crawl workflow
    if (req.method === "POST") {
      const { url, config, autoCaptureBaseline } = req.body ?? {};
      if (!url) {
        res.status(400).setHeaders(corsHeaders()).json({ error: "url is required" });
        return;
      }
      const jobId = crypto.randomUUID();
      await dispatchWorkflow({
        mode: "crawl",
        url,
        crawl_config: config ? JSON.stringify(config) : "",
        auto_capture_baseline: autoCaptureBaseline === false ? "false" : "true",
        job_id: jobId,
      });
      res.status(202).setHeaders(corsHeaders()).json({ jobId, status: "pending" });
      return;
    }

    // GET /api/crawl -> list jobs
    if (req.method === "GET") {
      const id = req.query.id as string;
      if (id) {
        const job = await readJob(id);
        if (!job) {
          res.status(404).setHeaders(corsHeaders()).json({ error: "Job not found" });
          return;
        }
        res.status(200).setHeaders(corsHeaders()).json(job);
        return;
      }

      const all = ["discoveredPages"];
      void all;
      // Simplest: return the latest job by scanning updates is not possible cheaply.
      // Return an empty list here; UI uses per-job status via dispatch success + polling.
      res.status(200).setHeaders(corsHeaders()).json([]);
      return;
    }

    // POST /api/crawl/:jobId/confirm -> promote discovered pages into config.json
    if (req.method === "POST" && req.query.confirm === "true") {
      const id = req.query.id as string;
      if (!id) {
        res.status(400).setHeaders(corsHeaders()).json({ error: "id is required" });
        return;
      }
      const job = await readJob(id);
      if (!job) {
        res.status(404).setHeaders(corsHeaders()).json({ error: "Job not found" });
        return;
      }
      const { pageNames } = req.body ?? {};
      if (!Array.isArray(pageNames) || pageNames.length === 0) {
        res.status(400).setHeaders(corsHeaders()).json({ error: "pageNames array is required" });
        return;
      }

      const configFile = await getFileText("config.json");
      if (!configFile) {
        res.status(500).setHeaders(corsHeaders()).json({ error: "config.json not found" });
        return;
      }
      const config = JSON.parse(configFile.content);
      config.pages ??= [];

      let added = 0;
      let skipped = 0;
      for (const pageName of pageNames) {
        const dp = job.discoveredPages.find((p) => p.name === pageName);
        if (!dp) { skipped++; continue; }
        if ((config.pages as Array<{ name: string }>).some((p) => p.name === pageName)) { skipped++; continue; }
        config.pages.push({
          name: dp.name,
          url: dp.url,
          waitForSelector: undefined,
          mask: [],
          threshold: config.threshold,
        });
        added++;
      }
      if (added > 0) {
        await commitFiles(
          [{ path: "config.json", content: JSON.stringify(config, null, 2) }],
          `Confirm ${added} page(s) from crawl ${id} via UI`
        );
      }
      res.status(200).setHeaders(corsHeaders()).json({ added, skipped });
      return;
    }

    res.status(405).setHeaders(corsHeaders()).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).setHeaders(corsHeaders()).json({ error: (err as Error).message });
  }
}
