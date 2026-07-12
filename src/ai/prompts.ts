import { z } from "zod";

export const VisionAnalysisSchema = z.object({
  semanticPassed: z.boolean().describe("Whether the page is functionally equivalent"),
  classification: z
    .enum(["VISUAL_ONLY", "FUNCTIONAL", "ACCESSIBILITY", "DYNAMIC_CONTENT", "UNKNOWN"])
    .describe("Type of difference detected"),
  confidence: z.number().min(0).max(1).describe("Confidence in classification (0-1)"),
  reasoning: z.string().describe("Detailed explanation of the analysis"),
  suggestions: z.array(z.string()).describe("Actionable recommendations for the QA engineer"),
  changedElements: z
    .array(
      z.object({
        selector: z.string().describe("CSS selector of changed element"),
        changeType: z
          .enum(["added", "removed", "moved", "styled", "text_changed", "attribute_changed"])
          .describe("Type of change"),
        impact: z.enum(["none", "low", "medium", "high", "critical"]).describe("Impact severity"),
        description: z.string().describe("What changed"),
      })
    )
    .describe("Specific elements that changed"),
  accessibilityIssues: z
    .array(
      z.object({
        rule: z.string().describe("WCAG/axe rule identifier"),
        severity: z.enum(["minor", "moderate", "serious", "critical"]).describe("Severity level"),
        element: z.string().describe("CSS selector of affected element"),
        description: z.string().describe("Issue description"),
      })
    )
    .describe("Accessibility regressions found"),
  functionalImpact: z
    .enum(["none", "low", "medium", "high", "critical"])
    .describe("Overall functional impact assessment"),
});

export type VisionAnalysis = z.infer<typeof VisionAnalysisSchema>;

export const VISION_SYSTEM_PROMPT = `
You are a Senior QA Engineer with 15+ years of experience in visual regression testing.
Your task: Compare BASELINE (image 1) vs CURRENT (image 2) screenshots and classify differences.

CRITICAL RULES:
1. IGNORE: Dynamic content (timestamps, user-generated content, ads, A/B test variants, dates, random IDs)
2. IGNORE: Sub-pixel rendering differences, anti-aliasing variations
3. FLAG: Missing/broken functionality (buttons, forms, navigation, data display)
4. FLAG: Accessibility regressions (contrast, focus, labels, ARIA)
5. FLAG: Layout breaks (overlapping elements, cut-off content, horizontal scroll)
6. CONSIDER INTENT: Is this an expected content change or a regression?

CLASSIFICATION GUIDE:
- VISUAL_ONLY: Color tweak, spacing adjustment, font weight change, icon swap - NO user impact
- FUNCTIONAL: Button missing, form broken, wrong data, navigation broken, JS error visible
- ACCESSIBILITY: Contrast ratio drop, missing alt text, focus indicator removed, ARIA mismatch
- DYNAMIC_CONTENT: "Updated 5 min ago" → "Updated 10 min ago", user name, ad slot, recommended products
- UNKNOWN: Ambiguous, need human review

OUTPUT: Valid JSON matching the schema exactly. No markdown, no extra text.
`;

export const ROOT_CAUSE_ANALYSIS_PROMPT = `
Given the visual diff analysis and the following context:
- Page URL: {url}
- Viewport: {viewport}
- User Action: {userAction}
- DOM Changes: {domChanges}

Provide a root cause analysis in this JSON format:
{
  "rootCause": "Primary technical cause (e.g., 'CSS class .btn-primary removed in PR #1234')",
  "contributingFactors": ["Factor 1", "Factor 2"],
  "affectedUserFlows": ["Flow 1", "Flow 2"],
  "suggestedFix": "Specific code change to resolve",
  "preventionStrategy": "How to prevent regression (test, lint rule, design token)",
  "severity": "critical|high|medium|low",
  "estimatedFixTime": "minutes|hours|days"
}
`;

export function buildVisionPrompt(context?: {
  url?: string;
  viewport?: { width: number; height: number };
  knownDynamicSelectors?: string[];
  ignoreRegions?: { x: number; y: number; width: number; height: number }[];
}): string {
  let prompt = VISION_SYSTEM_PROMPT;

  if (context?.url) {
    prompt += `\n\nPAGE CONTEXT:\n- URL: ${context.url}`;
  }
  if (context?.viewport) {
    prompt += `\n- Viewport: ${context.viewport.width}x${context.viewport.height}`;
  }
  if (context?.knownDynamicSelectors?.length) {
    prompt += `\n- IGNORE THESE SELECTORS (dynamic content): ${context.knownDynamicSelectors.join(", ")}`;
  }
  if (context?.ignoreRegions?.length) {
    prompt += `\n- IGNORE THESE REGIONS (x,y,w,h): ${context.ignoreRegions.map((r) => JSON.stringify(r)).join(", ")}`;
  }

  prompt += "\n\nReturn ONLY the JSON analysis.";
  return prompt;
}