import { Router, Request, Response } from "express";
import { prisma } from "../db/client.js";

const dbAvailable = !!process.env.DATABASE_URL;

export const flakyTestsRouter = Router();

flakyTestsRouter.use((req, res, next) => {
  if (!dbAvailable) {
    res.status(503).json({ 
      error: "Database not configured", 
      message: "Set DATABASE_URL environment variable to enable flaky test management" 
    });
    return;
  }
  next();
});

flakyTestsRouter.get("/flaky-tests", async (_req: Request, res: Response) => {
  try {
    const flakyTests = await prisma.flakyTest.findMany({
      include: { page: true },
      orderBy: { failureRate: "desc" },
    });
    res.json(flakyTests);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

flakyTestsRouter.post("/flaky-tests/:id/quarantine", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { quarantined } = req.body;
    const flakyTest = await prisma.flakyTest.update({
      where: { id },
      data: { quarantined: Boolean(quarantined) },
    });
    res.json(flakyTest);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

flakyTestsRouter.post("/flaky-tests/:id/clear-history", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const flakyTest = await prisma.flakyTest.update({
      where: { id },
      data: { failureRate: 0, occurrences: 0, lastFailure: null, quarantined: false },
    });
    res.json(flakyTest);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

flakyTestsRouter.get("/flaky-tests/:id/details", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const flakyTest = await prisma.flakyTest.findUnique({
      where: { id },
      include: { 
        page: {
          include: {
            testRuns: {
              take: 20,
              orderBy: { startedAt: "desc" },
            },
          },
        },
      },
    });
    if (!flakyTest) {
      res.status(404).json({ error: "Flaky test not found" });
      return;
    }
    res.json(flakyTest);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});