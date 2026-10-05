export type Classification =
  | 'VISUAL_ONLY'
  | 'FUNCTIONAL'
  | 'ACCESSIBILITY'
  | 'DYNAMIC_CONTENT'
  | 'UNKNOWN'

export interface ChangedElement {
  selector: string
  changeType: 'added' | 'removed' | 'moved' | 'styled' | 'text_changed' | 'attribute_changed'
  impact: 'none' | 'low' | 'medium' | 'high' | 'critical'
  description: string
}

export interface AccessibilityIssue {
  rule: string
  severity: 'minor' | 'moderate' | 'serious' | 'critical'
  element: string
  description: string
}

export interface CoreWebVitals {
  lcp: number
  fid: number
  cls: number
  fcp: number
  ttfb: number
  inp: number
}

export interface A11yViolation {
  id: string
  impact: 'critical' | 'serious' | 'moderate' | 'minor'
  description?: string
  help?: string
  helpUrl?: string
  nodeCount?: number
}

export interface BudgetViolation {
  metric: string
  actual: number
  budget: number
  severity: 'warning' | 'error'
}

export interface AiAnalysis {
  semanticPassed: boolean
  classification: Classification
  confidence: number
  reasoning: string
  suggestions: string[]
  changedElements: ChangedElement[]
  accessibilityIssues: AccessibilityIssue[]
  functionalImpact: 'none' | 'low' | 'medium' | 'high' | 'critical'
}

export interface PageResult {
  pageName: string
  passed: boolean
  diffPercent: number
  diffPixels: number
  errored?: boolean
  /** False when the page passed or the run produced no diff image. */
  hasDiff?: boolean
  aiAnalysis?: AiAnalysis | null
  aiModel?: string | null
  a11yViolations?: A11yViolation[]
  a11yNewViolations?: A11yViolation[]
  a11yRegressionScore?: number
  coreWebVitals?: CoreWebVitals | null
  performanceScore?: number | null
  budgetViolations?: BudgetViolation[]
  perfRegressions?: string[]
}

export interface ReportSummary {
  total: number
  passed: number
  failed: number
}

export interface ParsedReport {
  summary: ReportSummary | null
  pages: PageResult[]
  generatedAt?: number
  /** True when the full JSON island was available (not scraped from HTML). */
  rich: boolean
}

/** Must match QA_DATA_VERSION in src/reporter.ts. */
const SUPPORTED_DATA_VERSION = 1

const CLASSIFICATIONS: Classification[] = [
  'VISUAL_ONLY',
  'FUNCTIONAL',
  'ACCESSIBILITY',
  'DYNAMIC_CONTENT',
  'UNKNOWN',
]

function asClassification(value: unknown): Classification {
  return CLASSIFICATIONS.includes(value as Classification)
    ? (value as Classification)
    : 'UNKNOWN'
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseCoreWebVitals(value: unknown): CoreWebVitals | null {
  const rec = asRecord(value)
  if (!rec) return null
  return {
    lcp: asNumber(rec.lcp),
    fid: asNumber(rec.fid),
    cls: asNumber(rec.cls),
    fcp: asNumber(rec.fcp),
    ttfb: asNumber(rec.ttfb),
    inp: asNumber(rec.inp),
  }
}

/** Reads and validates the JSON island embedded in the report. */
function readDataIsland(doc: Document): ParsedReport | null {
  const el = doc.getElementById('qa-data')
  if (!el?.textContent) return null

  let data: unknown
  try {
    data = JSON.parse(el.textContent)
  } catch {
    return null
  }

  const root = asRecord(data)
  if (!root || root.version !== SUPPORTED_DATA_VERSION) return null

  const summaryRec = asRecord(root.summary)
  const rawResults = asArray<Record<string, unknown>>(root.results)

  const pages: PageResult[] = rawResults.map((r) => {
    const ai = asRecord(r.aiAnalysis)
    const meta = asRecord(r.aiMetadata)
    const a11y = asRecord(r.a11y)
    const a11yCmp = asRecord(r.a11yComparison)
    const perf = asRecord(r.performance)
    const perfCmp = asRecord(r.performanceComparison)

    const aiAnalysis: AiAnalysis | null = ai
      ? {
          semanticPassed: ai.semanticPassed === true,
          classification: asClassification(ai.classification),
          confidence: asNumber(ai.confidence),
          reasoning: typeof ai.reasoning === 'string' ? ai.reasoning : '',
          suggestions: asArray<string>(ai.suggestions),
          changedElements: asArray<ChangedElement>(ai.changedElements),
          accessibilityIssues: asArray<AccessibilityIssue>(ai.accessibilityIssues),
          functionalImpact: (ai.functionalImpact ??
            'none') as AiAnalysis['functionalImpact'],
        }
      : null

    return {
      pageName: typeof r.pageName === 'string' ? r.pageName : '',
      passed: r.passed === true,
      diffPercent: asNumber(r.diffPercent),
      diffPixels: asNumber(r.diffPixels),
      errored: typeof r.error === 'string' && r.error.length > 0,
      hasDiff: r.hasDiff === true,
      aiAnalysis,
      aiModel: meta && typeof meta.model === 'string' ? meta.model : null,
      a11yViolations: a11y ? asArray<A11yViolation>(a11y.violations) : undefined,
      a11yNewViolations: a11yCmp
        ? asArray<A11yViolation>(a11yCmp.newViolations)
        : undefined,
      a11yRegressionScore:
        a11yCmp && a11yCmp.regressionScore != null
          ? asNumber(a11yCmp.regressionScore)
          : undefined,
      coreWebVitals: parseCoreWebVitals(perf?.coreWebVitals),
      performanceScore:
        perf && perf.performanceScore != null
          ? asNumber(perf.performanceScore)
          : null,
      budgetViolations: perf
        ? asArray<BudgetViolation>(perf.budgetViolations)
        : undefined,
      perfRegressions: perfCmp
        ? asArray<string>(perfCmp.regressions)
        : undefined,
    }
  })

  const summary: ReportSummary | null = summaryRec
    ? {
        total: asNumber(summaryRec.total, pages.length),
        passed: asNumber(summaryRec.passed),
        failed: asNumber(summaryRec.failed),
      }
    : pages.length > 0
      ? {
          total: pages.length,
          passed: pages.filter((p) => p.passed).length,
          failed: pages.filter((p) => !p.passed).length,
        }
      : null

  return {
    summary,
    pages,
    generatedAt:
      typeof root.generatedAt === 'number' ? root.generatedAt : undefined,
    rich: true,
  }
}

/** Legacy path: scrape the summary stats and the results table. */
function scrapeHtml(doc: Document): ParsedReport {
  const nums = Array.from(doc.querySelectorAll('.summary .stat .num')).map((el) =>
    parseInt(el.textContent ?? '', 10)
  )
  let summary: ReportSummary | null = null
  if (nums.length >= 3) {
    summary = {
      total: nums[0] || 0,
      passed: nums[1] || 0,
      failed: nums[2] || 0,
    }
  }

  const tsEl = doc.getElementById('generated-at')
  const generatedAt = tsEl ? parseInt(tsEl.dataset.ts ?? '', 10) : NaN

  const pages: PageResult[] = []
  doc.querySelectorAll('tbody tr').forEach((row) => {
    const nameEl = row.querySelector('td strong')
    if (!nameEl) return
    const cells = row.querySelectorAll('td')
    const statusCell = cells[1]
    const diffCell = cells[2]
    const pixelsCell = cells[3]
    const aiCell = cells[4]
    const isErrorRow = row.classList.contains('error-msg')
    if (!statusCell || !diffCell || !pixelsCell) return
    const text = statusCell.textContent ?? ''
    const passed =
      isErrorRow
        ? false
        : text.includes('✅') || text.toLowerCase().includes('pass')

    // The reporter renders an em dash when a page has no AI analysis, so an
    // empty or dashed cell means "no badge" rather than an UNKNOWN verdict.
    const badgeText = aiCell?.textContent?.trim() ?? ''
    const hasAiBadge = badgeText.length > 0 && badgeText !== '\u2014'
    const classification = hasAiBadge
      ? asClassification(badgeText.split(/\s+/).pop())
      : null

    pages.push({
      pageName: nameEl.textContent || '',
      passed,
      errored: isErrorRow || text.toLowerCase().includes('error'),
      diffPercent: parseFloat(diffCell.textContent?.replace('%', '') || '0'),
      diffPixels: parseInt(pixelsCell.textContent?.replace(/[^0-9]/g, '') || '0'),
      hasDiff: classification !== null && classification !== 'UNKNOWN',
      aiAnalysis: classification
        ? {
            semanticPassed: passed,
            classification,
            confidence: 0,
            reasoning: '',
            suggestions: [],
            changedElements: [],
            accessibilityIssues: [],
            functionalImpact: 'none',
          }
        : null,
    })
  })

  return {
    summary,
    pages,
    generatedAt: Number.isFinite(generatedAt) ? generatedAt : undefined,
    rich: false,
  }
}

export function parseReport(html: string): ParsedReport {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return readDataIsland(doc) ?? scrapeHtml(doc)
}

/**
 * Severity ordering for triage, mirroring src/db/service.ts: FUNCTIONAL and
 * ACCESSIBILITY regressions block a release, DYNAMIC_CONTENT and VISUAL_ONLY
 * do not.
 */
const SEVERITY_ORDER: Record<Classification, number> = {
  FUNCTIONAL: 0,
  ACCESSIBILITY: 1,
  DYNAMIC_CONTENT: 2,
  VISUAL_ONLY: 3,
  UNKNOWN: 4,
}

export function classificationSeverity(c: Classification | undefined): number {
  return SEVERITY_ORDER[c ?? 'UNKNOWN'] ?? 4
}

/** True when a failure should block a release. */
export function isBlocking(c: Classification | undefined): boolean {
  return c === 'FUNCTIONAL' || c === 'ACCESSIBILITY'
}