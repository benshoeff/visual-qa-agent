import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import cronParser from "cron-parser";

const { parseExpression } = cronParser;

const root = process.cwd();
const SCHEDULES_PATH = path.join(root, "schedules.yml");
const STATUS_PATH = path.join(root, "schedules-status.json");

function loadSchedules() {
  if (!fs.existsSync(SCHEDULES_PATH)) {
    console.log("ℹ️ No schedules.yml found — nothing to run");
    return [];
  }
  try {
    const doc = parseYaml(fs.readFileSync(SCHEDULES_PATH, "utf-8"));
    return Array.isArray(doc?.schedules) ? doc.schedules : [];
  } catch (err) {
    console.error("❌ Failed to parse schedules.yml:", err instanceof Error ? err.message : err);
    return [];
  }
}

function loadStatus() {
  if (!fs.existsSync(STATUS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATUS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

// A schedule is due when its first occurrence after the last run (or ever, for
// a schedule that never ran) is in the past. Expressions are evaluated in UTC
// to match GitHub Actions scheduling. This makes the workflow a dumb hourly
// "tick" and keeps schedules.yml the only place runs are defined.
function isDue(expr, lastRunMs) {
  try {
    const base = lastRunMs != null ? new Date(lastRunMs) : new Date(0);
    const interval = parseExpression(expr, { currentDate: base, tz: "Etc/UTC" });
    return interval.next().toDate().getTime() <= Date.now();
  } catch {
    return false;
  }
}

const status = loadStatus();
const due = [];
const today = new Date().toISOString();

for (const s of loadSchedules()) {
  if (!s.enabled) continue;
  const expr = String(s.cron ?? "").trim();
  if (!expr) continue;

  const prev = status[s.name];
  if (!isDue(expr, prev?.lastRun ?? null)) continue;

  due.push(s);
  const mode = s.mode === "baseline" ? "baseline" : "test";
  console.log(`\n⏰ Scheduled "${s.name}" → ${s.mode}${s.projectId ? ` [${s.projectId}]` : ""} (${today})`);
  const projectEnv = s.projectId ? `PROJECT=${JSON.stringify(s.projectId)} ` : "";
  let ok = true;
  try {
    execSync(`${projectEnv}npm run ${mode}`, { stdio: "inherit" });
  } catch (err) {
    ok = false;
    console.error(`   ❌ "${s.name}" failed: ${err instanceof Error ? err.message : err}`);
  }
  status[s.name] = {
    lastRun: Date.now(),
    status: ok ? "pass" : "fail",
    ...(s.projectId ? { projectId: s.projectId } : {}),
  };
}

if (due.length) {
  fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), "utf-8");
  console.log(`\n✅ Ran ${due.length} scheduled job(s)`);
} else {
  console.log("ℹ️ No schedules due at this time");
}