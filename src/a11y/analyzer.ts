import { Page } from "playwright";
import { injectAxe, getAxeResults } from "axe-playwright";
import { OllamaVisionClient } from "../ai/index.js";

export interface A11yViolation {
  id: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  tags: string[];
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{
    target: string[];
    html: string;
    failureSummary: string;
    any: Array<{ id: string; impact: string; message: string }>;
    all: Array<{ id: string; impact: string; message: string }>;
    none: Array<{ id: string; impact: string; message: string }>;
  }>;
}

export interface A11yAnalysisResult {
  violations: A11yViolation[];
  passes: number;
  incomplete: number;
  inapplicable: number;
  timestamp: string;
  url: string;
  viewport: { width: number; height: number };
}

export interface A11yComparisonResult {
  baseline: A11yAnalysisResult;
  current: A11yAnalysisResult;
  newViolations: A11yViolation[];
  fixedViolations: A11yViolation[];
  persistentViolations: A11yViolation[];
  regressionScore: number;
  summary: string;
}

export class A11yAnalyzer {
  private client: OllamaVisionClient;

  constructor() {
    this.client = new OllamaVisionClient();
  }

  async analyzePage(
    page: Page,
    url: string,
    viewport: { width: number; height: number }
  ): Promise<A11yAnalysisResult> {
    await injectAxe(page);
    const results = await getAxeResults(page);

    const violations = results.violations as unknown as A11yViolation[];
    const passes = results.passes?.length || 0;
    const incomplete = (results as any).incomplete?.length || 0;
    const inapplicable = (results as any).inapplicable?.length || 0;

    return {
      violations,
      passes,
      incomplete,
      inapplicable,
      timestamp: new Date().toISOString(),
      url,
      viewport,
    };
  }

  async compareA11y(
    baseline: A11yAnalysisResult,
    current: A11yAnalysisResult
  ): Promise<A11yComparisonResult> {
    const baselineViolations = new Map(baseline.violations.map((v) => [v.id, v]));
    const currentViolations = new Map(current.violations.map((v) => [v.id, v]));

    const newViolations: A11yViolation[] = [];
    const fixedViolations: A11yViolation[] = [];
    const persistentViolations: A11yViolation[] = [];

    for (const [id, violation] of currentViolations) {
      if (!baselineViolations.has(id)) {
        newViolations.push(violation);
      } else {
        persistentViolations.push(violation);
      }
    }

    for (const [id, violation] of baselineViolations) {
      if (!currentViolations.has(id)) {
        fixedViolations.push(violation);
      }
    }

    const totalBaseline = baseline.violations.length;
    const totalCurrent = current.violations.length;
    const newCount = newViolations.length;
    const fixedCount = fixedViolations.length;

    const regressionScore = totalBaseline > 0
      ? Math.max(0, (newCount - fixedCount) / totalBaseline)
      : newCount > 0 ? 1 : 0;

    const summary = this.generateSummary(
      newViolations,
      fixedViolations,
      persistentViolations,
      regressionScore
    );

    return {
      baseline,
      current,
      newViolations,
      fixedViolations,
      persistentViolations,
      regressionScore,
      summary,
    };
  }

  private generateSummary(
    newV: A11yViolation[],
    fixedV: A11yViolation[],
    persistentV: A11yViolation[],
    score: number
  ): string {
    const criticalNew = newV.filter((v) => v.impact === "critical").length;
    const seriousNew = newV.filter((v) => v.impact === "serious").length;
    const criticalFixed = fixedV.filter((v) => v.impact === "critical").length;

    let summary = `A11y Regression Score: ${(score * 100).toFixed(1)}%\n`;
    summary += `New violations: ${newV.length} (critical: ${criticalNew}, serious: ${seriousNew})\n`;
    summary += `Fixed violations: ${fixedV.length} (critical: ${criticalFixed})\n`;
    summary += `Persistent violations: ${persistentV.length}\n`;

    if (newV.length > 0) {
      summary += "\nNew violations by impact:\n";
      const byImpact = newV.reduce((acc, v) => {
        acc[v.impact] = (acc[v.impact] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      for (const [impact, count] of Object.entries(byImpact)) {
        summary += `  ${impact}: ${count}\n`;
      }
    }

    return summary;
  }

  async analyzeWithAI(
    comparison: A11yComparisonResult,
    pageName: string,
    url: string
  ): Promise<{
    rootCause: string;
    priorityFixes: Array<{ violationId: string; fix: string; effort: "low" | "medium" | "high" }>;
    riskAssessment: "low" | "medium" | "high" | "critical";
  }> {
    const prompt = `
You are a Senior Accessibility Engineer. Analyze this accessibility regression comparison.

PAGE: ${pageName} (${url})
REGRESSION SCORE: ${(comparison.regressionScore * 100).toFixed(1)}%

NEW VIOLATIONS (${comparison.newViolations.length}):
${comparison.newViolations
  .slice(0, 10)
  .map(
    (v) =>
      `- ${v.id} [${v.impact}]: ${v.description}\n  Help: ${v.help}\n  Nodes affected: ${v.nodes.length}`
  )
  .join("\n")}

FIXED VIOLATIONS (${comparison.fixedViolations.length}):
${comparison.fixedViolations
  .slice(0, 5)
  .map(
    (v) =>
      `- ${v.id} [${v.impact}]: ${v.description}`
  )
  .join("\n")}

PERSISTENT VIOLATIONS (${comparison.persistentViolations.length}):
${comparison.persistentViolations
  .slice(0, 5)
  .map(
    (v) =>
      `- ${v.id} [${v.impact}]: ${v.description}`
  )
  .join("\n")}

Provide JSON response:
{
  "rootCause": "Primary reason for regression (e.g., 'CSS refactor removed focus styles', 'New component missing ARIA labels')",
  "priorityFixes": [
    { "violationId": "color-contrast", "fix": "Restore .btn:focus styles in components/Button.css line 42", "effort": "low" }
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
        riskAssessment: comparison.newViolations.some((v) => v.impact === "critical")
          ? "critical"
          : comparison.newViolations.some((v) => v.impact === "serious")
          ? "high"
          : "medium",
      };
    }
  }
}

export const a11yAnalyzer = new A11yAnalyzer();