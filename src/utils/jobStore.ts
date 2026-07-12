import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CrawlJob, CrawlJobStatus } from "../types/crawl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JOBS_DIR = path.join(process.cwd(), "crawl-jobs");

if (!fs.existsSync(JOBS_DIR)) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
}

function jobPath(id: string): string {
  return path.join(JOBS_DIR, `${id}.json`);
}

function atomicWrite(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

export const jobStore = {
  create(job: CrawlJob): CrawlJob {
    atomicWrite(jobPath(job.id), job);
    return job;
  },

  get(id: string): CrawlJob | null {
    const p = jobPath(id);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as CrawlJob;
  },

  update(id: string, updates: Partial<CrawlJob>): CrawlJob | null {
    const job = this.get(id);
    if (!job) return null;
    const updated = { ...job, ...updates, updatedAt: new Date().toISOString() };
    atomicWrite(jobPath(id), updated);
    return updated;
  },

  setStatus(id: string, status: CrawlJobStatus, error?: string): CrawlJob | null {
    return this.update(id, { status, error, ...(status === "completed" ? { completedAt: new Date().toISOString() } : {}) });
  },

  list(): CrawlJob[] {
    if (!fs.existsSync(JOBS_DIR)) return [];
    return fs.readdirSync(JOBS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(JOBS_DIR, f), "utf-8")) as CrawlJob)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  delete(id: string): boolean {
    const p = jobPath(id);
    if (!fs.existsSync(p)) return false;
    fs.unlinkSync(p);
    return true;
  },

  cleanup(olderThanHours = 24): number {
    const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
    let count = 0;
    for (const f of fs.readdirSync(JOBS_DIR)) {
      if (!f.endsWith(".json")) continue;
      const p = path.join(JOBS_DIR, f);
      const stat = fs.statSync(p);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(p);
        count++;
      }
    }
    return count;
  },
};