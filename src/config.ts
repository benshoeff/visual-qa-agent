import fs from "fs";
import path from "path";

export interface PageConfig {
  name: string;
  url: string;
  waitForSelector?: string;
  mask?: string[];
  threshold?: number;
}

export interface Config {
  viewport: { width: number; height: number };
  threshold: number;
  waitFor: "networkidle" | "domcontentloaded" | "load";
  pages: PageConfig[];
}

const ROOT = process.cwd();

export const BASELINES_DIR = path.join(ROOT, "baselines");
export const CURRENT_DIR = path.join(ROOT, "current");
export const DIFFS_DIR = path.join(ROOT, "diffs");
export const REPORTS_DIR = path.join(ROOT, "reports");

export function screenshotPath(dir: string, name: string) {
  return path.join(dir, `${name}.png`);
}

export function readConfig(): Config {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, "config.json"), "utf-8")
  );
}

export function writeConfig(config: Config): void {
  fs.writeFileSync(
    path.join(ROOT, "config.json"),
    JSON.stringify(config, null, 2),
    "utf-8"
  );
}
