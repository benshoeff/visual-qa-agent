export interface LocalRun {
  id: number;
  runNumber: number;
  status: "in_progress" | "completed";
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string | null;
  projectId: string;
}

const runs: LocalRun[] = [];
let nextId = 1;

export function createLocalRun(mode: string, projectId: string): LocalRun {
  const now = new Date().toISOString();
  const run: LocalRun = {
    id: nextId,
    runNumber: nextId,
    status: "in_progress",
    conclusion: null,
    createdAt: now,
    updatedAt: now,
    htmlUrl: null,
    projectId,
  };
  nextId += 1;
  runs.unshift(run);
  console.log(`\n🚀 LOCAL RUN #${run.runNumber} (${mode}) [${projectId}]`);
  return run;
}

export function updateLocalRun(
  id: number,
  patch: Partial<Omit<LocalRun, "id" | "createdAt">>
): void {
  const run = runs.find((r) => r.id === id);
  if (run) {
    Object.assign(run, patch, { updatedAt: new Date().toISOString() });
  }
}

export function listLocalRuns(projectId?: string): LocalRun[] {
  return projectId ? runs.filter((r) => r.projectId === projectId) : [...runs];
}