import { Ollama } from "ollama";
import { z } from "zod";
import { VisionAnalysisSchema, type VisionAnalysis } from "./prompts.js";

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
}

const DEFAULT_CONFIG: OllamaConfig = {
  baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  model: process.env.OLLAMA_MODEL ?? "llama3.2-vision:11b",
  timeoutMs: parseInt(process.env.OLLAMA_TIMEOUT_MS ?? "120000"),
  maxRetries: parseInt(process.env.OLLAMA_MAX_RETRIES ?? "2"),
};

export class OllamaVisionClient {
  private client: Ollama;
  private config: OllamaConfig;

  constructor(config: Partial<OllamaConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.client = new Ollama({ host: this.config.baseUrl });
  }

  async analyzeImages(
    baselineB64: string,
    currentB64: string,
    customPrompt?: string
  ): Promise<VisionAnalysis> {
    const prompt = customPrompt ?? this.getDefaultPrompt();

    const response = await this.withRetry(async () => {
      return await this.client.chat({
        model: this.config.model,
        messages: [
          {
            role: "user",
            content: prompt,
            images: [baselineB64, currentB64],
          },
        ],
        format: VisionAnalysisSchema.shape,
        options: {
          temperature: 0.1,
          num_predict: 2048,
        },
      });
    });

    const parsed = VisionAnalysisSchema.safeParse(
      JSON.parse(response.message.content)
    );

    if (!parsed.success) {
      throw new Error(`AI response validation failed: ${parsed.error.message}`);
    }

    return parsed.data;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const models = await this.client.list();
      return models.models.some((m) => m.name.includes(this.config.model.split(":")[0]));
    } catch {
      return false;
    }
  }

  async chat(params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    format?: string;
    options?: Record<string, unknown>;
  }): Promise<{ message: { content: string } }> {
    return this.client.chat(params);
  }

  async pullModel(): Promise<void> {
    const stream = await this.client.pull({ model: this.config.model, stream: true });
    let completed = false;
    for await (const progress of stream) {
      if (progress.status === "success") {
        completed = true;
      }
    }
    if (!completed) {
      throw new Error(`Failed to pull model ${this.config.model}`);
    }
  }

  private getDefaultPrompt(): string {
    return `
You are a senior QA engineer analyzing visual regression test results.
Compare the BASELINE (first image) vs CURRENT (second image).

Classify the difference into EXACTLY ONE category:
- VISUAL_ONLY: Cosmetic changes (color, spacing, font) - NO functional impact
- FUNCTIONAL: Behavior changed (missing button, broken flow, wrong data, navigation broken)
- ACCESSIBILITY: Contrast, labels, focus order, ARIA issues
- DYNAMIC_CONTENT: Expected changes (timestamps, ads, user content, A/B tests, dates)
- UNKNOWN: Cannot determine

Return structured JSON only. Be precise and actionable.`;
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.config.maxRetries) {
          const delay = Math.min(1000 * 2 ** attempt, 10000);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError;
  }
}

export function createVisionClient(config?: Partial<OllamaConfig>): OllamaVisionClient {
  return new OllamaVisionClient(config);
}

export function imageToBase64(imagePath: string): string {
  const fs = require("fs");
  const buffer = fs.readFileSync(imagePath);
  return buffer.toString("base64");
}