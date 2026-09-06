import type { VercelRequest, VercelResponse } from "@vercel/node";
import { corsHeaders, loadConfig, saveConfig, getProject, PageConfig } from "./lib/config.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeaders(corsHeaders()).end();
    return;
  }
  try {
    const config = await loadConfig();
    const project = getProject(config, req.query.project as string | undefined);
    if (!project) {
      res.status(404).setHeaders(corsHeaders()).json({ error: "Project not found" });
      return;
    }

    if (req.method === "GET") {
      res.status(200).setHeaders(corsHeaders()).json(project.pages);
      return;
    }

    if (req.method === "POST") {
      const page: PageConfig = req.body;
      if (!page.name || !page.url) {
        res.status(400).setHeaders(corsHeaders()).json({ error: "name and url are required" });
        return;
      }
      if (project.pages.some((p) => p.name === page.name)) {
        res.status(409).setHeaders(corsHeaders()).json({ error: `Page "${page.name}" already exists` });
        return;
      }
      page.mask ??= [];
      project.pages.push(page);
      await saveConfig(config, `Add page ${page.name} via UI`);
      res.status(201).setHeaders(corsHeaders()).json(page);
      return;
    }

    if (req.method === "PUT") {
      const name = req.query.name as string;
      const idx = project.pages.findIndex((p) => p.name === name);
      if (idx === -1) {
        res.status(404).setHeaders(corsHeaders()).json({ error: `Page "${name}" not found` });
        return;
      }
      const newName = req.body.name || name;
      project.pages[idx] = { ...project.pages[idx], ...req.body, name: newName };
      await saveConfig(config, `Update page ${name} via UI`);
      res.status(200).setHeaders(corsHeaders()).json(project.pages[idx]);
      return;
    }

    if (req.method === "DELETE") {
      const name = req.query.name as string;
      const idx = project.pages.findIndex((p) => p.name === name);
      if (idx === -1) {
        res.status(404).setHeaders(corsHeaders()).json({ error: `Page "${name}" not found` });
        return;
      }
      project.pages.splice(idx, 1);
      await saveConfig(config, `Delete page ${name} via UI`);
      res.status(200).setHeaders(corsHeaders()).json({ deleted: name });
      return;
    }

    res.status(405).setHeaders(corsHeaders()).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).setHeaders(corsHeaders()).json({ error: (err as Error).message });
  }
}