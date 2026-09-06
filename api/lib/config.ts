const API = "https://api.github.com";

export function repo(): string {
  return process.env.GITHUB_REPO ?? "benshoeff/visual-qa-agent";
}

export function branch(): string {
  return process.env.GITHUB_BRANCH ?? "main";
}

export function ghHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN ?? "";
  return {
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "visual-qa-agent",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function gh<T>(path: string, options: RequestInit = {}): Promise<T> {
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

export async function getFileText(path: string): Promise<{ content: string; sha?: string } | null> {
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

export async function getRawContent(path: string): Promise<string | null> {
  const data = await gh<GitContent>(`/repos/${repo()}/contents/${path}?ref=${branch()}`);
  if (data.content) return Buffer.from(data.content, "base64").toString("utf-8");
  // Files larger than 1MB: contents API returns empty content. Fetch the blob directly.
  if (data.sha) {
    const blob = await gh<GitContent>(`/repos/${repo()}/git/blobs/${data.sha}`);
    if (blob.content) return Buffer.from(blob.content, "base64").toString("utf-8");
  }
  return null;
}

export async function getFileBuffer(path: string): Promise<Buffer | null> {
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

export async function listGitDirectory(path: string): Promise<string[]> {
  const data = await gh<Array<{ name: string; type: string }>>(`/repos/${repo()}/contents/${path}?ref=${branch()}`);
  return data.map((f) => f.name);
}

export async function commitFiles(
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

export function corsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  });
}

export interface IgnoreZone {
  id: string;
  selector: string;
  reason?: string;
}

export interface PageConfig {
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

export interface ProjectConfig {
  id: string;
  name: string;
  baseUrl: string;
  viewport: { width: number; height: number };
  threshold: number;
  waitFor: string;
  pages: PageConfig[];
  globalIgnoreZones: IgnoreZone[];
  fullPage: { defaultMode: string; maxHeight: number };
  createdAt?: number;
  updatedAt?: number;
}

export interface AppConfig {
  version?: number;
  activeProjectId: string;
  projects: ProjectConfig[];
  ai?: unknown;
  browsers?: unknown[];
  performance?: unknown;
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export function normalizeConfig(raw: any): AppConfig {
  if (Array.isArray(raw.projects)) {
    const projects = (raw.projects as ProjectConfig[]).map((p) => ({
      ...p,
      viewport: p.viewport ?? { width: 1280, height: 720 },
      threshold: p.threshold ?? 0.2,
      waitFor: p.waitFor ?? "networkidle",
      pages: p.pages ?? [],
      globalIgnoreZones: p.globalIgnoreZones ?? [],
    }));
    const activeProjectId =
      projects.some((p) => p.id === raw.activeProjectId)
        ? raw.activeProjectId
        : projects[0]?.id ?? "";
    return {
      version: 2,
      activeProjectId,
      projects,
      ai: raw.ai,
      browsers: raw.browsers,
      performance: raw.performance,
    };
  }

  // v1 (legacy flat config) -> migrate to a single default project
  const legacy = raw as Record<string, any> & { pages?: PageConfig[] };
  const baseUrl = legacy.pages?.[0]?.url ? safeOrigin(legacy.pages[0].url) : "";
  const project: ProjectConfig = {
    id: "default",
    name: legacy.name ?? (baseUrl ? new URL(baseUrl).hostname : "Default Project"),
    baseUrl,
    viewport: legacy.viewport ?? { width: 1280, height: 720 },
    threshold: legacy.threshold ?? 0.2,
    waitFor: legacy.waitFor ?? "networkidle",
    pages: legacy.pages ?? [],
    globalIgnoreZones: legacy.globalIgnoreZones ?? [],
    fullPage: legacy.fullPage,
  };
  return {
    version: 2,
    activeProjectId: project.id,
    projects: [project],
    ai: legacy.ai,
    browsers: legacy.browsers,
    performance: legacy.performance,
  };
}

export async function loadConfig(): Promise<AppConfig> {
  const file = await getFileText("config.json");
  if (!file) throw new Error("config.json not found in repo");
  return normalizeConfig(JSON.parse(file.content));
}

export async function saveConfig(config: AppConfig, message: string): Promise<void> {
  await commitFiles(
    [{ path: "config.json", content: JSON.stringify(config, null, 2) }],
    message
  );
}

export function resolveProjectId(config: AppConfig, requested?: string): string {
  const id = requested?.trim();
  if (id && config.projects.some((p) => p.id === id)) return id;
  if (config.projects.some((p) => p.id === config.activeProjectId)) return config.activeProjectId;
  return config.projects[0]?.id ?? "";
}

export function getProject(config: AppConfig, requested?: string): ProjectConfig | undefined {
  const id = resolveProjectId(config, requested);
  return config.projects.find((p) => p.id === id);
}

export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export function ensureUniqueProjectId(config: AppConfig, desired: string): string {
  let id = slugify(desired) || "project";
  if (config.projects.some((p) => p.id === id)) {
    id = `${id}-${Date.now().toString(36).slice(-4)}`;
  }
  return id;
}