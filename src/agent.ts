import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { launchBrowser, openPage, takeScreenshot, a11yBaselinePath } from "./browser.js";
import { compareScreenshots, CompareResult } from "./compare.js";
import { generateReport } from "./reporter.js";
import { AIAnalysisEngine, EnhancedCompareResult, rootCauseAnalyzer } from "./ai/index.js";
import { a11yAnalyzer, A11yComparisonResult } from "./a11y/index.js";
import { performanceAnalyzer } from "./performance/index.js";
import { DatabaseService } from "./db/service.js";
import {
  Config,
  PageConfig,
  IgnoreZone,
  readConfig,
  BASELINES_DIR,
  CURRENT_DIR,
  DIFFS_DIR,
  REPORTS_DIR,
  screenshotPath,
} from "./config.js";

function collectIgnoreZones(config: Config, pageConf: PageConfig): {
  selectorSelectors: string[];
  boundingBoxZones: IgnoreZone[];
} {
  const allZones = [
    ...(config.globalIgnoreZones ?? []),
    ...(pageConf.ignoreZones ?? []),
  ];
  const selectorSelectors = allZones
    .filter((z) => z.type === "selector" && z.enabled && z.selector)
    .map((z) => z.selector!);
  const boundingBoxZones = allZones.filter(
    (z) => z.type === "bounding-box" && z.enabled
  );
  return { selectorSelectors, boundingBoxZones };
}

export async function runBaselineForPage(
  config: Config,
  pageConf: PageConfig
): Promise<void> {
  console.log(`\n📸 BASELINE – ${pageConf.name}`);
  fs.mkdirSync(BASELINES_DIR, { recursive: true });

  const { selectorSelectors } = collectIgnoreZones(config, pageConf);
  const mergedMask = [...(pageConf.mask ?? []), ...selectorSelectors];

  const browser = await launchBrowser();
  try {
    const { page } = await openPage(
      browser,
      pageConf.url,
      config.viewport,
      config.waitFor,
      pageConf.waitForSelector
    );
    await takeScreenshot(
      page,
      screenshotPath(BASELINES_DIR, pageConf.name),
      mergedMask
    );
    await page.close();
  } finally {
    await browser.close();
  }
}

export async function runBaseline(config: Config, pageNames?: string[]): Promise<void> {
  console.log("\n📸 מצב BASELINE – צילום תמונות בסיס\n");
  fs.mkdirSync(BASELINES_DIR, { recursive: true });

  const pages = pageNames
    ? config.pages.filter((p) => pageNames.includes(p.name))
    : config.pages;

  const browser = await launchBrowser();

  for (const pageConf of pages) {
    console.log(`\n[${pageConf.name}]`);
    try {
      const { selectorSelectors } = collectIgnoreZones(config, pageConf);
      const mergedMask = [...(pageConf.mask ?? []), ...selectorSelectors];

      const { page } = await openPage(
        browser,
        pageConf.url,
        config.viewport,
        config.waitFor,
        pageConf.waitForSelector
      );
      await takeScreenshot(
        page,
        screenshotPath(BASELINES_DIR, pageConf.name),
        mergedMask
      );
      await page.close();
    } catch (err) {
      console.error(`  ✗ שגיאה: ${(err as Error).message}`);
    }
  }

  await browser.close();
  console.log("\n✅ בייסליין נשמר בהצלחה!");
}

export async function runTestForPage(
  config: Config,
  pageConf: PageConfig
): Promise<EnhancedCompareResult> {
  console.log(`\n🔍 TEST – ${pageConf.name}`);
  fs.mkdirSync(CURRENT_DIR, { recursive: true });
  fs.mkdirSync(DIFFS_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const currentPath = screenshotPath(CURRENT_DIR, pageConf.name);
  const baselinePath = screenshotPath(BASELINES_DIR, pageConf.name);
  const diffPath = screenshotPath(DIFFS_DIR, pageConf.name);

  const { selectorSelectors, boundingBoxZones } = collectIgnoreZones(config, pageConf);
  const mergedMask = [...(pageConf.mask ?? []), ...selectorSelectors];

  const browser = await launchBrowser();
  try {
    const { page, captureData } = await openPage(
      browser,
      pageConf.url,
      config.viewport,
      config.waitFor,
      pageConf.waitForSelector
    );
    await takeScreenshot(page, currentPath, mergedMask);
    await page.close();

    // Use AI analysis engine
    const aiEngine = new AIAnalysisEngine(config.ai);
    const result = await aiEngine.analyze(
      pageConf.name,
      baselinePath,
      currentPath,
      diffPath,
      pageConf.threshold ?? config.threshold,
      pageConf,
      boundingBoxZones
    );

    return result;
  } catch (err) {
    console.error(`  ✗ שגיאה: ${(err as Error).message}`);
    return {
      pageName: pageConf.name,
      passed: false,
      diffPixels: 0,
      totalPixels: 0,
      diffPercent: 0,
      baselinePath,
      currentPath,
      diffPath: null,
      error: (err as Error).message,
    };
  } finally {
    await browser.close();
  }
}

export async function runTest(config: Config, pageNames?: string[]): Promise<EnhancedCompareResult[]> {
  console.log("\n🔍 מצב TEST – בדיקה מול הבייסליין\n");
  fs.mkdirSync(CURRENT_DIR, { recursive: true });
  fs.mkdirSync(DIFFS_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const pages = pageNames
    ? config.pages.filter((p) => pageNames.includes(p.name))
    : config.pages;

  // Initialize database (optional)
  const useDatabase = !!process.env.DATABASE_URL;
  let db: DatabaseService | null = null;
  if (useDatabase) {
    db = new DatabaseService();
    try {
      await db.connect();
    } catch (err) {
      console.warn(`⚠️  Database connection failed, continuing without persistence: ${(err as Error).message}`);
      db = null;
    }
  } else {
    console.log("ℹ️  No DATABASE_URL set, running without database persistence");
  }

  const browser = await launchBrowser();
  const results: EnhancedCompareResult[] = [];

  for (const pageConf of pages) {
    console.log(`\n[${pageConf.name}]`);
    const currentPath = screenshotPath(CURRENT_DIR, pageConf.name);
    const baselinePath = screenshotPath(BASELINES_DIR, pageConf.name);
    const diffPath = screenshotPath(DIFFS_DIR, pageConf.name);

    const { selectorSelectors, boundingBoxZones } = collectIgnoreZones(config, pageConf);
    const mergedMask = [...(pageConf.mask ?? []), ...selectorSelectors];

    try {
      const { page, captureData } = await openPage(
        browser,
        pageConf.url,
        config.viewport,
        config.waitFor,
        pageConf.waitForSelector
      );
      await takeScreenshot(page, currentPath, mergedMask);

      // Run accessibility analysis BEFORE closing page
      console.log(`  ♿ Running accessibility analysis...`);
      const a11yResult = await a11yAnalyzer.analyzePage(page, pageConf.url, config.viewport);
      
      if (a11yResult.violations.length > 0) {
        const critical = a11yResult.violations.filter((v: any) => v.impact === "critical").length;
        const serious = a11yResult.violations.filter((v: any) => v.impact === "serious").length;
        console.log(`  ♿ A11y: ${a11yResult.violations.length} violations (critical: ${critical}, serious: ${serious})`);
      } else {
        console.log(`  ♿ A11y: No violations found ✅`);
      }

      // Compare with baseline a11y if exists
      const baselineA11yPath = a11yBaselinePath(pageConf.name);
      let a11yComparison: A11yComparisonResult | null = null;
      let aiA11y: any = null;
      if (fs.existsSync(baselineA11yPath)) {
        try {
          const baselineA11y = JSON.parse(fs.readFileSync(baselineA11yPath, "utf-8"));
          const comparison = await a11yAnalyzer.compareA11y(baselineA11y, a11yResult);
          a11yComparison = comparison;
          
          if (comparison.regressionScore > 0) {
            console.log(`  ♿ A11y regression: ${(comparison.regressionScore * 100).toFixed(1)}%`);
            console.log(`  ♿ ${comparison.summary}`);
            
            // AI analysis of a11y regression
            const aiA11y = await a11yAnalyzer.analyzeWithAI(comparison, pageConf.name, pageConf.url);
            console.log(`  ♿ Root cause: ${aiA11y.rootCause}`);
          }
        } catch (e) {
          console.warn(`  ⚠️  A11y comparison failed: ${(e as Error).message}`);
        }
      } else {
        // Save as new baseline
        fs.writeFileSync(baselineA11yPath, JSON.stringify(a11yResult, null, 2));
        console.log(`  ♿ Saved A11y baseline`);
      }

      // Run performance analysis BEFORE closing page
      console.log(`  📊 Running performance analysis...`);
      const perfResult = await performanceAnalyzer.analyzePage(page, pageConf.url, config.viewport);
      
      if (perfResult.budgetViolations.length > 0) {
        console.log(`  📊 Performance: ${perfResult.budgetViolations.length} budget violations`);
        for (const v of perfResult.budgetViolations) {
          console.log(`    ${v.severity.toUpperCase()}: ${v.metric} = ${v.actual} (budget: ${v.budget})`);
        }
      } else {
        console.log(`  📊 Performance: All metrics within budget ✅`);
      }

      // Compare with baseline performance if exists
      const baselinePerfPath = path.join(BASELINES_DIR, `${pageConf.name}.perf.json`);
      let perfComparison: any = null;
      if (fs.existsSync(baselinePerfPath)) {
        try {
          const baselinePerf = JSON.parse(fs.readFileSync(baselinePerfPath, "utf-8"));
          const currentVitals = perfResult.lighthouse.coreWebVitals;
          const baselineVitals = baselinePerf.lighthouse?.coreWebVitals || {};
          
          const regressions: string[] = [];
          if (currentVitals.lcp > baselineVitals.lcp * 1.2) regressions.push("LCP");
          if (currentVitals.fid > baselineVitals.fid * 1.2) regressions.push("FID");
          if (currentVitals.cls > baselineVitals.cls * 1.2) regressions.push("CLS");
          if (currentVitals.fcp > baselineVitals.fcp * 1.2) regressions.push("FCP");
          if (currentVitals.inp > baselineVitals.inp * 1.2) regressions.push("INP");
          
          if (regressions.length > 0) {
            console.log(`  📊 Performance regression: ${regressions.join(", ")}`);
            const aiPerf = await performanceAnalyzer.analyzeWithAI(
              { current: currentVitals, baseline: baselineVitals, regressions },
              pageConf.name,
              pageConf.url
            );
            console.log(`  📊 Root cause: ${aiPerf.rootCause}`);
            perfComparison = { current: currentVitals, baseline: baselineVitals, regressions, ai: aiPerf };
          }
        } catch (e) {
          console.warn(`  ⚠️  Performance comparison failed: ${(e as Error).message}`);
        }
      } else {
        // Save as new baseline
        fs.writeFileSync(baselinePerfPath, JSON.stringify(perfResult, null, 2));
        console.log(`  📊 Saved Performance baseline`);
      }

      await page.close();

      // Use AI analysis engine
      const aiEngine = new AIAnalysisEngine(config.ai);
      const result = await aiEngine.analyze(
        pageConf.name,
        baselinePath,
        currentPath,
        diffPath,
        pageConf.threshold ?? config.threshold,
        pageConf,
        boundingBoxZones
      );

      // Attach a11y data to result
      (result as any).a11y = a11yResult;
      (result as any).a11yComparison = a11yComparison;
      (result as any).a11yAI = null;
      (result as any).performance = perfResult;
      (result as any).performanceComparison = perfComparison;

      // Run root cause analysis for failures
      if (!result.passed && result.aiAnalysis) {
        console.log(`  🔬 Running root cause analysis...`);
        const rootCause = await rootCauseAnalyzer.analyze({
          pageName: pageConf.name,
          url: pageConf.url,
          viewport: config.viewport,
          visualDiff: {
            classification: result.aiAnalysis.classification,
            diffPercent: result.diffPercent,
            reasoning: result.aiAnalysis.reasoning,
          },
          domDiff: {
            added: [],
            removed: [],
            modified: result.aiAnalysis.changedElements.map((el) => ({
              selector: el.selector,
              oldAttrs: {},
              newAttrs: {},
            })),
            moved: [],
          },
          consoleLogs: captureData.consoleLogs,
          networkErrors: captureData.networkErrors,
          previousRuns: [],
        });
        (result as any).rootCause = rootCause;
        console.log(`  🎯 Root cause: ${rootCause.rootCause}`);
        console.log(`  💡 Suggested fix: ${rootCause.suggestedFix}`);
      }

      // Persist to database
      if (db) {
        try {
          await db.saveTestRun(pageConf.name, result, config, result.aiMetadata);
        } catch (dbErr) {
          console.warn(`  ⚠️  DB save failed: ${(dbErr as Error).message}`);
        }
      }

      results.push(result);

      if (result.error) {
        console.log(`  ⚠️  ${result.error}`);
      } else if (result.passed) {
        const aiInfo = result.aiAnalysis
          ? ` | 🤖 ${result.aiAnalysis.classification} (${(result.aiAnalysis.confidence * 100).toFixed(0)}%)`
          : "";
        console.log(`  ✅ עבר (${result.diffPercent}% שינוי)${aiInfo}`);
      } else {
        const aiInfo = result.aiAnalysis
          ? ` | 🤖 ${result.aiAnalysis.classification} - ${result.aiAnalysis.reasoning}`
          : "";
        console.log(
          `  ❌ נכשל! ${result.diffPercent}% שינוי (${result.diffPixels} פיקסלים)${aiInfo}`
        );
      }
    } catch (err) {
      console.error(`  ✗ שגיאה: ${(err as Error).message}`);
      results.push({
        pageName: pageConf.name,
        passed: false,
        diffPixels: 0,
        totalPixels: 0,
        diffPercent: 0,
        baselinePath,
        currentPath,
        diffPath: null,
        error: (err as Error).message,
      });
    }
  }

  await browser.close();
  if (db) await db.disconnect();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${"─".repeat(40)}`);
  console.log(`סיכום: ${passed} עברו ✅  |  ${failed} נכשלו ❌`);

  const reportPath = path.join(REPORTS_DIR, `report-${Date.now()}.html`);
  generateReport(results, reportPath);

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const modeArg = args.find((a) => a.startsWith("--mode="));
  const mode = modeArg?.split("=")[1] ?? "test";

  const config = readConfig();
  const pagesEnv = process.env.PAGES;
  const pageNames = pagesEnv && pagesEnv.trim() !== "" && pagesEnv !== "all"
    ? pagesEnv.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  if (mode === "baseline") {
    await runBaseline(config, pageNames);
  } else if (mode === "test") {
    const results = await runTest(config, pageNames);
    const failed = results.filter((r) => !r.passed).length;
    if (failed > 0) process.exit(1);
  } else {
    console.error(`❌ מצב לא מוכר: ${mode}. השתמש ב: baseline | test`);
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  main().catch((err) => {
    console.error("שגיאה:", err);
    process.exit(1);
  });
}