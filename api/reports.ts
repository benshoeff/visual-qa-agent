import type { VercelRequest, VercelResponse } from "@vercel/node";
import { corsHeaders, listGitDirectory, loadConfig, getProject } from "./lib/config.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeaders(corsHeaders()).end();
    return;
  }
  try {
    const config = await loadConfig();
    const project = getProject(config, req.query.project as string | undefined);
    const projectId = project ? project.id : "default";

    let files: string[];
    try {
      files = await listGitDirectory(`reports/${projectId}`);
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