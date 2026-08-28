import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getFileText, commitFiles, corsHeaders } from "./_lib/github";

// Reflects the Schedule type from the serverless workflow consumer.
interface Schedule {
  id: string;
  name: string;
  cronExpression: string;
  mode: "baseline" | "test";
  enabled: boolean;
  createdAt: number;
  lastRun: number | null;
}

async function loadSchedules(): Promise<Schedule[]> {
  const file = await getFileText("schedules.json");
  if (!file) return [];
  return JSON.parse(file.content) as Schedule[];
}

async function saveSchedules(schedules: Schedule[], message: string): Promise<void> {
  await commitFiles(
    [{ path: "schedules.json", content: JSON.stringify(schedules, null, 2) }],
    message
  );
}

function isValidCron(cronExpression: string): boolean {
  // 5-field cron: minute hour day month day-of-week
  return /^(\*|[0-9]+)(\s+(\*|[0-9]+)){4}$/.test(cronExpression.trim());
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).setHeaders(corsHeaders()).end();
    return;
  }
  try {
    const schedules = await loadSchedules();

    if (req.method === "GET") {
      res.status(200).setHeaders(corsHeaders()).json(schedules);
      return;
    }

    if (req.method === "POST") {
      const { name, cronExpression, mode, enabled } = req.body ?? {};
      if (!name || !cronExpression || !mode) {
        res.status(400).setHeaders(corsHeaders()).json({ error: "name, cronExpression, and mode are required" });
        return;
      }
      if (!isValidCron(cronExpression)) {
        res.status(400).setHeaders(corsHeaders()).json({ error: "Invalid cron expression" });
        return;
      }
      const schedule: Schedule = {
        id: crypto.randomUUID(),
        name,
        cronExpression,
        mode,
        enabled: enabled ?? true,
        createdAt: Date.now(),
        lastRun: null,
      };
      schedules.push(schedule);
      await saveSchedules(schedules, `Add schedule ${name} via UI`);
      res.status(201).setHeaders(corsHeaders()).json(schedule);
      return;
    }

    if (req.method === "PUT") {
      const id = req.query.id as string;
      const idx = schedules.findIndex((s) => s.id === id);
      if (idx === -1) {
        res.status(404).setHeaders(corsHeaders()).json({ error: "Schedule not found" });
        return;
      }
      const updates = req.body ?? {};
      if (updates.cronExpression && !isValidCron(updates.cronExpression)) {
        res.status(400).setHeaders(corsHeaders()).json({ error: "Invalid cron expression" });
        return;
      }
      schedules[idx] = { ...schedules[idx], ...updates, id };
      await saveSchedules(schedules, `Update schedule ${schedules[idx].name} via UI`);
      res.status(200).setHeaders(corsHeaders()).json(schedules[idx]);
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id as string;
      const idx = schedules.findIndex((s) => s.id === id);
      if (idx === -1) {
        res.status(404).setHeaders(corsHeaders()).json({ error: "Schedule not found" });
        return;
      }
      const [removed] = schedules.splice(idx, 1);
      await saveSchedules(schedules, `Delete schedule ${removed.name} via UI`);
      res.status(200).setHeaders(corsHeaders()).json({ deleted: true });
      return;
    }

    res.status(405).setHeaders(corsHeaders()).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).setHeaders(corsHeaders()).json({ error: (err as Error).message });
  }
}
