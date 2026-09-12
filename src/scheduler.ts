import fs from "fs";
import path from "path";
import cron, { type ScheduledTask } from "node-cron";
import { parse as parseYaml } from "yaml";
import { readConfig, getProject } from "./config.js";
import { runBaseline, runTest } from "./agent.js";

export interface Schedule {
  name: string;
  cronExpression: string;
  mode: "baseline" | "test";
  enabled: boolean;
  projectId?: string;
  lastRun: number | null;
  status: "pending" | "pass" | "fail";
}

const SCHEDULES_PATH = path.join(process.cwd(), "schedules.yml");
const STATUS_PATH = path.join(process.cwd(), "schedules-status.json");

interface ScheduleDef {
  name: string;
  cron: string;
  mode?: string;
  enabled?: boolean;
  projectId?: string;
}

function readStatus(): Record<string, { lastRun?: number; status?: string }> {
  if (!fs.existsSync(STATUS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATUS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function normalizeStatus(raw?: string): "pending" | "pass" | "fail" {
  return raw === "pass" || raw === "fail" ? raw : "pending";
}

// Status is stored per-project (`<projectId>::<name>`) so each project only ever
// sees its own schedule run history. Legacy name-only entries act as a fallback.
function statusKey(projectId: string, name: string): string {
  return `${projectId || "__active__"}::${name}`;
}

function readSchedules(): Schedule[] {
  if (!fs.existsSync(SCHEDULES_PATH)) return [];
  const doc = parseYaml(fs.readFileSync(SCHEDULES_PATH, "utf-8")) as {
    schedules?: ScheduleDef[];
  };
  if (!Array.isArray(doc?.schedules)) return [];

  const statuses = readStatus();
  const activeProjectId = readConfig().activeProjectId ?? "";
  return doc.schedules.map((s) => {
    const projectId = s.projectId ?? activeProjectId;
    const st = statuses[statusKey(projectId, s.name)] ?? statuses[s.name] ?? {};
    return {
      name: s.name,
      cronExpression: s.cron,
      mode: s.mode === "baseline" ? "baseline" : "test",
      enabled: s.enabled ?? true,
      ...(s.projectId ? { projectId: s.projectId } : {}),
      lastRun: st.lastRun ?? null,
      status: normalizeStatus(st.status),
    };
  });
}

export function getSchedules(): Schedule[] {
  return readSchedules();
}

const jobs = new Map<string, ScheduledTask>();

function scheduleRunKey(schedule: Schedule): string {
  return statusKey(schedule.projectId ?? "", schedule.name);
}

function startScheduleJob(schedule: Schedule) {
  if (!cron.validate(schedule.cronExpression)) {
    console.error(`Invalid cron expression for "${schedule.name}": ${schedule.cronExpression}`);
    return;
  }

  const job = cron.schedule(schedule.cronExpression, async () => {
    console.log(`\n⏰ Running scheduled job: ${schedule.name} (${schedule.mode})`);
    try {
      const config = readConfig();
      const project = getProject(config, schedule.projectId);
      if (!project) {
        console.error(`   ❌ Scheduled "${schedule.name}": project not found (${schedule.projectId ?? "active"})`);
        return;
      }
      if (schedule.mode === "baseline") {
        await runBaseline(config, project);
      } else {
        const results = await runTest(config, project);
        const passed = results.filter((r) => r.passed).length;
        const failed = results.filter((r) => !r.passed).length;
        console.log(`   📊 ${schedule.name}: ${passed} passed, ${failed} failed`);
      }
    } catch (err) {
      console.error(`   ❌ ${schedule.name} failed:`, (err as Error).message);
    }
  });

  jobs.set(scheduleRunKey(schedule), job);
  console.log(`   ⏰ Scheduled "${schedule.name}": ${schedule.cronExpression} (${schedule.mode})`);
}

export function initScheduler(): void {
  const schedules = readSchedules();
  console.log(`\n⏰ Loading ${schedules.length} schedule(s)...`);
  for (const s of schedules) {
    if (s.enabled) {
      startScheduleJob(s);
    }
  }
}