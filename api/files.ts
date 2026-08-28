import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getFileBuffer, getFileText, corsHeaders } from "./_lib/github";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeaders(corsHeaders()).end();
    return;
  }
  try {
    const type = req.query.type as string; // baseline | current | diff | report
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
