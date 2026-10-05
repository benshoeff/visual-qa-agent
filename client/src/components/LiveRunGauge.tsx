import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import {
  getRunStatus,
  isRunPending,
  type RunStatus,
} from '@/api'
import { cn } from '@/lib/utils'

/** The agent's pipeline, in execution order. */
const STAGES = [
  { key: 'capture', label: 'Capture', detail: 'Playwright screenshots' },
  { key: 'diff', label: 'Diff', detail: 'pixelmatch compare' },
  { key: 'a11y', label: 'Accessibility', detail: 'axe-core audit' },
  { key: 'perf', label: 'Performance', detail: 'Lighthouse vitals' },
  { key: 'ai', label: 'AI verdict', detail: 'classify changes' },
] as const

interface Props {
  projectId?: string
  pollMs?: number
}

/**
 * Shows the agent pipeline while a run is in flight. Renders nothing when idle,
 * so the screen does not carry a permanent progress affordance.
 */
export default function LiveRunGauge({ projectId, pollMs = 5000 }: Props) {
  const [run, setRun] = useState<RunStatus | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        const runs = await getRunStatus(projectId)
        if (cancelled) return
        setRun(runs[0] ?? null)
      } catch {
        if (!cancelled) setRun(null)
      } finally {
        if (!cancelled) setChecked(true)
      }
    }

    void poll()
    const id = window.setInterval(poll, pollMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [projectId, pollMs])

  if (!checked || !isRunPending(run)) return null

  const failed = run?.conclusion === 'failure'

  return (
    <section
      className="rounded-xl border bg-card p-4 shadow-depth-2"
      aria-labelledby="live-run-heading"
      aria-live="polite"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {failed ? (
            <XCircle className="size-4 text-destructive" aria-hidden="true" />
          ) : (
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
          )}
          <h2 id="live-run-heading" className="text-sm font-semibold tracking-tight">
            {failed ? 'Run failed' : 'Run in progress'}
            {run?.runNumber != null && (
              <span className="tabular ml-1.5 font-normal text-muted-foreground">
                #{run.runNumber}
              </span>
            )}
          </h2>
        </div>
        <span className="tabular text-xs uppercase tracking-wide text-muted-foreground">
          {run?.status.replace(/_/g, ' ')}
        </span>
      </div>

      <ol className="grid gap-2 sm:grid-cols-5">
        {STAGES.map((stage, i) => (
          <li
            key={stage.key}
            className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2"
          >
            <span
              className="gauge-pulse size-2 shrink-0 rounded-full bg-primary"
              style={{ animationDelay: `${i * 160}ms` }}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">{stage.label}</span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {stage.detail}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <p
        className={cn(
          'mt-3 text-xs text-muted-foreground',
          'flex items-center gap-1.5'
        )}
      >
        <CheckCircle2 className="size-3 shrink-0" aria-hidden="true" />
        The verdict appears on this screen as soon as the run finishes.
      </p>
    </section>
  )
}