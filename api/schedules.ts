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

function corsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  });
}

// Reflects the Schedule type from the serverless workflow consumer.
interface Schedule {
  id: string;
  name: string;
  cronExpression: string;
  mode: "baseline" | "test";
  enabled: boolean;
  createdAt: number;
  lastRun: number | null;
}

async function loadSchedules(): Promise<Schedule[]> {
  const file = await getFileText("schedules.json");
  if (!file) return [];
  return JSON.parse(file.content) as Schedule[];
}

async function saveSchedules(schedules: Schedule[], message: string): Promise<void> {
  await commitFiles(
    [{ path: "schedules.json", content: JSON.stringify(schedules, null, 2) }],
    message
  );
}

function isValidCron(cronExpression: string): boolean {
  // 5-field cron: minute hour day month day-of-week
  return /^(\*|[0-9]+)(\s+(\*|[0-9]+)){4}$/.test(cronExpression.trim());
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeaders(corsHeaders()).end();
    return;
  }
  try {
    const schedules = await loadSchedules();

    if (req.method === "GET") {
      res.status(200).setHeaders(corsHeaders()).json(schedules);
      return;
    }

    if (req.method === "POST") {
      const { name, cronExpression, mode, enabled } = req.body ?? {};
      if (!name || !cronExpression || !mode) {
        res.status(400).setHeaders(corsHeaders()).json({ error: "name, cronExpression, and mode are required" });
        return;
      }
      if (!isValidCron(cronExpression)) {
        res.status(400).setHeaders(corsHeaders()).json({ error: "Invalid cron expression" });
        return;
      }
      const schedule: Schedule = {
        id: crypto.randomUUID(),
        name,
        cronExpression,
        mode,
        enabled: enabled ?? true,
        createdAt: Date.now(),
        lastRun: null,
      };
      schedules.push(schedule);
      await saveSchedules(schedules, `Add schedule ${name} via UI`);
      res.status(201).setHeaders(corsHeaders()).json(schedule);
      return;
    }

    if (req.method === "PUT") {
      const id = req.query.id as string;
      const idx = schedules.findIndex((s) => s.id === id);
      if (idx === -1) {
        res.status(404).setHeaders(corsHeaders()).json({ error: "Schedule not found" });
        return;
      }
      const updates = req.body ?? {};
      if (updates.cronExpression && !isValidCron(updates.cronExpression)) {
        res.status(400).setHeaders(corsHeaders()).json({ error: "Invalid cron expression" });
        return;
      }
      schedules[idx] = { ...schedules[idx], ...updates, id };
      await saveSchedules(schedules, `Update schedule ${schedules[idx].name} via UI`);
      res.status(200).setHeaders(corsHeaders()).json(schedules[idx]);
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id as string;
      const idx = schedules.findIndex((s) => s.id === id);
      if (idx === -1) {
        res.status(404).setHeaders(corsHeaders()).json({ error: "Schedule not found" });
        return;
      }
      const [removed] = schedules.splice(idx, 1);
      await saveSchedules(schedules, `Delete schedule ${removed.name} via UI`);
      res.status(200).setHeaders(corsHeaders()).json({ deleted: true });
      return;
    }

    res.status(405).setHeaders(corsHeaders()).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).setHeaders(corsHeaders()).json({ error: (err as Error).message });
  }
}
