import fs from "fs";
import path from "path";

const SCHEDULES_PATH = path.join(process.cwd(), "schedules.json");
const WORKFLOW_PATH = path.join(process.cwd(), ".github/workflows/visual-qa.yml");

const MAX_CRONS = 10;
// Keep a sentinel cron when there are no enabled schedules so the workflow
// keeps firing and can re-sync when a schedule is added back from the UI.
const SENTINEL_CRON = "0 9 * * *";

function readSchedules() {
  if (!fs.existsSync(SCHEDULES_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(SCHEDULES_PATH, "utf-8"));
  } catch (err) {
    console.error(`⚠️  Could not parse ${SCHEDULES_PATH}: ${err.message}`);
    return [];
  }
}

function buildCronList(schedules) {
  const crons = [];
  for (const s of schedules) {
    if (!s.enabled) continue;
    const cron = typeof s.cronExpression === "string" ? s.cronExpression.trim() : "";
    if (cron && !crons.includes(cron)) crons.push(cron);
  }
  crons.sort();
  if (crons.length === 0) crons.push(SENTINEL_CRON);
  return crons.slice(0, MAX_CRONS);
}

function renderScheduleBlock(crons) {
  const lines = crons.map((c) => `    - cron: '${c}'`);
  return `  schedule:\n${lines.join("\n")}\n`;
}

function rewriteWorkflow(yml, block) {
  const re = /^  schedule:\n(?:    - cron: '[^']*'\n)+/m;
  if (!re.test(yml)) {
    console.error("⚠️  Could not find the `schedule:` block in visual-qa.yml");
    return yml;
  }
  return yml.replace(re, block);
}

const schedules = readSchedules();
const crons = buildCronList(schedules);
const block = renderScheduleBlock(crons);

const yml = fs.readFileSync(WORKFLOW_PATH, "utf-8");
const next = rewriteWorkflow(yml, block);

if (next === yml) {
  console.log("ℹ️  Cron expressions already up to date");
} else {
  fs.writeFileSync(WORKFLOW_PATH, next, "utf-8");
  console.log(`✅ Synced ${crons.length} cron expression(s) into visual-qa.yml`);
}