import type { Classification } from './reportParser'

/**
 * UI mapping for AI classifications. Severity ordering mirrors
 * src/db/service.ts — FUNCTIONAL and ACCESSIBILITY block a release,
 * DYNAMIC_CONTENT and VISUAL_ONLY do not.
 */
export interface ClassificationMeta {
  label: string
  /** Plain-language meaning of the classification. */
  meaning: string
  /** Tailwind text colour token. */
  text: string
  /** Tailwind background token for filled chips. */
  bg: string
  /** Tailwind border token. */
  border: string
  /** Tailwind ring/indicator token used by the heatmap. */
  dot: string
  icon: string
  /** True when the failure should block a release. */
  blocking: boolean
}

export const CLASSIFICATION_META: Record<Classification, ClassificationMeta> = {
  FUNCTIONAL: {
    label: 'Functional',
    meaning: 'Behaviour changed - users are affected',
    text: 'text-cls-functional',
    bg: 'bg-cls-functional',
    border: 'border-cls-functional/40',
    dot: 'bg-cls-functional',
    icon: 'warning',
    blocking: true,
  },
  ACCESSIBILITY: {
    label: 'Accessibility',
    meaning: 'Accessibility regression',
    text: 'text-cls-accessibility',
    bg: 'bg-cls-accessibility',
    border: 'border-cls-accessibility/40',
    dot: 'bg-cls-accessibility',
    icon: 'accessibility',
    blocking: true,
  },
  DYNAMIC_CONTENT: {
    label: 'Dynamic',
    meaning: 'Expected content change - no action needed',
    text: 'text-cls-dynamic',
    bg: 'bg-cls-dynamic',
    border: 'border-cls-dynamic/40',
    dot: 'bg-cls-dynamic',
    icon: 'refresh',
    blocking: false,
  },
  VISUAL_ONLY: {
    label: 'Cosmetic',
    meaning: 'Cosmetic only - no functional impact',
    text: 'text-cls-visual',
    bg: 'bg-cls-visual',
    border: 'border-cls-visual/40',
    dot: 'bg-cls-visual',
    icon: 'palette',
    blocking: false,
  },
  UNKNOWN: {
    label: 'Unclassified',
    meaning: 'No AI verdict available',
    text: 'text-cls-unknown',
    bg: 'bg-cls-unknown',
    border: 'border-cls-unknown/40',
    dot: 'bg-cls-unknown',
    icon: 'help',
    blocking: false,
  },
}

export function classificationMeta(
  classification: Classification | undefined | null
): ClassificationMeta {
  return CLASSIFICATION_META[classification ?? 'UNKNOWN'] ?? CLASSIFICATION_META.UNKNOWN
}

/** Impact colours for accessibility violations, matching axe's own levels. */
export const A11Y_IMPACT_META = {
  critical: { label: 'Critical', text: 'text-cls-functional', weight: 3 },
  serious: { label: 'Serious', text: 'text-cls-accessibility', weight: 2 },
  moderate: { label: 'Moderate', text: 'text-warning', weight: 1 },
  minor: { label: 'Minor', text: 'text-muted-foreground', weight: 0 },
} as const

export type A11yImpact = keyof typeof A11Y_IMPACT_META

/** Thresholds from Google Core Web Vitals / Lighthouse budgets. */
export const VITALS_LIMITS = {
  lcp: 2500,
  cls: 0.1,
  inp: 200,
} as const

export type VitalKey = 'lcp' | 'cls' | 'inp'

export function vitalState(key: VitalKey, value: number): 'ok' | 'warn' | 'bad' {
  const limit = VITALS_LIMITS[key]
  if (value <= limit) return 'ok'
  if (value <= limit * 1.5) return 'warn'
  return 'bad'
}

export function formatMs(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`
  return `${Math.round(value)}ms`
}

export function formatVital(key: VitalKey, value: number): string {
  if (key === 'cls') return value.toFixed(3)
  return formatMs(value)
}

export function timeAgo(ts: number | undefined): string {
  if (!ts) return 'unknown'
  const diff = Date.now() - ts
  if (diff < 0) return 'just now'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}