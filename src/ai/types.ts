export interface AIDiffAnalysis {
  passed: boolean;
  diffPercent: number;
  diffSummary: string;
  functionalImpact: "none" | "cosmetic" | "functional" | "critical";
  rootCause: string;
  suggestedAction: "accept" | "investigate" | "reject" | "update_baseline";
  confidence: number;
  details: {
    layoutShift: boolean;
    colorChange: boolean;
    contentChange: boolean;
    dynamicContent: boolean;
    accessibilityImpact: boolean;
  };
  analyzedAt: string;
  model: string;
  tokensUsed?: number;
}

export interface AIRootCauseAnalysis {
  rootCause: string;
  suggestedFix: string;
  relatedSelectors: string[];
  confidence: number;
  analyzedAt: string;
}

export interface AITestGenerationResult {
  testCases: Array<{
    name: string;
    description: string;
    selector: string;
    action: string;
    expected: string;
  }>;
  selectors: string[];
}

export interface AIConfig {
  enabled: boolean;
  visionModel: string;
  textModel: string;
  ollamaHost: string;
  thresholdPercent: number;
  autoApproveThreshold: number;
  autoRejectThreshold: number;
  fallbackToPixelMatch: boolean;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  enabled: true,
  visionModel: "llava:13b",
  textModel: "llama3.1:8b",
  ollamaHost: "http://localhost:11434",
  thresholdPercent: 0.1,
  autoApproveThreshold: 0.05,
  autoRejectThreshold: 1.0,
  fallbackToPixelMatch: true,
};

export type AIAnalysisMode = "full" | "selective" | "disabled";

export interface AIAnalysisContext {
  pageName: string;
  url: string;
  viewport: { width: number; height: number };
  threshold: number;
  previousRuns?: number;
  history?: Array<{
    diffPercent: number;
    passed: boolean;
    action: string;
  }>;
}