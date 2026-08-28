import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getLatestRuns, getFileText, corsHeaders } from "../serverless/github";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeaders(corsHeaders()).end();
    return;
  }
  try {
    const limit = parseInt((req.query.limit as string) || "5", 10);
    const runs = await getLatestRuns(limit);

    // Attach mode/pages from the run inputs if available
    const enriched = runs.map((r) => ({
      id: r.id,
      runNumber: r.run_number,
      status: r.status,
      conclusion: r.conclusion,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      htmlUrl: r.html_url,
    }));

    res.status(200).setHeaders(corsHeaders()).json({ runs: enriched });
  } catch (err) {
    res.status(500).setHeaders(corsHeaders()).json({ error: (err as Error).message });
  }
}
