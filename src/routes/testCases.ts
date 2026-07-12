import { Router, Request, Response } from "express";
import { prisma } from "../db/client.js";

const dbAvailable = !!process.env.DATABASE_URL;

export const testCasesRouter = Router();

// Middleware to check DB availability
testCasesRouter.use((req, res, next) => {
  if (!dbAvailable) {
    res.status(503).json({ 
      error: "Database not configured", 
      message: "Set DATABASE_URL environment variable to enable test case management" 
    });
    return;
  }
  next();
});

testCasesRouter.get("/pages/:pageId/test-cases", async (req: Request, res: Response) => {
  try {
    const { pageId } = req.params;
    const testCases = await prisma.testCase.findMany({
      where: { pageId },
      orderBy: { createdAt: "desc" },
    });
    res.json(testCases);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

testCasesRouter.post("/pages/:pageId/test-cases", async (req: Request, res: Response) => {
  try {
    const { pageId } = req.params;
    const { name, description, selector, action, expected } = req.body;
    
    if (!name || !selector || !action || !expected) {
      res.status(400).json({ error: "name, selector, action, expected are required" });
      return;
    }

    const testCase = await prisma.testCase.create({
      data: { pageId, name, description, selector, action, expected },
    });
    res.status(201).json(testCase);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

testCasesRouter.put("/test-cases/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const testCase = await prisma.testCase.update({
      where: { id },
      data: req.body,
    });
    res.json(testCase);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

testCasesRouter.delete("/test-cases/:id", async (req: Request, res: Response) => {
  try {
    await prisma.testCase.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

testCasesRouter.post("/test-cases/:id/run", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const testCase = await prisma.testCase.findUnique({ 
      where: { id },
      include: { page: true },
    });
    if (!testCase) {
      res.status(404).json({ error: "Test case not found" });
      return;
    }

    res.json({ 
      testCase, 
      message: "Execute via test runner with selector: " + testCase.selector,
      selector: testCase.selector,
      action: testCase.action,
      expected: testCase.expected,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

testCasesRouter.get("/test-cases/:id/history", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const testCase = await prisma.testCase.findUnique({
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
    if (!testCase) {
      res.status(404).json({ error: "Test case not found" });
      return;
    }
    res.json(testCase.page.testRuns);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Bulk create from AI generation
testCasesRouter.post("/pages/:pageId/test-cases/bulk", async (req: Request, res: Response) => {
  try {
    const { pageId } = req.params;
    const { testCases } = req.body; // Array of { name, description, selector, action, expected }
    
    if (!Array.isArray(testCases) || testCases.length === 0) {
      res.status(400).json({ error: "testCases array is required" });
      return;
    }

    const created = await prisma.testCase.createMany({
      data: testCases.map(tc => ({
        pageId,
        name: tc.name,
        description: tc.description,
        selector: tc.selector,
        action: tc.action,
        expected: tc.expected,
      })),
    });
    res.status(201).json({ created: created.count });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});