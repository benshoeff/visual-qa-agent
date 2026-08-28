import cron from "node-cron";
import fs from "fs";
import { execSync } from "child_process";

const schedules = JSON.parse(fs.readFileSync("schedules.json", "utf-8"));
const now = new Date();
let ran = false;

for (const s of schedules) {
  if (!s.enabled) continue;
  try {
    if (!cron.match(s.cronExpression, now)) continue;
  } catch {
    continue;
  }
  ran = true;
  const mode = s.mode === "baseline" ? "baseline" : "test";
  console.log(`\n⏰ Scheduled "${s.name}" → ${s.mode}`);
  execSync(`npm run ${mode}`, { stdio: "inherit" });
  s.lastRun = Date.now();
}

fs.writeFileSync("schedules.json", JSON.stringify(schedules, null, 2), "utf-8");
console.log(ran ? "\n✅ Scheduled run completed" : "ℹ️ No schedules due at this time");
