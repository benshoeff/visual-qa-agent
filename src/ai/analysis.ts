import fs from "fs";
import path from "path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { OllamaVisionClient, buildVisionPrompt } from "./index.js";
import { CompareResult } from "../compare.js";
import { PageConfig, IgnoreZone, BASELINES_DIR, CURRENT_DIR, DIFFS_DIR, screenshotPath } from "../config.js";

export interface VisionAnalysis {
  semanticPassed: boolean;
  classification: "VISUAL_ONLY" | "FUNCTIONAL" | "ACCESSIBILITY" | "DYNAMIC_CONTENT" | "UNKNOWN";
  confidence: number;
  reasoning: string;
  suggestions: string[];
  changedElements: Array<{
    selector: string;
    changeType: "added" | "removed" | "moved" | "styled" | "text_changed" | "attribute_changed";
    impact: "none" | "low" | "medium" | "high" | "critical";
    description: string;
  }>;
  accessibilityIssues: Array<{
    rule: string;
    severity: "minor" | "moderate" | "serious" | "critical";
    element: string;
    description: string;
  }>;
  functionalImpact: "none" | "low" | "medium" | "high" | "critical";
}

export interface AIAnalysisMetadata {
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  tokensUsed?: number;
}

export interface EnhancedCompareResult extends CompareResult {
  aiAnalysis?: VisionAnalysis;
  aiMetadata?: AIAnalysisMetadata;
}

export interface AIConfig {
  enabled: boolean;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  autoApproveThreshold: number;
  autoRejectThreshold: number;
  fallbackToPixelMatch: boolean;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  enabled: process.env.AI_ENABLED === "true",
  model: process.env.OLLAMA_MODEL ?? "llama3.2-vision:11b",
  baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  timeoutMs: parseInt(process.env.OLLAMA_TIMEOUT_MS ?? "120000"),
  maxRetries: parseInt(process.env.OLLAMA_MAX_RETRIES ?? "2"),
  autoApproveThreshold: parseFloat(process.env.AI_AUTO_APPROVE_THRESHOLD ?? "0.05"),
  autoRejectThreshold: parseFloat(process.env.AI_AUTO_REJECT_THRESHOLD ?? "1.0"),
  fallbackToPixelMatch: process.env.AI_FALLBACK !== "false",
};

export class AIAnalysisEngine {
  private client: OllamaVisionClient;
  private config: AIConfig;

  constructor(config: Partial<AIConfig> = {}) {
    this.config = { ...DEFAULT_AI_CONFIG, ...config };
    this.client = new OllamaVisionClient({
      model: this.config.model,
      baseUrl: this.config.baseUrl,
      timeoutMs: this.config.timeoutMs,
      maxRetries: this.config.maxRetries,
    });
  }

  async analyze(
    pageName: string,
    baselinePath: string,
    currentPath: string,
    diffPath: string,
    threshold: number,
    pageConf: PageConfig,
    ignoreZones: IgnoreZone[] = []
  ): Promise<EnhancedCompareResult> {
    const startTime = Date.now();

    // First, do pixel comparison
    const pixelResult = this.pixelCompare(pageName, baselinePath, currentPath, diffPath, threshold, ignoreZones);

    // If AI is disabled or pixel match is perfect, return pixel result
    if (!this.config.enabled) {
      return { ...pixelResult, aiMetadata: { model: "none", latencyMs: 0, fallbackUsed: false } };
    }

    // If pixel diff is very small, skip AI (fast path)
    if (pixelResult.diffPercent < this.config.autoApproveThreshold * 100) {
      return { ...pixelResult, aiMetadata: { model: "none", latencyMs: 0, fallbackUsed: false, fallbackReason: "Below auto-approve threshold" } };
    }

    // If baseline doesn't exist, can't do AI analysis
    if (!fs.existsSync(baselinePath)) {
      return { ...pixelResult, aiMetadata: { model: "none", latencyMs: 0, fallbackUsed: true, fallbackReason: "Baseline not found" } };
    }

    try {
      // Check if Ollama is available
      const health = await this.client.checkHealth();
      if (!health) {
        throw new Error("Ollama not available");
      }

      // Convert images to base64
      const baselineB64 = this.imageToBase64(baselinePath);
      const currentB64 = this.imageToBase64(currentPath);

      // Build prompt with context
      const prompt = buildVisionPrompt({
        url: pageConf.url,
        viewport: { width: 1280, height: 720 }, // TODO: get from config
        knownDynamicSelectors: pageConf.mask,
      });

      // Run AI analysis
      const aiResult = await this.client.analyzeImages(baselineB64, currentB64, prompt);

      const latencyMs = Date.now() - startTime;

      // Merge pixel and AI results
      const merged = this.mergeResults(pixelResult, aiResult, threshold);

      return {
        ...merged,
        aiAnalysis: aiResult,
        aiMetadata: {
          model: this.config.model,
          latencyMs,
          fallbackUsed: false,
          tokensUsed: aiResult.changedElements.length * 50, // rough estimate
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      console.warn(`  ⚠️  AI analysis failed for ${pageName}: ${(error as Error).message}`);

      if (this.config.fallbackToPixelMatch) {
        return {
          ...pixelResult,
          aiMetadata: {
            model: this.config.model,
            latencyMs,
            fallbackUsed: true,
            fallbackReason: (error as Error).message,
          },
        };
      }

      throw error;
    }
  }

  private pixelCompare(
    pageName: string,
    baselinePath: string,
    currentPath: string,
    diffPath: string,
    threshold: number,
    ignoreZones: IgnoreZone[] = []
  ): CompareResult {
    if (!fs.existsSync(baselinePath)) {
      return {
        pageName,
        passed: false,
        diffPixels: 0,
        totalPixels: 0,
        diffPercent: 0,
        baselinePath,
        currentPath,
        diffPath: null,
        error: "Baseline not found – run baseline mode first",
      };
    }

    const baselineImg = PNG.sync.read(fs.readFileSync(baselinePath));
    const currentImg = PNG.sync.read(fs.readFileSync(currentPath));

    if (baselineImg.width !== currentImg.width || baselineImg.height !== currentImg.height) {
      return {
        pageName,
        passed: false,
        diffPixels: 0,
        totalPixels: 0,
        diffPercent: 0,
        baselinePath,
        currentPath,
        diffPath: null,
        error: `Size mismatch: baseline ${baselineImg.width}x${baselineImg.height} vs current ${currentImg.width}x${currentImg.height}`,
      };
    }

    const { width, height } = baselineImg;
    const pixels = width * height;
    const diffImg = new PNG({ width, height });

    const boundingBoxZones = ignoreZones.filter(
      (z) => z.type === "bounding-box" && z.enabled
    );

    if (boundingBoxZones.length > 0) {
      const NEUTRAL = [128, 128, 128, 255];
      for (const img of [baselineImg, currentImg]) {
        for (const zone of boundingBoxZones) {
          if (zone.x == null || zone.y == null || zone.width == null || zone.height == null) continue;
          const x2 = Math.min(zone.x + zone.width, width);
          const y2 = Math.min(zone.y + zone.height, height);
          for (let py: number = zone.y; py < y2; py++) {
            for (let px: number = zone.x; px < x2; px++) {
              const offset = (py * width + px) * 4;
              img.data[offset] = NEUTRAL[0];
              img.data[offset + 1] = NEUTRAL[1];
              img.data[offset + 2] = NEUTRAL[2];
              img.data[offset + 3] = NEUTRAL[3];
            }
          }
        }
      }
    }

    const diffPixels = pixelmatch(
      baselineImg.data,
      currentImg.data,
      diffImg.data,
      width,
      height,
      { threshold: 0.1, includeAA: false }
    );

    const ignoredPixels = boundingBoxZones.reduce((sum, z) => {
      if (z.x == null || z.y == null || z.width == null || z.height == null) return sum;
      return sum + Math.min(z.width, width - z.x) * Math.min(z.height, height - z.y);
    }, 0);
    const effectivePixels = pixels - ignoredPixels;
    const diffPercent = effectivePixels > 0 ? (diffPixels / effectivePixels) * 100 : 0;
    const passed = diffPercent <= threshold * 100;

    if (diffPixels > 0) {
      fs.mkdirSync(path.dirname(diffPath), { recursive: true });
      fs.writeFileSync(diffPath, PNG.sync.write(diffImg));
    }

    return {
      pageName,
      passed,
      diffPixels,
      totalPixels: pixels,
      diffPercent: parseFloat(diffPercent.toFixed(4)),
      baselinePath,
      currentPath,
      diffPath: diffPixels > 0 ? diffPath : null,
    };
  }

  private mergeResults(
    pixelResult: CompareResult,
    aiResult: VisionAnalysis,
    threshold: number
  ): CompareResult {
    // AI override logic
    let finalPassed = pixelResult.passed;

    if (aiResult.semanticPassed && aiResult.confidence > 0.8) {
      // AI says it's functionally equivalent with high confidence
      finalPassed = true;
    } else if (!aiResult.semanticPassed && aiResult.functionalImpact === "critical") {
      // AI detected critical functional regression
      finalPassed = false;
    } else if (aiResult.classification === "DYNAMIC_CONTENT" && aiResult.confidence > 0.7) {
      // AI confident this is expected dynamic content
      finalPassed = true;
    } else if (aiResult.classification === "VISUAL_ONLY" && aiResult.confidence > 0.7) {
      // AI says only visual, no functional impact
      finalPassed = true;
    }

    return {
      ...pixelResult,
      passed: finalPassed,
      // Keep original pixel diff percent but note AI classification
    };
  }

  private imageToBase64(imagePath: string): string {
    const buffer = fs.readFileSync(imagePath);
    return buffer.toString("base64");
  }

  async healthCheck(): Promise<boolean> {
    return await this.client.checkHealth();
  }

  updateConfig(config: Partial<AIConfig>): void {
    this.config = { ...this.config, ...config };
    this.client = new OllamaVisionClient({
      model: this.config.model,
      baseUrl: this.config.baseUrl,
      timeoutMs: this.config.timeoutMs,
      maxRetries: this.config.maxRetries,
    });
  }

  getConfig(): AIConfig {
    return { ...this.config };
  }
}

export const aiAnalysisEngine = new AIAnalysisEngine();