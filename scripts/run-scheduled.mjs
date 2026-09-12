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

function readActiveProjectId() {
  const cfgPath = path.join(root, "config.json");
  if (!fs.existsSync(cfgPath)) return "";
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    return typeof cfg.activeProjectId === "string" ? cfg.activeProjectId : "";
  } catch {
    return "";
  }
}

// A schedule without a projectId targets the config's active project at run time.
function resolveScheduleProjectId(s) {
  if (s.projectId) return String(s.projectId).trim();
  return readActiveProjectId();
}

// Status is stored per-project (`<projectId>::<name>`) so schedule run history
// is never shared between projects. Legacy name-only entries are read as a
// fallback and cleaned up after a schedule runs with its new key.
function statusKey(projectId, name) {
  return `${projectId || "__active__"}::${name}`;
}

const status = loadStatus();
const due = [];
const today = new Date().toISOString();

for (const s of loadSchedules()) {
  if (!s.enabled) continue;
  const expr = String(s.cron ?? "").trim();
  if (!expr) continue;

  const projectId = resolveScheduleProjectId(s);
  const key = statusKey(projectId, s.name);
  const prev = status[key] ?? status[s.name];
  if (!isDue(expr, prev?.lastRun ?? null)) continue;

  due.push(s);
  const mode = s.mode === "baseline" ? "baseline" : "test";
  const label = s.projectId ? `[${s.projectId}]` : `[active:${projectId || "none"}]`;
  console.log(`\n⏰ Scheduled "${s.name}" → ${s.mode} ${label} (${today})`);
  const projectEnv = projectId ? `PROJECT=${JSON.stringify(projectId)} ` : "";
  let ok = true;
  try {
    execSync(`${projectEnv}npm run ${mode}`, { stdio: "inherit" });
  } catch (err) {
    ok = false;
    console.error(`   ❌ "${s.name}" failed: ${err instanceof Error ? err.message : err}`);
  }
  status[key] = {
    lastRun: Date.now(),
    status: ok ? "pass" : "fail",
    projectId,
  };
  if (key !== s.name) delete status[s.name];
}

if (due.length) {
  fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), "utf-8");
  console.log(`\n✅ Ran ${due.length} scheduled job(s)`);
} else {
  console.log("ℹ️ No schedules due at this time");
}