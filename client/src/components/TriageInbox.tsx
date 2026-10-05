import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Accessibility,
  RefreshCw,
  Palette,
  HelpCircle,
  GitCompareArrows,
  ChevronDown,
  Sparkles,
  Inbox,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { A11Y_IMPACT_META, classificationMeta } from '@/lib/classification'
import { cn } from '@/lib/utils'
import {
  classificationSeverity,
  isBlocking,
  type Classification,
  type PageResult,
} from '@/lib/reportParser'

const ICONS: Record<string, LucideIcon> = {
  warning: AlertTriangle,
  accessibility: Accessibility,
  refresh: RefreshCw,
  palette: Palette,
  help: HelpCircle,
}

interface Props {
  pages: PageResult[]
  selected: string | null
  onSelect: (pageName: string) => void
  onCompare: (pageName: string) => void
}

/**
 * Failures as a work queue rather than a report. Ordered by release impact so
 * the thing that must be fixed is always first.
 */
export default function TriageInbox({ pages, selected, onSelect, onCompare }: Props) {
  const [filter, setFilter] = useState<'all' | 'blocking' | 'cosmetic'>('blocking')

  const failures = useMemo(
    () => pages.filter((p) => !p.passed).sort((a, b) => {
      const sev =
        classificationSeverity(a.aiAnalysis?.classification) -
        classificationSeverity(b.aiAnalysis?.classification)
      if (sev !== 0) return sev
      return b.diffPercent - a.diffPercent
    }),
    [pages]
  )

  const blockingCount = failures.filter((p) => isBlocking(p.aiAnalysis?.classification)).length

  const visible = useMemo(() => {
    if (filter === 'blocking') return failures.filter((p) => isBlocking(p.aiAnalysis?.classification))
    if (filter === 'cosmetic')
      return failures.filter((p) => !isBlocking(p.aiAnalysis?.classification))
    return failures
  }, [failures, filter])

  return (
    <div className="rounded-xl border bg-card shadow-depth-2">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
        <div className="flex items-center gap-2">
          <Inbox className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold tracking-tight">Needs attention</h2>
          {failures.length > 0 && (
            <Badge variant="secondary" className="tabular">
              {failures.length}
            </Badge>
          )}
        </div>

        {failures.length > 0 && (
          <div className="flex items-center gap-1" role="group" aria-label="Filter failures">
            {(
              [
                { value: 'blocking', label: `Blocking ${blockingCount}` },
                { value: 'cosmetic', label: `Cosmetic ${failures.length - blockingCount}` },
                { value: 'all', label: 'All' },
              ] as const
            ).map((opt) => (
              <Button
                key={opt.value}
                variant={filter === opt.value ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setFilter(opt.value)}
                aria-pressed={filter === opt.value}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {failures.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-success/12">
            <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium">Nothing to triage</p>
          <p className="max-w-56 text-xs text-muted-foreground">
            Every page in the latest run matched its baseline.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No {filter === 'blocking' ? 'release-blocking' : 'cosmetic'} changes in this run.
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {visible.map((page) => (
            <TriageItem
              key={page.pageName}
              page={page}
              expanded={selected === page.pageName}
              onToggle={() => onSelect(page.pageName)}
              onCompare={() => onCompare(page.pageName)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function TriageItem({
  page,
  expanded,
  onToggle,
  onCompare,
}: {
  page: PageResult
  expanded: boolean
  onToggle: () => void
  onCompare: () => void
}) {
  const classification: Classification = page.errored
    ? 'UNKNOWN'
    : (page.aiAnalysis?.classification ?? 'UNKNOWN')
  const meta = classificationMeta(classification)
  const Icon = ICONS[meta.icon] ?? HelpCircle
  const analysis = page.aiAnalysis
  const newA11y = page.a11yNewViolations ?? []

  return (
    <li className="triage-enter">
      <div className="flex items-start gap-3 p-4">
        <div
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
            page.errored ? 'bg-muted text-muted-foreground' : meta.bg + '/15 ' + meta.text
          )}
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-medium">{page.pageName}</span>
            {meta.blocking && !page.errored && (
              <Badge variant="destructive" className="text-[10px]">
                Blocks release
              </Badge>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className={cn('font-medium', page.errored ? undefined : meta.text)}>
              {page.errored ? 'Error' : meta.label}
            </span>
            {!page.errored && (
              <>
                <span className="tabular">diff {page.diffPercent}%</span>
                <span className="tabular">{page.diffPixels.toLocaleString()} px</span>
              </>
            )}
            {analysis && analysis.confidence > 0 && (
              <span className="tabular inline-flex items-center gap-1">
                <Sparkles className="size-3" aria-hidden="true" />
                {(analysis.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!page.errored && (
            <Button variant="ghost" size="sm" onClick={onCompare}>
              <GitCompareArrows />
              <span className="sr-only sm:not-sr-only">Compare</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Hide' : 'Show'} AI verdict for ${page.pageName}`}
          >
            <ChevronDown className={cn('transition-transform', expanded && 'rotate-180')} />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 border-t bg-muted/30 px-4 py-4">
          <p className="text-xs text-muted-foreground">{meta.meaning}</p>

          {analysis?.reasoning && (
            <div className="rounded-lg border-l-2 border-primary bg-card p-3">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                AI verdict
              </p>
              <p className="text-sm leading-relaxed">{analysis.reasoning}</p>
            </div>
          )}

          {analysis?.changedElements?.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Changed elements
              </p>
              <ul className="space-y-1">
                {analysis.changedElements.slice(0, 6).map((el, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <Badge
                      variant="outline"
                      className={cn(
                        'mt-px shrink-0 text-[10px]',
                        el.impact === 'high' || el.impact === 'critical'
                          ? 'border-cls-functional/50 text-cls-functional'
                          : el.impact === 'medium'
                            ? 'border-cls-accessibility/50 text-cls-accessibility'
                            : undefined
                      )}
                    >
                      {el.changeType.replace('_', ' ')}
                    </Badge>
                    <span className="min-w-0">
                      <code className="break-all font-mono text-[11px] text-foreground">
                        {el.selector}
                      </code>
                      {el.description && (
                        <span className="text-muted-foreground"> — {el.description}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {analysis.changedElements.length > 6 && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  +{analysis.changedElements.length - 6} more
                </p>
              )}
            </div>
          )}

          {newA11y.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                New accessibility violations
              </p>
              <ul className="space-y-1">
                {newA11y.slice(0, 5).map((v, i) => {
                  const impact = A11Y_IMPACT_META[v.impact] ?? A11Y_IMPACT_META.minor
                  return (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <Accessibility
                        className={cn('mt-px size-3 shrink-0', impact.text)}
                        aria-hidden="true"
                      />
                      <span>
                        <span className={cn('font-medium', impact.text)}>{impact.label}</span>{' '}
                        <span className="text-muted-foreground">{v.help ?? v.id}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {analysis?.suggestions?.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Suggested fixes
              </p>
              <ul className="list-inside list-disc space-y-1 text-xs">
                {analysis.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {!analysis?.reasoning && !analysis?.suggestions?.length && !newA11y.length && (
            <p className="text-xs text-muted-foreground">
              {page.errored
                ? 'This page errored during the run. Open the report for the full log.'
                : 'No AI verdict for this page — the change stayed within the diff threshold.'}
            </p>
          )}
        </div>
      )}
    </li>
  )
}

export function ErrorRow({ message }: { message: string }) {
  return (
    <li className="flex items-start gap-2 p-4 text-sm">
      <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
      <span>{message}</span>
    </li>
  )
}