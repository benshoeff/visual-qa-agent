import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getFileText, commitFiles, corsHeaders } from "../serverless/github";

interface PageConfig {
  name: string;
  url: string;
  waitForSelector?: string;
  mask?: string[];
  threshold?: number;
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
