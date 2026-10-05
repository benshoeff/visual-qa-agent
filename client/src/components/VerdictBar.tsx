import { Link } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, MinusCircle, Play } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { timeAgo } from '@/lib/classification'
import { isBlocking, type PageResult, type ReportSummary } from '@/lib/reportParser'

type VerdictState = 'ok' | 'alert' | 'idle'

interface Props {
  summary: ReportSummary | null
  pages: PageResult[]
  generatedAt?: number
  runCount: number
  loading: boolean
  onFocusPage?: (pageName: string) => void
}

/**
 * The dominant element of the home screen. Answers one question: is the site
 * healthy right now. Classification decides whether a failure blocks a release.
 */
export default function VerdictBar({
  summary,
  pages,
  generatedAt,
  runCount,
  loading,
}: Props) {
  const total = summary?.total ?? pages.length
  const failed = summary?.failed ?? pages.filter((p) => !p.passed).length
  const passed = summary?.passed ?? pages.filter((p) => p.passed).length

  const blocking = pages.filter((p) => !p.passed && isBlocking(p.aiAnalysis?.classification))
  const hasData = total > 0

  const state: VerdictState = loading
    ? 'idle'
    : !hasData
      ? 'idle'
      : blocking.length > 0
        ? 'alert'
        : failed > 0
          ? 'idle'
          : 'ok'

  const healthPct = hasData ? Math.round((passed / total) * 100) : 0

  return (
    <section
      className={[
        'verdict-idle',
        state === 'ok' && 'verdict-ok',
        state === 'alert' && 'verdict-alert',
        'rounded-xl border p-5 shadow-depth-4 backdrop-blur-sm md:p-6',
      ].join(' ')}
      aria-labelledby="verdict-heading"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div
            className={[
              'flex size-12 shrink-0 items-center justify-center rounded-xl',
              state === 'ok' && 'bg-success/15 text-success',
              state === 'alert' && 'bg-cls-functional/15 text-cls-functional',
              state === 'idle' && 'bg-muted text-muted-foreground',
            ].join(' ')}
            aria-hidden="true"
          >
            {state === 'ok' ? (
              <CheckCircle2 className="size-6" />
            ) : state === 'alert' ? (
              <AlertTriangle className="size-6" />
            ) : (
              <MinusCircle className="size-6" />
            )}
          </div>

          <div className="min-w-0">
            <h1
              id="verdict-heading"
              className="text-xl font-semibold tracking-tight md:text-2xl"
            >
              {loading
                ? 'Checking site health'
                : !hasData
                  ? 'No run data yet'
                  : state === 'ok'
                    ? 'All clear'
                    : state === 'alert'
                      ? `${blocking.length} blocking regression${blocking.length === 1 ? '' : 's'}`
                      : `${failed} cosmetic change${failed === 1 ? '' : 's'}`}
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              {loading
                ? 'Loading the most recent report'
                : !hasData
                  ? 'Run a test to establish a baseline'
                  : state === 'alert'
                    ? 'These changes affect behaviour or accessibility'
                    : state === 'ok'
                      ? 'No visual, accessibility, or performance regressions detected'
                      : 'No release-blocking changes - safe to proceed'}
            </p>

            {hasData && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="tabular gap-1.5">
                  {passed}/{total} pages passing
                </Badge>
                <Badge variant="outline" className="tabular gap-1.5">
                  {healthPct}% healthy
                </Badge>
                {blocking.length > 0 && (
                  <Badge variant="destructive" className="tabular gap-1.5">
                    {blocking.length} blocking
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  last run {timeAgo(generatedAt)}
                  {runCount > 0 && ` · ${runCount} report${runCount === 1 ? '' : 's'}`}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button asChild>
            <Link to="/runner">
              <Play /> Run tests
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}