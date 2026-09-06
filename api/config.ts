import type { VercelRequest, VercelResponse } from "@vercel/node";
import { corsHeaders, loadConfig, saveConfig, getProject } from "./lib/config.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeaders(corsHeaders()).end();
    return;
  }
  try {
    if (req.method === "GET") {
      const config = await loadConfig();
      res.status(200).setHeaders(corsHeaders()).json(config);
      return;
    }

    if (req.method === "PATCH" || req.method === "POST") {
      const config = await loadConfig();
      const body = req.body ?? {};
      const { ai, browsers, performance, activeProjectId, viewport, threshold, waitFor } = body;
      if (ai) config.ai = { ...(config.ai as object), ...ai };
      if (browsers) config.browsers = browsers;
      if (performance) config.performance = { ...(config.performance as object), ...performance };
      if (activeProjectId && config.projects.some((p) => p.id === activeProjectId)) {
        config.activeProjectId = activeProjectId;
      }
      const project = req.query.project
        ? getProject(config, req.query.project as string)
        : getProject(config, config.activeProjectId);
      if (project) {
        if (viewport) project.viewport = viewport;
        if (threshold !== undefined) project.threshold = threshold;
        if (waitFor) project.waitFor = waitFor;
      }
      await saveConfig(config, "Update config via UI");
      res.status(200).setHeaders(corsHeaders()).json(config);
      return;
    }

    res.status(405).setHeaders(corsHeaders()).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).setHeaders(corsHeaders()).json({ error: (err as Error).message });
  }
}