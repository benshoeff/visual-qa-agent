import fs from "fs";
import path from "path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

export interface CompareResult {
  pageName: string;
  passed: boolean;
  diffPixels: number;
  totalPixels: number;
  diffPercent: number;
  baselinePath: string;
  currentPath: string;
  diffPath: string | null;
  error?: string;
}

export async function compareScreenshots(
  pageName: string,
  baselinePath: string,
  currentPath: string,
  diffPath: string,
  threshold: number = 0.1
): Promise<CompareResult> {
  // בדוק שהבייסליין קיים
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
      error: "בייסליין לא נמצא – הרץ תחילה במצב baseline",
    };
  }

  // טען תמונות
  const baselineImg = PNG.sync.read(fs.readFileSync(baselinePath));
  const currentImg = PNG.sync.read(fs.readFileSync(currentPath));

  // ודא שהגדלים זהים
  if (
    baselineImg.width !== currentImg.width ||
    baselineImg.height !== currentImg.height
  ) {
    return {
      pageName,
      passed: false,
      diffPixels: 0,
      totalPixels: 0,
      diffPercent: 0,
      baselinePath,
      currentPath,
      diffPath: null,
      error: `גודל שונה: בייסליין ${baselineImg.width}x${baselineImg.height} vs נוכחי ${currentImg.width}x${currentImg.height}`,
    };
  }

  const { width, height } = baselineImg;
  const pixels = width * height;
  const diffImg = new PNG({ width, height });

  const diffPixels = pixelmatch(
    baselineImg.data,
    currentImg.data,
    diffImg.data,
    width,
    height,
    {
      threshold: 0.1,
      includeAA: false,
    }
  );

  const diffPercent = (diffPixels / pixels) * 100;
  const passed = diffPercent <= (threshold * 100);

  // שמור תמונת diff רק אם יש הבדל
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
