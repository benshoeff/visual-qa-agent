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

interface PageConfig {
  name: string;
  url: string;
  waitForSelector?: string;
  mask?: string[];
  threshold?: number;
  captureMode?: "viewport" | "fullPage";
  fullPageScrollable?: string;
  fullPageKeepVisible?: string[];
  ignoreZones?: unknown[];
}

interface Config {
  pages: PageConfig[];
}

async function loadConfig(): Promise<Config> {
  const file = await getFileText("config.json");
  if (!file) throw new Error("config.json not found");
  return JSON.parse(file.content) as Config;
}

async function saveConfig(config: Config, message: string): Promise<void> {
  await commitFiles(
    [{ path: "config.json", content: JSON.stringify(config, null, 2) }],
    message
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeaders(corsHeaders()).end();
    return;
  }
  try {
    const config = await loadConfig();

    if (req.method === "GET") {
      res.status(200).setHeaders(corsHeaders()).json(config.pages);
      return;
    }

    if (req.method === "POST") {
      const page: PageConfig = req.body;
      if (!page.name || !page.url) {
        res.status(400).setHeaders(corsHeaders()).json({ error: "name and url are required" });
        return;
      }
      if (config.pages.some((p) => p.name === page.name)) {
        res.status(409).setHeaders(corsHeaders()).json({ error: `Page "${page.name}" already exists` });
        return;
      }
      page.mask ??= [];
      config.pages.push(page);
      await saveConfig(config, `Add page ${page.name} via UI`);
      res.status(201).setHeaders(corsHeaders()).json(page);
      return;
    }

    if (req.method === "PUT") {
      const name = req.query.name as string;
      const idx = config.pages.findIndex((p) => p.name === name);
      if (idx === -1) {
        res.status(404).setHeaders(corsHeaders()).json({ error: `Page "${name}" not found` });
        return;
      }
      const newName = req.body.name || name;
      config.pages[idx] = { ...config.pages[idx], ...req.body, name: newName };
      await saveConfig(config, `Update page ${name} via UI`);
      res.status(200).setHeaders(corsHeaders()).json(config.pages[idx]);
      return;
    }

    if (req.method === "DELETE") {
      const name = req.query.name as string;
      const idx = config.pages.findIndex((p) => p.name === name);
      if (idx === -1) {
        res.status(404).setHeaders(corsHeaders()).json({ error: `Page "${name}" not found` });
        return;
      }
      config.pages.splice(idx, 1);
      await saveConfig(config, `Delete page ${name} via UI`);
      res.status(200).setHeaders(corsHeaders()).json({ deleted: name });
      return;
    }

    res.status(405).setHeaders(corsHeaders()).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).setHeaders(corsHeaders()).json({ error: (err as Error).message });
  }
}
