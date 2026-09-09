import cron from "node-cron";
import fs from "fs";
import { execSync } from "child_process";

const schedules = JSON.parse(fs.readFileSync("schedules.json", "utf-8"));
const now = new Date();

// When a GitHub Actions `schedule` event fired the workflow, github.event.schedule
// tells us exactly which cron expression triggered it (GitHub often fires late, so
// time-based matching alone would never hit). Otherwise fall back to cron.match.
const triggered = process.env.TRIGGERED_CRON ? String(process.env.TRIGGERED_CRON).trim() : null;

const due = [];
for (const s of schedules) {
  if (!s.enabled) continue;
  const expr = typeof s.cronExpression === "string" ? s.cronExpression.trim() : "";
  if (triggered) {
    if (expr === triggered) due.push(s);
    continue;
  }
  try {
    if (expr && cron.match(expr, now)) due.push(s);
  } catch {
    continue;
  }
}

let ran = false;
for (const s of due) {
  ran = true;
  const mode = s.mode === "baseline" ? "baseline" : "test";
  console.log(`\n⏰ Scheduled "${s.name}" → ${s.mode}${s.projectId ? ` [${s.projectId}]` : ""}`);
  const projectEnv = s.projectId ? `PROJECT=${JSON.stringify(s.projectId)} ` : "";
  try {
    execSync(`${projectEnv}npm run ${mode}`, { stdio: "inherit" });
  } catch (err) {
    console.error(`   ❌ "${s.name}" failed: ${err instanceof Error ? err.message : err}`);
  }
  s.lastRun = Date.now();
}

fs.writeFileSync("schedules.json", JSON.stringify(schedules, null, 2), "utf-8");
console.log(ran ? "\n✅ Scheduled run completed" : "ℹ️ No schedules due at this time");
