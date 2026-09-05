import fs from "fs";
import path from "path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { IgnoreZone } from "./config.js";

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

const NEUTRAL_COLOR = [128, 128, 128, 255] as const;

function applyIgnoreZones(img: PNG, zones: IgnoreZone[]): void {
  const { width, data } = img;
  for (const zone of zones) {
    if (zone.type !== "bounding-box" || !zone.enabled) continue;
    if (zone.x == null || zone.y == null || zone.width == null || zone.height == null) continue;
    const x2 = Math.min(zone.x + zone.width, width);
    const y2 = Math.min(zone.y + zone.height, img.height);
    for (let py: number = zone.y; py < y2; py++) {
      for (let px: number = zone.x; px < x2; px++) {
        const offset = (py * width + px) * 4;
        data[offset] = NEUTRAL_COLOR[0];
        data[offset + 1] = NEUTRAL_COLOR[1];
        data[offset + 2] = NEUTRAL_COLOR[2];
        data[offset + 3] = NEUTRAL_COLOR[3];
      }
    }
  }
}

export async function compareScreenshots(
  pageName: string,
  baselinePath: string,
  currentPath: string,
  diffPath: string,
  threshold: number = 0.1,
  ignoreZones: IgnoreZone[] = []
): Promise<CompareResult> {
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

  const baselineImg = PNG.sync.read(fs.readFileSync(baselinePath));
  const currentImg = PNG.sync.read(fs.readFileSync(currentPath));

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

  const boundingBoxZones = ignoreZones.filter(
    (z) => z.type === "bounding-box" && z.enabled
  );

  if (boundingBoxZones.length > 0) {
    applyIgnoreZones(baselineImg, boundingBoxZones);
    applyIgnoreZones(currentImg, boundingBoxZones);
  }

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

  const ignoredPixels = boundingBoxZones.reduce((sum, z) => {
    if (z.x == null || z.y == null || z.width == null || z.height == null) return sum;
    return sum + Math.min(z.width, width - z.x) * Math.min(z.height, height - z.y);
  }, 0);
  const effectivePixels = pixels - ignoredPixels;
  const diffPercent = effectivePixels > 0 ? (diffPixels / effectivePixels) * 100 : 0;
  const passed = diffPercent <= (threshold * 100);

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
