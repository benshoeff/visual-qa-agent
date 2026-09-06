import { prisma } from "./client.js";
import { PageConfig, Config } from "../config.js";
import { EnhancedCompareResult } from "../ai/analysis.js";

export class DatabaseService {
  async connect(): Promise<void> {
    await prisma.$connect();
    console.log("✅ Database connected");
  }

  async disconnect(): Promise<void> {
    await prisma.$disconnect();
  }

  private async ensureProject(projectId: string, projectName?: string, baseUrl?: string): Promise<void> {
    await prisma.project.upsert({
      where: { id: projectId },
      update: projectName || baseUrl
        ? { name: projectName ?? undefined, baseUrl: baseUrl ?? undefined }
        : {},
      create: {
        id: projectId,
        name: projectName ?? projectId,
        baseUrl: baseUrl ?? "",
      },
    });
  }

  async upsertPage(projectId: string, pageConf: PageConfig): Promise<{ id: string }> {
    await this.ensureProject(projectId);
    const page = await prisma.page.upsert({
      where: { projectId_name: { projectId, name: pageConf.name } },
      update: {
        url: pageConf.url,
        waitForSelector: pageConf.waitForSelector,
        mask: pageConf.mask ?? [],
        threshold: pageConf.threshold,
      },
      create: {
        projectId,
        name: pageConf.name,
        url: pageConf.url,
        waitForSelector: pageConf.waitForSelector,
        mask: pageConf.mask ?? [],
        threshold: pageConf.threshold,
      },
    });
    return { id: page.id };
  }

  async getPages(projectId?: string): Promise<Array<{ id: string; projectId: string; name: string; url: string; threshold?: number }>> {
    const pages = await prisma.page.findMany({
      where: projectId ? { projectId } : undefined,
      select: { id: true, projectId: true, name: true, url: true, threshold: true },
      orderBy: { name: "asc" },
    });
    return pages.map((p) => ({
      id: p.id,
      projectId: p.projectId,
      name: p.name,
      url: p.url,
      threshold: p.threshold ?? undefined,
    }));
  }

  async getPageByName(projectId: string, name: string) {
    return prisma.page.findUnique({ where: { projectId_name: { projectId, name } } });
  }

  async deletePage(projectId: string, name: string): Promise<void> {
    await prisma.page.deleteMany({ where: { projectId, name } });
  }

  async saveBaseline(projectId: string, pageName: string, imagePath: string, imageHash: string, viewport: { width: number; height: number }): Promise<string> {
    const page = await prisma.page.findUnique({ where: { projectId_name: { projectId, name: pageName } } });
    if (!page) throw new Error(`Page ${pageName} not found`);

    const baseline = await prisma.baseline.upsert({
      where: { imageHash },
      update: { imagePath, viewport },
      create: { pageId: page.id, imagePath, imageHash, viewport },
    });
    return baseline.id;
  }

  async getLatestBaseline(projectId: string, pageName: string) {
    const page = await prisma.page.findUnique({ where: { projectId_name: { projectId, name: pageName } } });
    if (!page) return null;

    return prisma.baseline.findFirst({
      where: { pageId: page.id },
      orderBy: { createdAt: "desc" },
    });
  }

  async saveTestRun(
    projectId: string,
    pageName: string,
    result: EnhancedCompareResult,
    config: Config,
    aiMetadata?: { model: string; latencyMs: number; fallbackUsed: boolean }
  ): Promise<string> {
    await this.ensureProject(projectId);
    const page = await prisma.page.findUnique({ where: { projectId_name: { projectId, name: pageName } } });
    if (!page) throw new Error(`Page ${pageName} not found`);

    const baseline = await this.getLatestBaseline(projectId, pageName);

    const testRun = await prisma.testRun.create({
      data: {
        pageId: page.id,
        baselineId: baseline?.id,
        status: this.mapStatus(result) as any,
        diffPercent: result.diffPercent,
        diffPixels: result.diffPixels,
        totalPixels: result.totalPixels,
        currentPath: result.currentPath,
        diffPath: result.diffPath,
        error: result.error,
        aiAnalysis: result.aiAnalysis ? {
          model: aiMetadata?.model ?? "unknown",
          passed: result.aiAnalysis.semanticPassed,
          diffPercent: result.aiAnalysis.confidence,
          functionalImpact: result.aiAnalysis.functionalImpact,
          rootCause: result.aiAnalysis.reasoning,
          suggestedAction: result.aiAnalysis.classification,
          confidence: result.aiAnalysis.confidence,
          details: {
            classification: result.aiAnalysis.classification,
            suggestions: result.aiAnalysis.suggestions,
            changedElements: result.aiAnalysis.changedElements,
            accessibilityIssues: result.aiAnalysis.accessibilityIssues,
          },
          tokensUsed: aiMetadata ? Math.round(aiMetadata.latencyMs / 10) : undefined,
        } : undefined,
        startedAt: new Date(Date.now() - (aiMetadata?.latencyMs ?? 0)),
        completedAt: new Date(),
        duration: aiMetadata?.latencyMs ?? 0,
      },
    });

    // Update flaky test tracking
    await this.updateFlakyTestTracking(page.id, result);

    return testRun.id;
  }

  private mapStatus(result: EnhancedCompareResult): string {
    if (result.error) return "ERROR";
    if (!result.passed) return "FAILED";
    if (result.aiAnalysis?.classification === "FUNCTIONAL" || result.aiAnalysis?.classification === "ACCESSIBILITY") {
      return "AI_REJECTED";
    }
    if (result.aiAnalysis?.classification === "DYNAMIC_CONTENT" || result.aiAnalysis?.classification === "VISUAL_ONLY") {
      return "AI_ACCEPTED";
    }
    return "PASSED";
  }

  private async updateFlakyTestTracking(pageId: string, result: EnhancedCompareResult): Promise<void> {
    if (result.error) return;

    const recentRuns = await prisma.testRun.findMany({
      where: { pageId },
      orderBy: { startedAt: "desc" },
      take: 10,
    });

    if (recentRuns.length < 3) return;

    const failures = recentRuns.filter((r) => r.status === "FAILED" || r.status === "AI_REJECTED").length;
    const failureRate = failures / recentRuns.length;

    if (failureRate > 0.3) {
      await prisma.flakyTest.upsert({
        where: { pageId },
        update: {
          failureRate,
          lastFailure: new Date(),
          occurrences: { increment: 1 },
          quarantined: failureRate > 0.5,
        },
        create: {
          pageId,
          failureRate,
          lastFailure: new Date(),
          occurrences: 1,
          quarantined: failureRate > 0.5,
        },
      });
    }
  }

  async getTestHistory(projectId: string, pageName?: string, limit = 50) {
    const where = pageName ? { page: { projectId, name: pageName } } : { page: { projectId } };
    return prisma.testRun.findMany({
      where,
      include: { page: true, aiAnalysisRel: true },
      orderBy: { startedAt: "desc" },
      take: limit,
    });
  }

  async getFlakyTests() {
    return prisma.flakyTest.findMany({
      include: { page: true },
      orderBy: { failureRate: "desc" },
    });
  }

  async getTrends(projectId: string, pageName: string, days = 30) {
    const page = await prisma.page.findUnique({ where: { projectId_name: { projectId, name: pageName } } });
    if (!page) return [];

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const runs = await prisma.testRun.findMany({
      where: { pageId: page.id, startedAt: { gte: since } },
      orderBy: { startedAt: "asc" },
    });

    return runs.map((r) => ({
      date: r.startedAt.toISOString().split("T")[0],
      diffPercent: r.diffPercent,
      status: r.status,
      passed: r.status === "PASSED" || r.status === "AI_ACCEPTED",
    }));
  }

  async saveReport(filename: string, path: string, size: number, testRunIds: string[]): Promise<void> {
    await prisma.report.create({
      data: { filename, path, size, testRuns: { connect: testRunIds.map((id) => ({ id })) } },
    });
  }

  async getReports(limit = 50) {
    return prisma.report.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}

export const db = new DatabaseService();