import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parse as parseYaml } from "yaml";

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
  return (await res.json()) as T;
}

interface GitContent {
  encoding?: string;
  content?: string;
}

async function getFileText(path: string): Promise<string | null> {
  try {
    const data = await gh<GitContent>(`/repos/${repo()}/contents/${path}?ref=${branch()}`);
    if (!data.content) return null;
    return Buffer.from(data.content, "base64").toString("utf-8");
  } catch (err) {
    if ((err as Error).message.includes("404")) return null;
    throw err;
  }
}

function corsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  });
}

interface ScheduleDef {
  name: string;
  cron: string;
  mode: "baseline" | "test";
  enabled?: boolean;
  projectId?: string;
}

interface StatusEntry {
  lastRun?: number;
  status?: "pass" | "fail";
  projectId?: string;
}

async function loadSchedules(): Promise<ScheduleDef[]> {
  const file = await getFileText("schedules.yml");
  if (!file) return [];
  const doc = parseYaml(file) as { schedules?: ScheduleDef[] };
  return Array.isArray(doc?.schedules) ? doc.schedules : [];
}

async function loadStatus(): Promise<Record<string, StatusEntry>> {
  const file = await getFileText("schedules-status.json");
  if (!file) return {};
  return JSON.parse(file) as Record<string, StatusEntry>;
}

async function loadActiveProjectId(): Promise<string> {
  const file = await getFileText("config.json");
  if (!file) return "";
  try {
    const cfg = JSON.parse(file) as { activeProjectId?: unknown };
    return typeof cfg.activeProjectId === "string" ? cfg.activeProjectId : "";
  } catch {
    return "";
  }
}

// Status is stored per-project (`<projectId>::<name>`) so each project only ever
// sees its own schedule run history. Legacy name-only entries act as a fallback.
function statusKey(projectId: string, name: string): string {
  return `${projectId || "__active__"}::${name}`;
}

// Read-only: schedules are defined only in schedules.yml. The UI just displays
// the definitions plus the latest run facts recorded by the workflow.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeaders(corsHeaders()).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).setHeaders(corsHeaders()).json({ error: "Method not allowed" });
    return;
  }

  try {
    const [defs, statuses, activeId] = await Promise.all([
      loadSchedules(),
      loadStatus(),
      loadActiveProjectId(),
    ]);
    const result = defs.map((s) => {
      const projectId = s.projectId ?? activeId;
      const st = statuses[statusKey(projectId, s.name)] ?? statuses[s.name] ?? {};
      return {
        name: s.name,
        cronExpression: s.cron,
        mode: s.mode,
        enabled: s.enabled ?? true,
        ...(s.projectId ? { projectId: s.projectId } : {}),
        lastRun: st.lastRun ?? null,
        status: st.status ?? "pending",
      };
    });
    res.status(200).setHeaders(corsHeaders()).json(result);
  } catch (err) {
    res.status(500).setHeaders(corsHeaders()).json({ error: (err as Error).message });
  }
}