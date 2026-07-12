import { Router, Request, Response } from "express";
import { execSync } from "child_process";
import { readConfig, PageConfig, BrowserProject } from "../config.js";

export const impactRouter = Router();

// Map selectors to pages from config
function getPageSelectors(): Map<string, string[]> {
  const config = readConfig();
  const map = new Map<string, string[]>();
  
  for (const page of config.pages) {
    // Default selectors based on common patterns
    const selectors = [
      `[data-testid="${page.name.toLowerCase()}"]`,
      `.${page.name.toLowerCase()}-page`,
      `#${page.name.toLowerCase()}`,
      `main`,
      `[role="main"]`,
    ];
    map.set(page.name, selectors);
  }
  
  return map;
}

// Analyze which files affect which pages
function analyzeFileImpact(changedFiles: string[], pageSelectors: Map<string, string[]>): Array<{
  page: string;
  confidence: number;
  reasons: string[];
}> {
  const results: Array<{ page: string; confidence: number; reasons: string[] }> = [];
  
  for (const [page, selectors] of pageSelectors) {
    let confidence = 0;
    const reasons: string[] = [];
    
    for (const file of changedFiles) {
      // CSS/Style changes affect all pages
      if (file.match(/\.(css|scss|sass|less|styl)$/)) {
        confidence = Math.max(confidence, 0.9);
        reasons.push(`CSS change: ${file}`);
      }
      // Global JS/TS changes
      else if (file.match(/\.(js|ts|tsx|jsx)$/) && 
               (file.includes("global") || file.includes("utils") || file.includes("helpers") || file.includes("components/ui"))) {
        confidence = Math.max(confidence, 0.7);
        reasons.push(`Shared code change: ${file}`);
      }
      // Component changes
      else if (file.match(/\.(tsx|jsx|vue|svelte)$/) && file.includes("components")) {
        confidence = Math.max(confidence, 0.6);
        reasons.push(`Component change: ${file}`);
      }
      // Page-specific changes
      else if (file.includes(page.toLowerCase()) || file.includes(page.toLowerCase().replace(" ", "-"))) {
        confidence = Math.max(confidence, 0.8);
        reasons.push(`Page-specific change: ${file}`);
      }
      // Config changes
      else if (file.match(/(config|tailwind|theme)\.(js|ts|json)$/)) {
        confidence = Math.max(confidence, 0.8);
        reasons.push(`Theme/config change: ${file}`);
      }
    }
    
    if (confidence > 0) {
      results.push({ page, confidence, reasons });
    }
  }
  
  return results.sort((a, b) => b.confidence - a.confidence);
}

impactRouter.post("/analyze", async (req: Request, res: Response) => {
  try {
    const { changedFiles, baseSha, headSha } = req.body;
    
    let files: string[] = changedFiles || [];
    
    // If not provided, try to get from git
    if (files.length === 0 && baseSha && headSha) {
      try {
        const output = execSync(`git diff --name-only ${baseSha} ${headSha}`, { 
          encoding: "utf-8",
          cwd: process.cwd(),
        });
        files = output.trim().split("\n").filter(f => f);
      } catch {
        // Ignore git errors
      }
    }
    
    if (files.length === 0) {
      res.status(400).json({ error: "No changed files provided or detected" });
      return;
    }
    
    const pageSelectors = getPageSelectors();
    const analysis = analyzeFileImpact(files, pageSelectors);
    
    // Filter by confidence threshold
    const affected = analysis.filter(a => a.confidence >= 0.5);
    const maybeAffected = analysis.filter(a => a.confidence >= 0.3 && a.confidence < 0.5);
    
    res.json({
      changedFiles: files,
      affectedPages: affected.map(a => ({ page: a.page, confidence: a.confidence, reasons: a.reasons })),
      maybeAffectedPages: maybeAffected.map(a => ({ page: a.page, confidence: a.confidence, reasons: a.reasons })),
      recommendation: affected.length > 0 
        ? `Run tests for: ${affected.map(a => a.page).join(", ")}`
        : "No specific pages identified - consider running full suite",
      runAll: affected.length === 0 && maybeAffected.length === 0,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get impact from last commit
impactRouter.get("/last-commit", async (_req: Request, res: Response) => {
  try {
    const output = execSync("git diff --name-only HEAD~1 HEAD", { 
      encoding: "utf-8",
      cwd: process.cwd(),
    });
    const files = output.trim().split("\n").filter(f => f);
    
    if (files.length === 0) {
      res.json({ changedFiles: [], affectedPages: [], recommendation: "No changes in last commit" });
      return;
    }
    
    const pageSelectors = getPageSelectors();
    const analysis = analyzeFileImpact(files, pageSelectors);
    const affected = analysis.filter(a => a.confidence >= 0.5);
    
    res.json({
      changedFiles: files,
      affectedPages: affected.map(a => ({ page: a.page, confidence: a.confidence, reasons: a.reasons })),
      recommendation: affected.length > 0 
        ? `Run tests for: ${affected.map(a => a.page).join(", ")}`
        : "No specific pages identified",
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get impact between two refs
impactRouter.get("/compare/:baseRef/:headRef", async (req: Request, res: Response) => {
  try {
    const { baseRef, headRef } = req.params;
    
    const output = execSync(`git diff --name-only ${baseRef} ${headRef}`, { 
      encoding: "utf-8",
      cwd: process.cwd(),
    });
    const files = output.trim().split("\n").filter(f => f);
    
    if (files.length === 0) {
      res.json({ changedFiles: [], affectedPages: [], recommendation: "No changes between refs" });
      return;
    }
    
    const pageSelectors = getPageSelectors();
    const analysis = analyzeFileImpact(files, pageSelectors);
    const affected = analysis.filter(a => a.confidence >= 0.5);
    
    res.json({
      baseRef,
      headRef,
      changedFiles: files,
      affectedPages: affected.map(a => ({ page: a.page, confidence: a.confidence, reasons: a.reasons })),
      recommendation: affected.length > 0 
        ? `Run tests for: ${affected.map(a => a.page).join(", ")}`
        : "No specific pages identified",
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});