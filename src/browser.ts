import { chromium, Browser, Page } from "playwright";

export interface ViewportConfig {
  width: number;
  height: number;
}

export async function launchBrowser(): Promise<Browser> {
  return await chromium.launch({ headless: true });
}

export async function openPage(
  browser: Browser,
  url: string,
  viewport: ViewportConfig,
  waitFor: "networkidle" | "domcontentloaded" | "load" = "networkidle",
  waitForSelector?: string
): Promise<Page> {
  const page = await browser.newPage();

  await page.setViewportSize(viewport);

  console.log(`  → פותח: ${url}`);
  await page.goto(url, { waitUntil: waitFor, timeout: 30000 });

  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, { timeout: 10000 });
  }

  // המתן קצת אחרי טעינה לאנימציות
  await page.waitForTimeout(500);

  return page;
}

export async function takeScreenshot(
  page: Page,
  outputPath: string,
  maskSelectors: string[] = []
): Promise<void> {
  // הסתר אלמנטים דינמיים לפני הצילום
  if (maskSelectors.length > 0) {
    await page.evaluate((selectors) => {
      selectors.forEach((selector) => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => {
          (el as HTMLElement).style.visibility = "hidden";
        });
      });
    }, maskSelectors);
  }

  await page.screenshot({ path: outputPath, fullPage: false });
  console.log(`  → נשמר: ${outputPath}`);
}
