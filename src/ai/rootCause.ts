import { OllamaVisionClient } from "./index.js";
import { ConsoleLogEntry, NetworkErrorEntry } from "../browser.js";

export interface RootCauseAnalysis {
  rootCause: string;
  contributingFactors: string[];
  affectedUserFlows: string[];
  suggestedFix: string;
  preventionStrategy: string;
  severity: "critical" | "high" | "medium" | "low";
  estimatedFixTime: "minutes" | "hours" | "days";
  confidence: number;
}

export interface RootCauseContext {
  pageName: string;
  url: string;
  viewport: { width: number; height: number };
  visualDiff: {
    classification: string;
    diffPercent: number;
    reasoning: string;
  };
  domDiff: DOMDiff;
  consoleLogs: ConsoleLogEntry[];
  networkErrors: NetworkErrorEntry[];
  previousRuns: HistoricalRun[];
}

export interface VisionAnalysis {
  semanticPassed: boolean;
  classification: string;
  confidence: number;
  reasoning: string;
  suggestions: string[];
  changedElements: Array<{
    selector: string;
    changeType: string;
    impact: string;
    description: string;
  }>;
  accessibilityIssues: Array<{
    rule: string;
    severity: string;
    element: string;
    description: string;
  }>;
  functionalImpact: string;
}

export interface DOMDiff {
  added: string[];
  removed: string[];
  modified: Array<{ selector: string; oldAttrs: Record<string, string>; newAttrs: Record<string, string> }>;
  moved: Array<{ selector: string; oldIndex: number; newIndex: number }>;
}

export interface ConsoleLog {
  type: "log" | "warn" | "error" | "info";
  text: string;
  location?: { url: string; line: number; column: number };
  timestamp: number;
}

export interface NetworkError {
  url: string;
  status: number;
  statusText: string;
  resourceType: string;
  timestamp: number;
}

export interface HistoricalRun {
  date: string;
  diffPercent: number;
  status: string;
  aiClassification?: string;
}

const ROOT_CAUSE_PROMPT = `
You are a Senior QA Engineer with 15+ years experience debugging visual regressions and frontend issues.

Given the following context about a failed visual regression test, provide a root cause analysis.

CONTEXT:
- Page: {pageName} ({url})
- Viewport: {viewport.width}x{viewport.height}
- AI Classification: {classification} (confidence: {confidence})
- AI Reasoning: {reasoning}
- Functional Impact: {functionalImpact}

DOM CHANGES:
- Added elements: {addedCount}
- Removed elements: {removedCount}
- Modified elements: {modifiedCount}
- Moved elements: {movedCount}

CONSOLE LOGS (errors/warnings):
{consoleLogs}

NETWORK ERRORS:
{networkErrors}

HISTORICAL TREND (last 10 runs):
{historicalTrend}

CHANGED ELEMENTS DETAIL:
{changedElements}

ACCESSIBILITY ISSUES:
{a11yIssues}

Provide your analysis in this EXACT JSON format:
{
  "rootCause": "Primary technical cause (e.g., 'CSS class .btn-primary removed in PR #1234, breaking button styling')",
  "contributingFactors": ["Factor 1", "Factor 2"],
  "affectedUserFlows": ["Flow 1", "Flow 2"],
  "suggestedFix": "Specific code change to resolve (e.g., 'Restore .btn-primary class in components/Button.tsx line 42')",
  "preventionStrategy": "How to prevent regression (e.g., 'Add visual regression test for button variants; enforce CSS class naming convention via linting')",
  "severity": "critical|high|medium|low",
  "estimatedFixTime": "minutes|hours|days",
  "confidence": 0.95
}

Be specific, actionable, and reference actual selectors/code locations when possible.
`;

export class RootCauseAnalyzer {
  private client: OllamaVisionClient;

  constructor(ollamaBaseUrl: string = "http://localhost:11434", model: string = "llama3.1:8b") {
    this.client = new OllamaVisionClient({ baseUrl: ollamaBaseUrl, model });
  }

  async analyze(context: RootCauseContext): Promise<RootCauseAnalysis> {
    const prompt = this.buildPrompt(context);

    const response = await this.client.chat({
      model: this.client["config"].model,
      messages: [{ role: "user", content: prompt }],
      format: "json",
      options: { temperature: 0.2, num_predict: 2048 },
    });

    const parsed = JSON.parse(response.message.content);
    return this.validateAndNormalize(parsed);
  }

  private buildPrompt(context: RootCauseContext): string {
    const { visualDiff, domDiff, consoleLogs, networkErrors, previousRuns } = context;

    const errorLogs = consoleLogs.filter((l) => l.type === "error" || l.type === "warn").slice(0, 20);
    const consoleLogsText = errorLogs.length
      ? errorLogs.map((l) => `[${l.type.toUpperCase()}] ${l.text}`).join("\n")
      : "None";

    const networkErrorsText = networkErrors.length
      ? networkErrors.map((e) => `${e.url} → ${e.status} ${e.statusText}`).join("\n")
      : "None";

    const historicalText = previousRuns.length
      ? previousRuns.map((r) => `${r.date}: ${r.diffPercent}% ${r.status}${r.aiClassification ? ` (${r.aiClassification})` : ""}`).join("\n")
      : "No history";

    // Use AI analysis from visualDiff
    const classification = visualDiff.classification;
    const confidence = 0.8; // Default confidence from visual diff
    const reasoning = visualDiff.reasoning;

    const changedElementsText = "Derived from visual analysis";
    const a11yIssuesText = "Derived from visual analysis";

    return ROOT_CAUSE_PROMPT
      .replace("{pageName}", context.pageName)
      .replace("{url}", context.url)
      .replace("{viewport.width}", String(context.viewport.width))
      .replace("{viewport.height}", String(context.viewport.height))
      .replace("{classification}", classification)
      .replace("{confidence}", String(confidence))
      .replace("{reasoning}", reasoning)
      .replace("{functionalImpact}", visualDiff.classification === "FUNCTIONAL" ? "high" : "low")
      .replace("{addedCount}", String(domDiff.added.length))
      .replace("{removedCount}", String(domDiff.removed.length))
      .replace("{modifiedCount}", String(domDiff.modified.length))
      .replace("{movedCount}", String(domDiff.moved.length))
      .replace("{consoleLogs}", consoleLogsText)
      .replace("{networkErrors}", networkErrorsText)
      .replace("{historicalTrend}", historicalText)
      .replace("{changedElements}", changedElementsText)
      .replace("{a11yIssues}", a11yIssuesText);
  }

  private validateAndNormalize(parsed: unknown): RootCauseAnalysis {
    const p = parsed as Record<string, unknown>;
    return {
      rootCause: String(p.rootCause ?? "Unknown"),
      contributingFactors: Array.isArray(p.contributingFactors) ? p.contributingFactors.map(String) : [],
      affectedUserFlows: Array.isArray(p.affectedUserFlows) ? p.affectedUserFlows.map(String) : [],
      suggestedFix: String(p.suggestedFix ?? "Manual investigation required"),
      preventionStrategy: String(p.preventionStrategy ?? "Add test coverage"),
      severity: ["critical", "high", "medium", "low"].includes(String(p.severity))
        ? (p.severity as RootCauseAnalysis["severity"])
        : "medium",
      estimatedFixTime: ["minutes", "hours", "days"].includes(String(p.estimatedFixTime))
        ? (p.estimatedFixTime as RootCauseAnalysis["estimatedFixTime"])
        : "hours",
      confidence: Math.max(0, Math.min(1, Number(p.confidence) ?? 0.5)),
    };
  }
}

export const rootCauseAnalyzer = new RootCauseAnalyzer();