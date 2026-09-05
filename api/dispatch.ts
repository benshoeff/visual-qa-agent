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

async function dispatchWorkflow(inputs: Record<string, unknown>): Promise<void> {
  const workflowFile = process.env.WORKFLOW_FILE ?? "visual-qa.yml";
  await gh(`/repos/${repo()}/actions/workflows/${workflowFile}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: branch(), inputs }),
  });
}

interface WorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  head_branch: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  run_number: number;
}

async function getLatestRuns(limit = 5): Promise<WorkflowRun[]> {
  const workflowFile = process.env.WORKFLOW_FILE ?? "visual-qa.yml";
  const data = await gh<{ workflow_runs: WorkflowRun[] }>(
    `/repos/${repo()}/actions/workflows/${workflowFile}/runs?branch=${branch()}&per_page=${limit}`
  );
  return data.workflow_runs;
}

function corsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  });
}

interface DispatchInput {
  mode: "test" | "baseline" | "crawl";
  pages?: string[];
  url?: string;
  crawlConfig?: Record<string, unknown>;
  fullPageMode?: "page-default" | "viewport" | "fullPage";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeaders(corsHeaders()).end();
    return;
  }
  try {
    if (req.method === "POST") {
      const body = (req.body ?? {}) as DispatchInput;
      const mode = body.mode ?? "test";

      const inputs: Record<string, unknown> = { mode };
      if (Array.isArray(body.pages) && body.pages.length > 0) {
        inputs.pages = body.pages.join(",");
      }
      if (body.url) {
        inputs.url = body.url;
        inputs.crawl_config = body.crawlConfig ? JSON.stringify(body.crawlConfig) : "";
      }
      if (
        body.fullPageMode &&
        (body.fullPageMode === "viewport" || body.fullPageMode === "fullPage" || body.fullPageMode === "page-default")
      ) {
        inputs.fullpage_mode = body.fullPageMode;
      }

      await dispatchWorkflow(inputs);
      res.status(202).setHeaders(corsHeaders()).json({ success: true, message: `Dispatched ${mode} run` });
      return;
    }

    res.status(405).setHeaders(corsHeaders()).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).setHeaders(corsHeaders()).json({ error: (err as Error).message });
  }
}
