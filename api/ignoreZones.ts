import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

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
  content?: string;
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
  message: string
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
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
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
    const file = await getFileText("config.json");
    if (!file) {
      res.status(500).setHeaders(corsHeaders()).json({ error: "config.json not found" });
      return;
    }
    const config = JSON.parse(file.content);
    config.globalIgnoreZones = config.globalIgnoreZones ?? [];

    const url = new URL(req.url ?? "/", `https://${req.headers.host}`);
    const segments = url.pathname.replace(/^\/api\/ignore-zones\/?/, "").split("/").filter(Boolean);

    // GET /api/ignore-zones
    if (req.method === "GET" && segments.length === 0) {
      const pageName = url.searchParams.get("page");
      if (pageName) {
        const page = config.pages?.find((p: any) => p.name === pageName);
        res.status(200).setHeaders(corsHeaders()).json(page?.ignoreZones ?? []);
      } else {
        res.status(200).setHeaders(corsHeaders()).json({
          global: config.globalIgnoreZones,
          pages: Object.fromEntries(
            (config.pages ?? []).map((p: any) => [p.name, p.ignoreZones ?? []])
          ),
        });
      }
      return;
    }

    // POST /api/ignore-zones  (create global or per-page)
    if (req.method === "POST") {
      const zone = {
        id: crypto.randomUUID(),
        name: req.body.name ?? "Untitled Zone",
        type: req.body.type ?? "bounding-box",
        x: req.body.x,
        y: req.body.y,
        width: req.body.width,
        height: req.body.height,
        selector: req.body.selector,
        enabled: req.body.enabled ?? true,
      };

      if (req.body.pageName) {
        const page = config.pages?.find((p: any) => p.name === req.body.pageName);
        if (!page) {
          res.status(404).setHeaders(corsHeaders()).json({ error: `Page "${req.body.pageName}" not found` });
          return;
        }
        page.ignoreZones = page.ignoreZones ?? [];
        page.ignoreZones.push(zone);
      } else {
        config.globalIgnoreZones.push(zone);
      }

      await commitFiles(
        [{ path: "config.json", content: JSON.stringify(config, null, 2) }],
        `Add ignore zone: ${zone.name}`
      );
      res.status(201).setHeaders(corsHeaders()).json(zone);
      return;
    }

    // PUT /api/ignore-zones/:id
    if (req.method === "PUT" && segments.length === 1) {
      const id = segments[0];
      const pageName = url.searchParams.get("page");

      if (pageName) {
        const page = config.pages?.find((p: any) => p.name === pageName);
        if (!page) {
          res.status(404).setHeaders(corsHeaders()).json({ error: `Page "${pageName}" not found` });
          return;
        }
        const zones = page.ignoreZones ?? [];
        const idx = zones.findIndex((z: any) => z.id === id);
        if (idx === -1) {
          res.status(404).setHeaders(corsHeaders()).json({ error: "Zone not found" });
          return;
        }
        zones[idx] = { ...zones[idx], ...req.body, id };
        page.ignoreZones = zones;
      } else {
        const idx = config.globalIgnoreZones.findIndex((z: any) => z.id === id);
        if (idx === -1) {
          res.status(404).setHeaders(corsHeaders()).json({ error: "Zone not found" });
          return;
        }
        config.globalIgnoreZones[idx] = { ...config.globalIgnoreZones[idx], ...req.body, id };
      }

      await commitFiles(
        [{ path: "config.json", content: JSON.stringify(config, null, 2) }],
        `Update ignore zone ${id}`
      );
      res.status(200).setHeaders(corsHeaders()).json({ updated: true });
      return;
    }

    // DELETE /api/ignore-zones/:id
    if (req.method === "DELETE" && segments.length === 1) {
      const id = segments[0];
      const pageName = url.searchParams.get("page");

      if (pageName) {
        const page = config.pages?.find((p: any) => p.name === pageName);
        if (!page) {
          res.status(404).setHeaders(corsHeaders()).json({ error: `Page "${pageName}" not found` });
          return;
        }
        const zones = page.ignoreZones ?? [];
        const idx = zones.findIndex((z: any) => z.id === id);
        if (idx === -1) {
          res.status(404).setHeaders(corsHeaders()).json({ error: "Zone not found" });
          return;
        }
        zones.splice(idx, 1);
        page.ignoreZones = zones;
      } else {
        const idx = config.globalIgnoreZones.findIndex((z: any) => z.id === id);
        if (idx === -1) {
          res.status(404).setHeaders(corsHeaders()).json({ error: "Zone not found" });
          return;
        }
        config.globalIgnoreZones.splice(idx, 1);
      }

      await commitFiles(
        [{ path: "config.json", content: JSON.stringify(config, null, 2) }],
        `Delete ignore zone ${id}`
      );
      res.status(200).setHeaders(corsHeaders()).json({ deleted: true });
      return;
    }

    res.status(405).setHeaders(corsHeaders()).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).setHeaders(corsHeaders()).json({ error: (err as Error).message });
  }
}
