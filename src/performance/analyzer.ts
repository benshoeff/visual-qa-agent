import { Page } from "playwright";
import { execSync } from "child_process";
import { OllamaVisionClient } from "../ai/index.js";

export interface LighthouseBudget {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

export interface BudgetCheckResult {
  passed: boolean;
  violations: Array<{
    metric: string;
    actual: number;
    budget: number;
    severity: "warning" | "error";
  }>;
}

export interface PerformanceComparisonResult {
  current: CoreWebVitals;
  baseline: CoreWebVitals;
  regressions: string[];
}

export interface CoreWebVitals {
  lcp: number; // Largest Contentful Paint (ms)
  fid: number; // First Input Delay (ms)
  cls: number; // Cumulative Layout Shift
  fcp: number; // First Contentful Paint (ms)
  ttfb: number; // Time to First Byte (ms)
  inp: number; // Interaction to Next Paint (ms)
}

export interface LighthouseMetrics {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  pwa: number;
  coreWebVitals: CoreWebVitals;
}

export interface PerformanceBudget {
  lcp: number; // ms
  fid: number; // ms
  cls: number;
  fcp: number; // ms
  ttfb: number; // ms
  inp: number; // ms
  performanceScore: number; // 0-100
}

export interface PerformanceAnalysisResult {
  url: string;
  viewport: { width: number; height: number };
  timestamp: string;
  lighthouse: LighthouseMetrics;
  budget: PerformanceBudget;
  passed: boolean;
  budgetViolations: Array<{
    metric: string;
    actual: number;
    budget: number;
    severity: "warning" | "error";
  }>;
  trends?: PerformanceTrend[];
}

export interface PerformanceTrend {
  date: string;
  metrics: {
    performance: number;
    lcp: number;
    fid: number;
    cls: number;
    fcp: number;
  };
}

const DEFAULT_BUDGET: PerformanceBudget = {
  lcp: 2500, // 2.5s
  fid: 100, // 100ms
  cls: 0.1,
  fcp: 1800, // 1.8s
  ttfb: 800, // 800ms
  inp: 200, // 200ms
  performanceScore: 90,
};

export class PerformanceAnalyzer {
  private client: OllamaVisionClient;
  private budget: PerformanceBudget;

  constructor(budget: Partial<PerformanceBudget> = {}) {
    this.client = new OllamaVisionClient();
    this.budget = { ...DEFAULT_BUDGET, ...budget };
  }

  async analyzePage(
    page: Page,
    url: string,
    viewport: { width: number; height: number }
  ): Promise<PerformanceAnalysisResult> {
    console.log(`  📊 Running Lighthouse audit for ${url}...`);

    // Run Lighthouse programmatically
    const lighthouseResult = await this.runLighthouse(url);

    // Extract Core Web Vitals from Lighthouse
    const coreWebVitals = this.extractCoreWebVitals(lighthouseResult);

    // Check against budget
    const budgetCheck = this.checkBudget(coreWebVitals, lighthouseResult);

    // Get trends from history
    const trends = await this.getTrends(url);

    // Extract categories (might be at top level or in lhr)
    const categories = lighthouseResult.categories || lighthouseResult.lhr?.categories;

    return {
      url,
      viewport,
      timestamp: new Date().toISOString(),
      lighthouse: {
        performance: categories?.performance?.score * 100 || 0,
        accessibility: categories?.accessibility?.score * 100 || 0,
        bestPractices: categories?.["best-practices"]?.score * 100 || 0,
        seo: categories?.seo?.score * 100 || 0,
        pwa: categories?.pwa?.score * 100 || 0,
        coreWebVitals,
      },
      budget: this.budget,
      passed: budgetCheck.passed,
      budgetViolations: budgetCheck.violations,
      trends,
    };
  }

  private async runLighthouse(url: string): Promise<any> {
    const tempFile = `/tmp/lh-result-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
    
    // Run Lighthouse CLI with output to temp file
    execSync(
      `npx lighthouse "${url}" --output=json --output-path="${tempFile}" --chrome-flags="--headless --no-sandbox --disable-setuid-sandbox" --preset=desktop --quiet`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024, timeout: 300000 }
    );

    // Read the result file
    const fs = await import("fs");
    const content = fs.readFileSync(tempFile, "utf-8");
    fs.unlinkSync(tempFile); // Clean up
    
    const parsed = JSON.parse(content);
    // Lighthouse CLI returns an array with one element
    const result = Array.isArray(parsed) ? parsed[0] : parsed;
    
    // Debug: log the structure
    console.log(`  📊 Lighthouse result keys:`, Object.keys(result || {}));
    if (result?.lhr) {
      console.log(`  📊 LHR keys:`, Object.keys(result.lhr || {}));
      console.log(`  📊 LHR audits keys count:`, Object.keys(result.lhr.audits || {}).length);
    }
    
    return result;
  }

  private extractCoreWebVitals(lighthouseResult: any): CoreWebVitals {
    // Lighthouse result structure has audits at top level (not lhr.audits)
    const audits = lighthouseResult.audits || lighthouseResult.lhr?.audits;
    if (!audits) {
      console.warn(`  ⚠️  No audits found in lighthouse result`);
      return { lcp: 0, fid: 0, cls: 0, fcp: 0, ttfb: 0, inp: 0 };
    }
    
    return {
      lcp: Math.round(audits["largest-contentful-paint"]?.numericValue || 0),
      fid: Math.round(audits["max-potential-fid"]?.numericValue || 0),
      cls: audits["cumulative-layout-shift"]?.numericValue || 0,
      fcp: Math.round(audits["first-contentful-paint"]?.numericValue || 0),
      ttfb: Math.round(audits["server-response-time"]?.numericValue || 0),
      inp: Math.round(audits["interaction-to-next-paint"]?.numericValue || 0),
    };
  }

  private checkBudget(
    coreWebVitals: CoreWebVitals,
    lighthouseResult: any
  ): BudgetCheckResult {
    const violations: Array<{ metric: string; actual: number; budget: number; severity: "warning" | "error" }> = [];
    const categories = lighthouseResult.categories || lighthouseResult.lhr?.categories;
    const performanceScore = categories?.performance?.score * 100 || 0;

    const checks = [
      { metric: "lcp", actual: coreWebVitals.lcp, budget: this.budget.lcp },
      { metric: "fid", actual: coreWebVitals.fid, budget: this.budget.fid },
      { metric: "cls", actual: coreWebVitals.cls, budget: this.budget.cls },
      { metric: "fcp", actual: coreWebVitals.fcp, budget: this.budget.fcp },
      { metric: "ttfb", actual: coreWebVitals.ttfb, budget: this.budget.ttfb },
      { metric: "inp", actual: coreWebVitals.inp, budget: this.budget.inp },
      { metric: "performanceScore", actual: performanceScore, budget: this.budget.performanceScore, reverse: true },
    ];

    for (const check of checks) {
      const exceeded = check.reverse 
        ? check.actual < check.budget 
        : check.actual > check.budget;
      
      if (exceeded) {
        const severity = check.actual > check.budget * 1.5 ? "error" : "warning";
        violations.push({
          metric: check.metric,
          actual: check.actual,
          budget: check.budget,
          severity,
        });
      }
    }

    return { passed: violations.length === 0, violations };
  }

  private async getTrends(url: string): Promise<PerformanceTrend[]> {
    // TODO: Read from database/history file
    return [];
  }

  async analyzeWithAI(
    comparison: { current: CoreWebVitals; baseline: CoreWebVitals; regressions: string[] },
    pageName: string,
    url: string
  ): Promise<{
    rootCause: string;
    priorityFixes: Array<{ metric: string; fix: string; effort: "low" | "medium" | "high" }>;
    riskAssessment: "low" | "medium" | "high" | "critical";
  }> {
    const prompt = `
You are a Senior Performance Engineer analyzing Core Web Vitals regression.

PAGE: ${pageName} (${url})

CURRENT METRICS:
- LCP: ${comparison.current.lcp}ms (budget: ${this.budget.lcp}ms)
- FID: ${comparison.current.fid}ms (budget: ${this.budget.fid}ms)
- CLS: ${comparison.current.cls} (budget: ${this.budget.cls})
- FCP: ${comparison.current.fcp}ms (budget: ${this.budget.fcp}ms)
- INP: ${comparison.current.inp}ms (budget: ${this.budget.inp}ms)

BASELINE METRICS:
- LCP: ${comparison.baseline.lcp}ms
- FID: ${comparison.baseline.fid}ms
- CLS: ${comparison.baseline.cls}
- FCP: ${comparison.baseline.fcp}ms
- INP: ${comparison.baseline.inp}ms

REGRESSIONS DETECTED: ${comparison.regressions.join(", ")}

Provide JSON response:
{
  "rootCause": "Primary technical cause (e.g., 'New hero image increased LCP by 800ms', 'Third-party script blocked main thread')",
  "priorityFixes": [
    { "metric": "LCP", "fix": "Optimize hero image: convert to WebP, add preload, reduce size", "effort": "low" }
  ],
  "riskAssessment": "critical|high|medium|low"
}`;

    try {
      const response = await this.client.chat({
        model: this.client["config"].model,
        messages: [{ role: "user", content: prompt }],
        format: "json",
        options: { temperature: 0.2, num_predict: 2048 },
      });

      const parsed = JSON.parse(response.message.content);
      return {
        rootCause: parsed.rootCause,
        priorityFixes: parsed.priorityFixes || [],
        riskAssessment: parsed.riskAssessment || "medium",
      };
    } catch {
      return {
        rootCause: "AI analysis failed",
        priorityFixes: [],
        riskAssessment: comparison.regressions.includes("LCP") ? "high" : "medium",
      };
    }
  }
}

export const performanceAnalyzer = new PerformanceAnalyzer();