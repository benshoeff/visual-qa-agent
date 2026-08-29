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

async function listDirectory(path: string): Promise<string[]> {
  const data = await gh<Array<{ name: string; type: string }>>(`/repos/${repo()}/contents/${path}?ref=${branch()}`);
  return data.map((f) => f.name);
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
    let files: string[];
    try {
      files = await listDirectory("reports");
    } catch {
      files = [];
    }

    const reports = files
      .filter((f) => f.endsWith(".html"))
      .map((f) => {
        const ts = parseTimestamp(f);
        return { filename: f, timestamp: ts, size: 0 };
      })
      .sort((a, b) => b.timestamp - a.timestamp);

    res.status(200).setHeaders(corsHeaders()).json(reports);
  } catch (err) {
    res.status(500).setHeaders(corsHeaders()).json({ error: (err as Error).message });
  }
}

function parseTimestamp(filename: string): number {
  const match = filename.match(/report-(\d+)\.html/);
  if (match) return parseInt(match[1], 10);
  return 0;
}
