import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getFileText,
  commitFiles,
  corsHeaders,
} from "./_lib/github";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeaders(corsHeaders()).end();
    return;
  }
  try {
    if (req.method === "GET") {
      const file = await getFileText("config.json");
      if (!file) {
        res.status(500).setHeaders(corsHeaders()).json({ error: "config.json not found in repo" });
        return;
      }
      res.status(200).setHeaders(corsHeaders()).json(JSON.parse(file.content));
      return;
    }

    if (req.method === "PATCH" || req.method === "POST") {
      const existing = await getFileText("config.json");
      if (!existing) {
        res.status(500).setHeaders(corsHeaders()).json({ error: "config.json not found" });
        return;
      }
      const current = JSON.parse(existing.content);
      const next = { ...current, ...req.body };
      await commitFiles(
        [{ path: "config.json", content: JSON.stringify(next, null, 2) }],
        "Update config via UI"
      );
      res.status(200).setHeaders(corsHeaders()).json(next);
      return;
    }

    res.status(405).setHeaders(corsHeaders()).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).setHeaders(corsHeaders()).json({ error: (err as Error).message });
  }
}
