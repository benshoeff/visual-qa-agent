import type { VercelRequest, VercelResponse } from "@vercel/node";

const API = "https://api.github.com";

function repo(): string {
  return process.env.GITHUB_REPO ?? "benshoeff/visual-qa-agent";
}

function branch(): string {
  return process.env.GITHUB_BRANCH ?? "main";
}

function ghHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN ?? "";
  return {
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "visual-qa-agent",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function gh<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...options, headers: new Headers(ghHeaders()) } as RequestInit);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 500)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

interface GitContent {
  sha?: string;
  encoding?: string;
  content?: string;
  size?: number;
  type?: string;
}

async function getFileText(path: string): Promise<{ content: string; sha?: string } | null> {
  try {
    const data = await gh<GitContent>(`/repos/${repo()}/contents/${path}?ref=${branch()}`);
    if (!data.content) return null;
    return {
      content: Buffer.from(data.content, "base64").toString("utf-8"),
      sha: data.sha,
    };
  } catch (err) {
    if ((err as Error).message.includes("404")) return null;
    throw err;
  }
}

async function commitFiles(
  changes: Array<{ path: string; content: string }>,
  message: string,
  deletePaths: string[] = []
): Promise<void> {
  const refData = await gh<{ object: { sha: string } }>(`/repos/${repo()}/git/ref/heads/${branch()}`);
  const baseSha = refData.object.sha;

  const treeItems = [];
  for (const change of changes) {
    const blob = await gh<{ sha: string }>(`/repos/${repo()}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: change.content, encoding: "utf-8" }),
    });
    treeItems.push({ path: change.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  for (const del of deletePaths) {
    treeItems.push({ path: del, mode: "100644", type: "blob", sha: null });
  }

  const tree = await gh<{ sha: string }>(`/repos/${repo()}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseSha, tree: treeItems }),
  });

  const commit = await gh<{ sha: string }>(`/repos/${repo()}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [baseSha] }),
  });

  await gh(`/repos/${repo()}/git/refs/heads/${branch()}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
}

async function dispatchWorkflow(inputs: Record<string, unknown>): Promise<void> {
  const workflowFile = process.env.WORKFLOW_FILE ?? "visual-qa.yml";
  await gh(`/repos/${repo()}/actions/workflows/${workflowFile}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: branch(), inputs }),
  });
}

function corsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  });
}

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
    if (req.method === "POST" && req.query.confirm !== "true") {
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
