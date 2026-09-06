import { Router, Request, Response } from "express";
import crypto from "crypto";
import { readConfig, writeConfig, IgnoreZone, ProjectConfig, Config, getProject } from "../config.js";

function resolveProject(req: Request, config?: Config): ProjectConfig | null {
  return getProject(config ?? readConfig(), req.query.project as string | undefined) ?? null;
}

function makeZone(req: Request): IgnoreZone {
  return {
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
}

function resolveTarget(
  req: Request,
  project: ProjectConfig
): { zones: IgnoreZone[] } & { set: (z: IgnoreZone[]) => void } | null {
  const pageName = (req.query.page as string | undefined) ?? (req.body?.pageName as string | undefined);
  if (pageName) {
    const page = project.pages.find((p) => p.name === pageName);
    if (!page) return null;
    return {
      zones: page.ignoreZones ?? [],
      set: (z) => (page.ignoreZones = z),
    };
  }
  return {
    zones: project.globalIgnoreZones ?? [],
    set: (z) => (project.globalIgnoreZones = z),
  };
}

export const ignoreZonesRouter = Router();

// ─── List (overview shape) ───────────────────────────────────────────────

ignoreZonesRouter.get("/", (req: Request, res: Response) => {
  try {
    const project = resolveProject(req);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // ?page=<name> returns a flat array for a single page
    const pageName = req.query.page as string | undefined;
    if (pageName) {
      const page = project.pages.find((p) => p.name === pageName);
      if (!page) {
        res.status(404).json({ error: `Page "${pageName}" not found` });
        return;
      }
      res.json(page.ignoreZones ?? []);
      return;
    }

    const pages: Record<string, IgnoreZone[]> = {};
    for (const p of project.pages) {
      pages[p.name] = p.ignoreZones ?? [];
    }
    res.json({
      global: project.globalIgnoreZones ?? [],
      pages,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Create ───────────────────────────────────────────────────────────────

ignoreZonesRouter.post("/", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const target = resolveTarget(req, project);
    if (!target) {
      res.status(404).json({ error: "Page not found" });
      return;
    }
    const zone = makeZone(req);
    target.set([...target.zones, zone]);
    writeConfig(config);
    res.status(201).json(zone);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Update / delete by zone id (?page= optional, ?project= optional) ────

ignoreZonesRouter.put("/:id", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const target = resolveTarget(req, project);
    if (!target) {
      res.status(404).json({ error: "Page not found" });
      return;
    }
    const zones = target.zones;
    const idx = zones.findIndex((z) => z.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "Ignore zone not found" });
      return;
    }
    zones[idx] = { ...zones[idx], ...req.body, id: zones[idx].id };
    target.set(zones);
    writeConfig(config);
    res.json(zones[idx]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

ignoreZonesRouter.delete("/:id", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const target = resolveTarget(req, project);
    if (!target) {
      res.status(404).json({ error: "Page not found" });
      return;
    }
    const zones = target.zones;
    const idx = zones.findIndex((z) => z.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "Ignore zone not found" });
      return;
    }
    zones.splice(idx, 1);
    target.set(zones);
    writeConfig(config);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Legacy /global and /page/:name path shapes (kept for compatibility) ─

ignoreZonesRouter.get("/global", (req: Request, res: Response) => {
  try {
    const project = resolveProject(req);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(project.globalIgnoreZones ?? []);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

ignoreZonesRouter.post("/global", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const zone = makeZone(req);
    project.globalIgnoreZones = project.globalIgnoreZones ?? [];
    project.globalIgnoreZones.push(zone);
    writeConfig(config);
    res.status(201).json(zone);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

ignoreZonesRouter.put("/global/:id", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const zones = project.globalIgnoreZones ?? [];
    const idx = zones.findIndex((z) => z.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "Ignore zone not found" });
      return;
    }
    zones[idx] = { ...zones[idx], ...req.body, id: zones[idx].id };
    project.globalIgnoreZones = zones;
    writeConfig(config);
    res.json(zones[idx]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

ignoreZonesRouter.delete("/global/:id", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const zones = project.globalIgnoreZones ?? [];
    const idx = zones.findIndex((z) => z.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "Ignore zone not found" });
      return;
    }
    zones.splice(idx, 1);
    project.globalIgnoreZones = zones;
    writeConfig(config);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

ignoreZonesRouter.get("/page/:name", (req: Request, res: Response) => {
  try {
    const project = resolveProject(req);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const page = project.pages.find((p) => p.name === req.params.name);
    if (!page) {
      res.status(404).json({ error: `Page "${req.params.name}" not found` });
      return;
    }
    res.json(page.ignoreZones ?? []);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

ignoreZonesRouter.post("/page/:name", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const page = project.pages.find((p) => p.name === req.params.name);
    if (!page) {
      res.status(404).json({ error: `Page "${req.params.name}" not found` });
      return;
    }
    const zone = makeZone(req);
    page.ignoreZones = page.ignoreZones ?? [];
    page.ignoreZones.push(zone);
    writeConfig(config);
    res.status(201).json(zone);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

ignoreZonesRouter.put("/page/:name/:id", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const page = project.pages.find((p) => p.name === req.params.name);
    if (!page) {
      res.status(404).json({ error: `Page "${req.params.name}" not found` });
      return;
    }
    const zones = page.ignoreZones ?? [];
    const idx = zones.findIndex((z) => z.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "Ignore zone not found" });
      return;
    }
    zones[idx] = { ...zones[idx], ...req.body, id: zones[idx].id };
    page.ignoreZones = zones;
    writeConfig(config);
    res.json(zones[idx]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

ignoreZonesRouter.delete("/page/:name/:id", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const project = resolveProject(req, config);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const page = project.pages.find((p) => p.name === req.params.name);
    if (!page) {
      res.status(404).json({ error: `Page "${req.params.name}" not found` });
      return;
    }
    const zones = page.ignoreZones ?? [];
    const idx = zones.findIndex((z) => z.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "Ignore zone not found" });
      return;
    }
    zones.splice(idx, 1);
    page.ignoreZones = zones;
    writeConfig(config);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});