const API = "https://api.github.com";

function repo(): string {
  return process.env.GITHUB_REPO ?? "benshoeff/visual-qa-agent";
}

function branch(): string {
  return process.env.GITHUB_BRANCH ?? "main";
}

function headers(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN ?? "";
  return {
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "visual-qa-agent",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function gh<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...options, headers: new Headers(headers()) } as RequestInit);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 500)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface GitContent {
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

export async function getFileBuffer(path: string): Promise<Buffer | null> {
  try {
    const data = await gh<GitContent>(`/repos/${repo()}/contents/${path}?ref=${branch()}`);
    if (!data.content) return null;
    return Buffer.from(data.content, "base64");
  } catch (err) {
    if ((err as Error).message.includes("404")) return null;
    throw err;
  }
}

export async function listDirectory(path: string): Promise<string[]> {
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

export async function dispatchWorkflow(inputs: Record<string, unknown>): Promise<void> {
  const workflowFile = process.env.WORKFLOW_FILE ?? "visual-qa.yml";
  await gh(`/repos/${repo()}/actions/workflows/${workflowFile}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: branch(), inputs }),
  });
}

export interface WorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  head_branch: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  run_number: number;
}

export async function getLatestRuns(limit = 5): Promise<WorkflowRun[]> {
  const workflowFile = process.env.WORKFLOW_FILE ?? "visual-qa.yml";
  const data = await gh<{ workflow_runs: WorkflowRun[] }>(
    `/repos/${repo()}/actions/workflows/${workflowFile}/runs?branch=${branch()}&per_page=${limit}`
  );
  return data.workflow_runs;
}

export function corsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  });
}
