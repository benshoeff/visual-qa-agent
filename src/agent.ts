import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { launchBrowser, openPage, takeScreenshot } from "./browser.js";
import { compareScreenshots, CompareResult } from "./compare.js";
import { generateReport } from "./reporter.js";
import {
  Config,
  PageConfig,
  readConfig,
  BASELINES_DIR,
  CURRENT_DIR,
  DIFFS_DIR,
  REPORTS_DIR,
  screenshotPath,
} from "./config.js";

export async function runBaselineForPage(
  config: Config,
  pageConf: PageConfig
): Promise<void> {
  console.log(`\n📸 BASELINE – ${pageConf.name}`);
  fs.mkdirSync(BASELINES_DIR, { recursive: true });

  const browser = await launchBrowser();
  try {
    const page = await openPage(
      browser,
      pageConf.url,
      config.viewport,
      config.waitFor,
      pageConf.waitForSelector
    );
    await takeScreenshot(
      page,
      screenshotPath(BASELINES_DIR, pageConf.name),
      pageConf.mask
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
      const page = await openPage(
        browser,
        pageConf.url,
        config.viewport,
        config.waitFor,
        pageConf.waitForSelector
      );
      await takeScreenshot(
        page,
        screenshotPath(BASELINES_DIR, pageConf.name),
        pageConf.mask
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
): Promise<CompareResult> {
  console.log(`\n🔍 TEST – ${pageConf.name}`);
  fs.mkdirSync(CURRENT_DIR, { recursive: true });
  fs.mkdirSync(DIFFS_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const currentPath = screenshotPath(CURRENT_DIR, pageConf.name);
  const baselinePath = screenshotPath(BASELINES_DIR, pageConf.name);
  const diffPath = screenshotPath(DIFFS_DIR, pageConf.name);

  const browser = await launchBrowser();
  try {
    const page = await openPage(
      browser,
      pageConf.url,
      config.viewport,
      config.waitFor,
      pageConf.waitForSelector
    );
    await takeScreenshot(page, currentPath, pageConf.mask);
    await page.close();

    const result = await compareScreenshots(
      pageConf.name,
      baselinePath,
      currentPath,
      diffPath,
      pageConf.threshold ?? config.threshold
    );
    return result;
  } catch (err) {
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

export async function runTest(config: Config, pageNames?: string[]): Promise<CompareResult[]> {
  console.log("\n🔍 מצב TEST – בדיקה מול הבייסליין\n");
  fs.mkdirSync(CURRENT_DIR, { recursive: true });
  fs.mkdirSync(DIFFS_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const pages = pageNames
    ? config.pages.filter((p) => pageNames.includes(p.name))
    : config.pages;

  const browser = await launchBrowser();
  const results: CompareResult[] = [];

  for (const pageConf of pages) {
    console.log(`\n[${pageConf.name}]`);
    const currentPath = screenshotPath(CURRENT_DIR, pageConf.name);
    const baselinePath = screenshotPath(BASELINES_DIR, pageConf.name);
    const diffPath = screenshotPath(DIFFS_DIR, pageConf.name);

    try {
      const page = await openPage(
        browser,
        pageConf.url,
        config.viewport,
        config.waitFor,
        pageConf.waitForSelector
      );
      await takeScreenshot(page, currentPath, pageConf.mask);
      await page.close();

      const result = await compareScreenshots(
        pageConf.name,
        baselinePath,
        currentPath,
        diffPath,
        pageConf.threshold ?? config.threshold
      );

      results.push(result);

      if (result.error) {
        console.log(`  ⚠️  ${result.error}`);
      } else if (result.passed) {
        console.log(`  ✅ עבר (${result.diffPercent}% שינוי)`);
      } else {
        console.log(
          `  ❌ נכשל! ${result.diffPercent}% שינוי (${result.diffPixels} פיקסלים)`
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

  if (mode === "baseline") {
    await runBaseline(config);
  } else if (mode === "test") {
    const results = await runTest(config);
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
