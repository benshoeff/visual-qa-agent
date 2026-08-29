import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dispatchWorkflow, getLatestRuns, corsHeaders } from "./lib/github";

interface DispatchInput {
  mode: "test" | "baseline" | "crawl";
  pages?: string[];
  url?: string;
  crawlConfig?: Record<string, unknown>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeaders(corsHeaders()).end();
    return;
  }
  try {
    if (req.method === "POST") {
      const body = (req.body ?? {}) as DispatchInput;
      const mode = body.mode ?? "test";

      const inputs: Record<string, unknown> = { mode };
      if (Array.isArray(body.pages) && body.pages.length > 0) {
        inputs.pages = body.pages.join(",");
      }
      if (body.url) {
        inputs.url = body.url;
        inputs.crawl_config = body.crawlConfig ? JSON.stringify(body.crawlConfig) : "";
      }

      await dispatchWorkflow(inputs);
      res.status(202).setHeaders(corsHeaders()).json({ success: true, message: `Dispatched ${mode} run` });
      return;
    }

    res.status(405).setHeaders(corsHeaders()).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).setHeaders(corsHeaders()).json({ error: (err as Error).message });
  }
}
