export interface LocalRun {
  id: number;
  runNumber: number;
  status: "in_progress" | "completed";
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string | null;
}

const runs: LocalRun[] = [];
let nextId = 1;

export function createLocalRun(mode: string): LocalRun {
  const now = new Date().toISOString();
  const run: LocalRun = {
    id: nextId,
    runNumber: nextId,
    status: "in_progress",
    conclusion: null,
    createdAt: now,
    updatedAt: now,
    htmlUrl: null,
  };
  nextId += 1;
  runs.unshift(run);
  console.log(`\n🚀 LOCAL RUN #${run.runNumber} (${mode})`);
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

export function listLocalRuns(): LocalRun[] {
  return [...runs];
}