import { Gauge, Accessibility } from 'lucide-react'
import { formatVital, vitalState, VITALS_LIMITS, A11Y_IMPACT_META } from '@/lib/classification'
import { cn } from '@/lib/utils'
import type { PageResult } from '@/lib/reportParser'

const VITAL_ROWS = [
  { key: 'lcp', label: 'LCP', hint: 'Largest Contentful Paint' },
  { key: 'inp', label: 'INP', hint: 'Interaction to Next Paint' },
  { key: 'cls', label: 'CLS', hint: 'Cumulative Layout Shift' },
] as const

interface Props {
  pages: PageResult[]
  model?: string | null
  rich: boolean
}

/**
 * Performance and accessibility roll-up across the latest run. Renders nothing
 * when the report carries no such data, rather than showing empty placeholders.
 */
export default function SignalStrip({ pages, model, rich }: Props) {
  // Median across pages: a single slow page should not skew the headline, but a
  // systemic regression should.
  const vitals = VITAL_ROWS.map(({ key, label, hint }) => {
    const values = pages
      .map((p) => p.coreWebVitals?.[key])
      .filter((v): v is number => typeof v === 'number' && v > 0)
      .sort((a, b) => a - b)
    const median = values.length ? values[Math.floor(values.length / 2)] : null
    return { key, label, hint, median }
  }).filter((v) => v.median != null)

  const a11y = aggregateA11y(pages)
  const perfScores = pages
    .map((p) => p.performanceScore)
    .filter((v): v is number => typeof v === 'number' && v > 0)
  const perfMedian = perfScores.length
    ? [...perfScores].sort((a, b) => a - b)[Math.floor(perfScores.length / 2)]
    : null

  const hasSignals = vitals.length > 0 || a11y.total > 0 || perfMedian != null

  if (!hasSignals) {
    if (rich) return null
    return (
      <p className="text-xs text-muted-foreground">
        Performance and accessibility data will appear here once a run includes the JSON data island.
      </p>
    )
  }

  return (
    <section
      className="rounded-xl border bg-card p-4 shadow-depth-1"
      aria-labelledby="signal-heading"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="signal-heading" className="text-sm font-semibold tracking-tight">
          Signals
        </h2>
        {model && (
          <span className="tabular text-[11px] text-muted-foreground">
            verdicts by {model}
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {vitals.map((v) => {
          const state = vitalState(v.key, v.median as number)
          return (
            <div key={v.key} className="rounded-lg border bg-muted/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Gauge className="size-3" aria-hidden="true" />
                {v.label}
              </div>
              <div
                className={cn(
                  'tabular mt-1 text-lg font-semibold',
                  state === 'ok' && 'text-success',
                  state === 'warn' && 'text-warning',
                  state === 'bad' && 'text-cls-functional'
                )}
              >
                {formatVital(v.key, v.median as number)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                budget {v.key === 'cls' ? VITALS_LIMITS.cls : `${VITALS_LIMITS[v.key]}ms`}
              </div>
            </div>
          )
        })}

        {perfMedian != null && (
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Gauge className="size-3" aria-hidden="true" />
              Perf score
            </div>
            <div
              className={cn(
                'tabular mt-1 text-lg font-semibold',
                perfMedian >= 90
                  ? 'text-success'
                  : perfMedian >= 50
                    ? 'text-warning'
                    : 'text-cls-functional'
              )}
            >
              {Math.round(perfMedian)}
            </div>
            <div className="text-[11px] text-muted-foreground">median Lighthouse</div>
          </div>
        )}

        {a11y.total > 0 && (
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Accessibility className="size-3" aria-hidden="true" />
              A11y
            </div>
            <div className="tabular mt-1 text-lg font-semibold">{a11y.total}</div>
            <div className="text-[11px] text-muted-foreground">
              {a11y.newCount > 0
                ? `${a11y.newCount} new since baseline`
                : 'no new violations'}
            </div>
          </div>
        )}
      </div>

      {a11y.byImpact.some((v) => v.count > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3 text-[11px] text-muted-foreground">
          <span className="font-medium uppercase tracking-wide">Violations</span>
          {a11y.byImpact.map(({ impact, count }) => (
            <span key={impact} className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  'tabular rounded px-1.5 py-0.5 font-semibold',
                  A11Y_IMPACT_META[impact].text,
                  'bg-muted'
                )}
              >
                {count}
              </span>
              {A11Y_IMPACT_META[impact].label}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

function aggregateA11y(pages: PageResult[]) {
  const byImpact = (
    ['critical', 'serious', 'moderate', 'minor'] as const
  ).map((impact) => ({
    impact,
    count: pages.reduce(
      (sum, p) =>
        sum + (p.a11yViolations ?? []).filter((v) => v.impact === impact).length,
      0
    ),
  }))

  return {
    byImpact,
    total: pages.reduce((sum, p) => sum + (p.a11yViolations?.length ?? 0), 0),
    newCount: pages.reduce(
      (sum, p) => sum + (p.a11yNewViolations?.length ?? 0),
      0
    ),
  }
}