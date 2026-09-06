import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig, writeConfig, BASELINES_DIR, CURRENT_DIR, DIFFS_DIR, REPORTS_DIR } from "../src/config.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function moveArtifacts(config: import("../src/config.js").Config): Promise<void> {
  const projectId = config.activeProjectId || config.projects[0]?.id;
  if (!projectId) return;

  const dirs = [
    { dir: BASELINES_DIR, exts: [".png", ".a11y.json", ".perf.json"] },
    { dir: CURRENT_DIR, exts: [".png"] },
    { dir: DIFFS_DIR, exts: [".png", ".regions.json"] },
    { dir: REPORTS_DIR, exts: [".html"] },
  ];

  for (const { dir, exts } of dirs) {
    if (!fs.existsSync(dir)) continue;
    const target = path.join(dir, projectId);
    fs.mkdirSync(target, { recursive: true });
    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    let moved = 0;
    for (const name of files) {
      const src = path.join(dir, name);
      if (!fs.statSync(src).isFile()) continue;
      if (!exts.some((ext) => name.endsWith(ext))) continue;
      fs.renameSync(src, path.join(target, name));
      moved++;
    }
    if (moved) console.log(`Moved ${moved} file(s) into ${path.relative(ROOT, target)}`);
  }
}

export async function main(): Promise<void> {
  const rawPath = path.join(ROOT, "config.json");
  const raw = JSON.parse(fs.readFileSync(rawPath, "utf-8"));
  const wasV2 = (raw as { version?: number }).version === 2 || (raw as { projects?: unknown[] }).projects?.length;

  const config = readConfig();
  writeConfig(config);

  if (!wasV2) {
    console.log(`Migrated config.json to v2. Created project "${config.projects[0]?.name}" (id: ${config.projects[0]?.id}).`);
  } else {
    console.log("Config already v2 — no config migration needed.");
  }

  await moveArtifacts(config);
  console.log("Done.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}