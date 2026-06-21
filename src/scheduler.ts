import fs from "fs";
import path from "path";
import cron, { type ScheduledTask } from "node-cron";
import { readConfig } from "./config.js";
import { runBaseline, runTest } from "./agent.js";

export interface Schedule {
  id: string;
  name: string;
  cronExpression: string;
  mode: "baseline" | "test";
  enabled: boolean;
  createdAt: number;
  lastRun: number | null;
}

const SCHEDULES_PATH = path.join(process.cwd(), "schedules.json");

function readSchedules(): Schedule[] {
  if (!fs.existsSync(SCHEDULES_PATH)) return [];
  return JSON.parse(fs.readFileSync(SCHEDULES_PATH, "utf-8"));
}

function writeSchedules(schedules: Schedule[]): void {
  fs.writeFileSync(
    SCHEDULES_PATH,
    JSON.stringify(schedules, null, 2),
    "utf-8"
  );
}

export function getSchedules(): Schedule[] {
  return readSchedules();
}

export function addSchedule(s: Omit<Schedule, "id" | "createdAt" | "lastRun">): Schedule {
  const schedules = readSchedules();
  const schedule: Schedule = {
    ...s,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    lastRun: null,
  };
  schedules.push(schedule);
  writeSchedules(schedules);
  startScheduleJob(schedule);
  return schedule;
}

export function updateSchedule(id: string, updates: Partial<Schedule>): Schedule | null {
  const schedules = readSchedules();
  const idx = schedules.findIndex((s) => s.id === id);
  if (idx === -1) return null;

  const oldJob = jobs.get(id);
  if (oldJob) {
    oldJob.stop();
    jobs.delete(id);
  }

  schedules[idx] = { ...schedules[idx], ...updates };
  writeSchedules(schedules);

  if (schedules[idx].enabled) {
    startScheduleJob(schedules[idx]);
  }

  return schedules[idx];
}

export function deleteSchedule(id: string): boolean {
  const schedules = readSchedules();
  const idx = schedules.findIndex((s) => s.id === id);
  if (idx === -1) return false;

  const oldJob = jobs.get(id);
  if (oldJob) {
    oldJob.stop();
    jobs.delete(id);
  }

  schedules.splice(idx, 1);
  writeSchedules(schedules);
  return true;
}

const jobs = new Map<string, ScheduledTask>();

function startScheduleJob(schedule: Schedule) {
  if (!cron.validate(schedule.cronExpression)) {
    console.error(`Invalid cron expression for "${schedule.name}": ${schedule.cronExpression}`);
    return;
  }

  const job = cron.schedule(schedule.cronExpression, async () => {
    console.log(`\n⏰ Running scheduled job: ${schedule.name} (${schedule.mode})`);
    try {
      const config = readConfig();
      if (schedule.mode === "baseline") {
        await runBaseline(config);
      } else {
        const results = await runTest(config);
        const passed = results.filter((r) => r.passed).length;
        const failed = results.filter((r) => !r.passed).length;
        console.log(`   📊 ${schedule.name}: ${passed} passed, ${failed} failed`);
      }
      updateSchedule(schedule.id, { lastRun: Date.now() });
    } catch (err) {
      console.error(`   ❌ ${schedule.name} failed:`, (err as Error).message);
    }
  });

  jobs.set(schedule.id, job);
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

export function previewNextRun(cronExpression: string): string | null {
  if (!cron.validate(cronExpression)) return null;
  const task = cron.schedule(cronExpression, () => {});
  const next = task.getNextRun();
  task.stop();
  return next ? next.toISOString() : null;
}
