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

async function getRawContent(path: string): Promise<string | null> {
  const data = await gh<GitContent>(`/repos/${repo()}/contents/${path}?ref=${branch()}`);
  if (data.content) return Buffer.from(data.content, "base64").toString("utf-8");
  // Files larger than 1MB: contents API returns empty content. Fetch the blob directly.
  if (data.sha) {
    const blob = await gh<GitContent>(`/repos/${repo()}/git/blobs/${data.sha}`);
    if (blob.content) return Buffer.from(blob.content, "base64").toString("utf-8");
  }
  return null;
}

async function getFileText(path: string): Promise<{ content: string; sha?: string } | null> {
  try {
    const content = await getRawContent(path);
    if (content === null) return null;
    return { content, sha: undefined };
  } catch (err) {
    if ((err as Error).message.includes("404")) return null;
    throw err;
  }
}

async function getFileBuffer(path: string): Promise<Buffer | null> {
  try {
    const data = await gh<GitContent>(`/repos/${repo()}/contents/${path}?ref=${branch()}`);
    if (data.content) return Buffer.from(data.content, "base64");
    // Files larger than 1MB: contents API returns empty content. Fetch the blob directly.
    if (data.sha) {
      const blob = await gh<GitContent>(`/repos/${repo()}/git/blobs/${data.sha}`);
      if (blob.content) return Buffer.from(blob.content, "base64");
    }
    return null;
  } catch (err) {
    if ((err as Error).message.includes("404")) return null;
    throw err;
  }
}

function corsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeaders(corsHeaders()).end();
    return;
  }
  try {
    const type = req.query.type as string; // baseline | current | diff | regions | report
    const name = req.query.name as string;
    if (!type || !name) {
      res.status(400).setHeaders(corsHeaders()).json({ error: "type and name are required" });
      return;
    }

    if (type === "report") {
      const file = await getFileText(`reports/${name}`);
      if (!file) {
        res.status(404).setHeaders(corsHeaders()).json({ error: "Report not found" });
        return;
      }
      res
        .status(200)
        .setHeader("Content-Type", "text/html; charset=utf-8")
        .setHeader("Access-Control-Allow-Origin", "*")
        .send(file.content);
      return;
    }

    if (type === "regions") {
      const file = await getFileText(`diffs/${name}.regions.json`);
      if (!file) {
        res.status(404).setHeaders(corsHeaders()).json({ error: "Diff regions not found" });
        return;
      }
      res
        .status(200)
        .setHeader("Content-Type", "application/json")
        .setHeader("Access-Control-Allow-Origin", "*")
        .send(file.content);
      return;
    }

    const dir = typesToDir(type);
    const buff = await getFileBuffer(`${dir}/${name}.png`);
    if (!buff) {
      res.status(404).setHeaders(corsHeaders()).json({ error: "Image not found" });
      return;
    }
    res
      .status(200)
      .setHeader("Content-Type", "image/png")
      .setHeader("Cache-Control", "public, max-age=60")
      .setHeader("Access-Control-Allow-Origin", "*")
      .send(buff);
  } catch (err) {
    res.status(500).setHeaders(corsHeaders()).json({ error: (err as Error).message });
  }
}

function typesToDir(type: string): string {
  switch (type) {
    case "current":
      return "current";
    case "diff":
      return "diffs";
    default:
      return "baselines";
  }
}
