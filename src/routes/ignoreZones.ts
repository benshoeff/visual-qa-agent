import { Router, Request, Response } from "express";
import crypto from "crypto";
import { readConfig, writeConfig, IgnoreZone } from "../config.js";

export const ignoreZonesRouter = Router();

// ─── List all (global + per-page), used by the UI overview ──────────────

ignoreZonesRouter.get("/", (req: Request, res: Response) => {
  try {
    const config = readConfig();

    // ?page=<name> returns a flat array for a single page
    const pageName = req.query.page as string | undefined;
    if (pageName) {
      const page = config.pages.find((p) => p.name === pageName);
      if (!page) {
        res.status(404).json({ error: `Page "${pageName}" not found` });
        return;
      }
      res.json(page.ignoreZones ?? []);
      return;
    }

    const pages: Record<string, IgnoreZone[]> = {};
    for (const p of config.pages) {
      pages[p.name] = p.ignoreZones ?? [];
    }
    res.json({
      global: config.globalIgnoreZones ?? [],
      pages,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Global Ignore Zones ──────────────────────────────────────────────────

ignoreZonesRouter.get("/global", (_req: Request, res: Response) => {
  try {
    const config = readConfig();
    res.json(config.globalIgnoreZones ?? []);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

ignoreZonesRouter.post("/global", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const zone: IgnoreZone = {
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
    config.globalIgnoreZones = config.globalIgnoreZones ?? [];
    config.globalIgnoreZones.push(zone);
    writeConfig(config);
    res.status(201).json(zone);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

ignoreZonesRouter.put("/global/:id", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const zones = config.globalIgnoreZones ?? [];
    const idx = zones.findIndex((z) => z.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "Ignore zone not found" });
      return;
    }
    zones[idx] = { ...zones[idx], ...req.body, id: zones[idx].id };
    config.globalIgnoreZones = zones;
    writeConfig(config);
    res.json(zones[idx]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

ignoreZonesRouter.delete("/global/:id", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const zones = config.globalIgnoreZones ?? [];
    const idx = zones.findIndex((z) => z.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "Ignore zone not found" });
      return;
    }
    zones.splice(idx, 1);
    config.globalIgnoreZones = zones;
    writeConfig(config);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Per-Page Ignore Zones ────────────────────────────────────────────────

ignoreZonesRouter.get("/page/:name", (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const page = config.pages.find((p) => p.name === req.params.name);
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
    const page = config.pages.find((p) => p.name === req.params.name);
    if (!page) {
      res.status(404).json({ error: `Page "${req.params.name}" not found` });
      return;
    }
    const zone: IgnoreZone = {
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
    const page = config.pages.find((p) => p.name === req.params.name);
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
    const page = config.pages.find((p) => p.name === req.params.name);
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
