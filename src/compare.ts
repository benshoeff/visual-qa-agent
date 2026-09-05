import fs from "fs";
import path from "path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { IgnoreZone, DIFFS_DIR } from "./config.js";

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

export interface DiffRegion {
  y: number;
  height: number;
}

const NEUTRAL_COLOR = [128, 128, 128, 255] as const;

export function normalizeImages(
  a: PNG,
  b: PNG
): { a: PNG; b: PNG; width: number; height: number } {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);

  const pad = (img: PNG): PNG => {
    if (img.width === width && img.height === height) return img;
    const out = new PNG({ width, height });
    for (let i = 0; i < out.data.length; i += 4) {
      out.data[i] = NEUTRAL_COLOR[0];
      out.data[i + 1] = NEUTRAL_COLOR[1];
      out.data[i + 2] = NEUTRAL_COLOR[2];
      out.data[i + 3] = NEUTRAL_COLOR[3];
    }
    for (let y = 0; y < img.height; y++) {
      const rowIn = y * img.width * 4;
      const rowOut = y * width * 4;
      for (let x = 0; x < img.width; x++) {
        const i = x * 4;
        out.data[rowOut + i] = img.data[rowIn + i];
        out.data[rowOut + i + 1] = img.data[rowIn + i + 1];
        out.data[rowOut + i + 2] = img.data[rowIn + i + 2];
        out.data[rowOut + i + 3] = img.data[rowIn + i + 3];
      }
    }
    return out;
  };

  return { a: pad(a), b: pad(b), width, height };
}

export function computeDiffRegions(
  baseline: PNG,
  current: PNG,
  gapTolerance = 24,
  minBandHeight = 4,
  threshold = 0.1
): DiffRegion[] {
  const width = Math.min(baseline.width, current.width);
  const height = Math.min(baseline.height, current.height);
  const thresholdValue = threshold * 255;

  const changedRows: number[] = [];
  for (let y = 0; y < height; y++) {
    const rowBase = y * baseline.width * 4;
    const rowCur = y * current.width * 4;
    let hasDiff = false;
    for (let x = 0; x < width; x++) {
      const i = rowBase + x * 4;
      const j = rowCur + x * 4;
      const hasChannelDiff =
        Math.abs(baseline.data[i] - current.data[j]) > thresholdValue ||
        Math.abs(baseline.data[i + 1] - current.data[j + 1]) > thresholdValue ||
        Math.abs(baseline.data[i + 2] - current.data[j + 2]) > thresholdValue;
      if (hasChannelDiff) {
        hasDiff = true;
        break;
      }
    }
    if (hasDiff) changedRows.push(y);
  }

  if (changedRows.length === 0) return [];
  const bands: DiffRegion[] = [];
  let bandStart = changedRows[0];
  let bandEnd = changedRows[0];
  for (let i = 1; i < changedRows.length; i++) {
    const y = changedRows[i];
    if (y - bandEnd <= gapTolerance) {
      bandEnd = y;
    } else {
      if (bandEnd - bandStart + 1 >= minBandHeight) {
        bands.push({ y: bandStart, height: bandEnd - bandStart + 1 });
      }
      bandStart = y;
      bandEnd = y;
    }
  }
  if (bandEnd - bandStart + 1 >= minBandHeight) {
    bands.push({ y: bandStart, height: bandEnd - bandStart + 1 });
  }
  return bands;
}

export function writeDiffRegions(pageName: string, regions: DiffRegion[]): void {
  const outPath = path.join(DIFFS_DIR, `${pageName}.regions.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify({ pageName, regions }, null, 2),
    "utf-8"
  );
}

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

  const { a: baselineNorm, b: currentNorm, width, height } = normalizeImages(
    baselineImg,
    currentImg
  );

  const pixels = width * height;
  const diffImg = new PNG({ width, height });

  const boundingBoxZones = ignoreZones.filter(
    (z) => z.type === "bounding-box" && z.enabled
  );

  if (boundingBoxZones.length > 0) {
    applyIgnoreZones(baselineNorm, boundingBoxZones);
    applyIgnoreZones(currentNorm, boundingBoxZones);
  }

  const diffPixels = pixelmatch(
    baselineNorm.data,
    currentNorm.data,
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
    writeDiffRegions(pageName, computeDiffRegions(baselineNorm, currentNorm));
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
