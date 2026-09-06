import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  corsHeaders,
  loadConfig,
  saveConfig,
  getProject,
  ProjectConfig,
  ensureUniqueProjectId,
} from "./lib/config.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeaders(corsHeaders()).end();
    return;
  }
  try {
    const config = await loadConfig();

    if (req.method === "GET") {
      res.status(200).setHeaders(corsHeaders()).json({
        activeProjectId: config.activeProjectId,
        projects: config.projects,
      });
      return;
    }

    if (req.method === "POST" && req.query.confirm === "true") {
      const id = req.query.id as string;
      const project = getProject(config, id);
      if (!project) {
        res.status(404).setHeaders(corsHeaders()).json({ error: `Project "${id ?? ""}" not found` });
        return;
      }
      config.activeProjectId = project.id;
      await saveConfig(config, `Activate project ${project.name} via UI`);
      res.status(200).setHeaders(corsHeaders()).json({ activeProjectId: config.activeProjectId });
      return;
    }

    if (req.method === "POST") {
      const body = req.body ?? {};
      const { name, baseUrl } = body;
      if (!name || !baseUrl) {
        res.status(400).setHeaders(corsHeaders()).json({ error: "name and baseUrl are required" });
        return;
      }
      const project: ProjectConfig = {
        id: ensureUniqueProjectId(config, name),
        name,
        baseUrl,
        viewport: body.viewport ?? { width: 1280, height: 720 },
        threshold: body.threshold ?? 0.2,
        waitFor: body.waitFor ?? "networkidle",
        pages: body.pages ?? [],
        globalIgnoreZones: [],
        fullPage: { defaultMode: "viewport", maxHeight: 20000 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      config.projects.push(project);
      await saveConfig(config, `Add project ${project.name} via UI`);
      res.status(201).setHeaders(corsHeaders()).json(project);
      return;
    }

    if (req.method === "PUT") {
      const id = req.query.id as string;
      const idx = config.projects.findIndex((p) => p.id === id);
      if (idx === -1) {
        res.status(404).setHeaders(corsHeaders()).json({ error: `Project "${id}" not found` });
        return;
      }
      const current = config.projects[idx];
      config.projects[idx] = {
        ...current,
        ...req.body,
        id: current.id,
        pages: req.body.pages ?? current.pages,
        updatedAt: Date.now(),
      };
      await saveConfig(config, `Update project ${current.name} via UI`);
      res.status(200).setHeaders(corsHeaders()).json(config.projects[idx]);
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id as string;
      const idx = config.projects.findIndex((p) => p.id === id);
      if (idx === -1) {
        res.status(404).setHeaders(corsHeaders()).json({ error: `Project "${id}" not found` });
        return;
      }
      const [removed] = config.projects.splice(idx, 1);
      if (config.activeProjectId === id) {
        config.activeProjectId = config.projects[0]?.id ?? "";
      }
      await saveConfig(config, `Delete project ${removed.name} via UI`);
      res.status(200).setHeaders(corsHeaders()).json({ deleted: id });
      return;
    }

    res.status(405).setHeaders(corsHeaders()).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).setHeaders(corsHeaders()).json({ error: (err as Error).message });
  }
}