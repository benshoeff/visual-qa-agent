import { useMemo, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { classificationMeta } from '@/lib/classification'
import { cn } from '@/lib/utils'
import { isBlocking, type PageResult } from '@/lib/reportParser'

interface Props {
  pages: PageResult[]
  selected: string | null
  onSelect: (pageName: string) => void
}

/**
 * One cell per page, tinted by AI classification. This is the spatial index of
 * the site: a single glance shows where the damage is concentrated.
 */
export default function PageHeatmap({ pages, selected, onSelect }: Props) {
  const [showAll, setShowAll] = useState(false)

  const { passed, failed, ordered } = useMemo(() => {
    const failedPages = pages.filter((p) => !p.passed)
    const passedPages = pages.filter((p) => p.passed)
    // Failing pages first so they are never pushed below the fold.
    const ordered = [...failedPages, ...passedPages]
    return { passed: passedPages.length, failed: failedPages.length, ordered }
  }, [pages])

  const LIMIT = 60
  const visible = showAll ? ordered : ordered.slice(0, LIMIT)
  const hidden = ordered.length - visible.length

  return (
    <div className="rounded-xl border bg-card p-4 shadow-depth-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">All pages</h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="tabular">{passed} passing</span>
          {failed > 0 && <span className="tabular text-destructive">{failed} failing</span>}
        </div>
      </div>

      {ordered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No pages in the latest report.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
            {visible.map((p) => {
              const meta = classificationMeta(
                p.errored ? 'UNKNOWN' : p.aiAnalysis?.classification
              )
              const isSelected = selected === p.pageName
              const blocking = !p.passed && isBlocking(p.aiAnalysis?.classification)

              return (
                <Tooltip key={p.pageName}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onSelect(p.pageName)}
                      aria-pressed={isSelected}
                      aria-label={`${p.pageName}: ${
                        p.errored
                          ? 'errored'
                          : p.passed
                            ? 'passing'
                            : meta.meaning
                      }${blocking ? ', release blocking' : ''}`}
                      className={cn(
                        'heat-cell aspect-square rounded-md border text-[10px] font-semibold',
                        p.passed
                          ? 'border-success/30 bg-success/12 text-success'
                          : p.errored
                            ? 'border-dashed border-muted-foreground/50 bg-muted text-muted-foreground'
                            : meta.border + ' ' + meta.bg + '/15 ' + meta.text,
                        isSelected && 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                      )}
                    >
                      {blocking ? (
                        <span aria-hidden="true">!</span>
                      ) : p.passed ? (
                        <span aria-hidden="true">·</span>
                      ) : (
                        <span className="tabular">
                          {p.diffPercent >= 10
                            ? Math.round(p.diffPercent)
                            : p.diffPercent.toFixed(1)}
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">
                    <p className="font-medium">{p.pageName}</p>
                    <p className="mt-0.5 text-xs opacity-80">
                      {p.errored
                        ? 'Run errored'
                        : p.passed
                          ? 'Passing'
                          : `${meta.label} — ${meta.meaning}`}
                    </p>
                    {!p.passed && !p.errored && (
                      <p className="tabular mt-1 text-xs opacity-70">
                        diff {p.diffPercent}% · {p.diffPixels.toLocaleString()} px
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>

          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-3 w-full rounded-md border border-dashed py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Show {hidden} more page{hidden === 1 ? '' : 's'}
            </button>
          )}
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3 text-[11px] text-muted-foreground">
        <span className="font-medium uppercase tracking-wide">Legend</span>
        <LegendItem className="bg-success/30" label="Passing" />
        <LegendItem className="bg-cls-functional/45" label="Functional" blocking />
        <LegendItem className="bg-cls-accessibility/45" label="Accessibility" blocking />
        <LegendItem className="bg-cls-dynamic/45" label="Dynamic" />
        <LegendItem className="bg-cls-visual/45" label="Cosmetic" />
        <span className="tabular">!</span>
        <span>blocks release</span>
      </div>
    </div>
  )
}

function LegendItem({ className, label, blocking }: { className: string; label: string; blocking?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-sm', className)} aria-hidden="true" />
      {label}
      {blocking && <span className="tabular font-semibold">!</span>}
    </span>
  )
}