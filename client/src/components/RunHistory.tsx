import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  GitCompareArrows,
  History as HistoryIcon,
  ChevronDown,
  ChevronRight,
  Activity,
  FileBarChart2,
} from 'lucide-react'
import { toast } from 'sonner'
import { getReports, fetchReportHtml, getImageUrl } from '../api'
import type { ReportFile } from '../api'
import { parseReport } from '@/lib/reportParser'
import type { PageResult, ReportSummary } from '@/lib/reportParser'
import DiffSlider from './DiffSlider'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const BATCH = 15

interface Run {
  file: ReportFile
  summary: ReportSummary | null
  pages: PageResult[]
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function statusBadge(p: PageResult) {
  if (p.errored)
    return (
      <Badge variant="warning">
        <AlertTriangle /> Error
      </Badge>
    )
  return p.passed ? (
    <Badge variant="success">
      <CheckCircle2 /> Pass
    </Badge>
  ) : (
    <Badge variant="destructive">
      <XCircle /> Fail
    </Badge>
  )
}

export default function RunHistory() {
  const [runs, setRuns] = useState<Run[]>([])
  const [visible, setVisible] = useState(BATCH)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pass' | 'fail'>('all')
  const [expandedRun, setExpandedRun] = useState<string | null>(null)
  const [diffView, setDiffView] = useState<{ page: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.resolve(getReports())
      .then(async (files) => {
        if (cancelled) return
        const parsed: Run[] = []
        for (const file of files) {
          try {
            const html = await fetchReportHtml(file.filename)
            const { summary, pages } = parseReport(html)
            parsed.push({ file, summary, pages })
          } catch {
            parsed.push({ file, summary: null, pages: [] })
          }
          if (cancelled) return
        }
        if (!cancelled) setRuns(parsed)
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load run history')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filteredRuns = useMemo(() => {
    let list = runs
    if (statusFilter === 'pass') list = list.filter((r) => r.summary && r.summary.failed === 0)
    if (statusFilter === 'fail') list = list.filter((r) => r.summary && r.summary.failed > 0)
    return list.slice(0, visible)
  }, [runs, statusFilter, visible])

  const summary = useMemo(() => {
    let passed = 0
    let failed = 0
    let withData = 0
    for (const r of runs) {
      if (!r.summary) continue
      withData += r.summary.total
      passed += r.summary.passed
      failed += r.summary.failed
    }
    const total = withData
    return {
      runs: runs.length,
      total,
      passed,
      failed,
      passRate: total ? Math.round((passed / total) * 100) : 0,
    }
  }, [runs])

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Run History</h1>
        <p className="text-sm text-muted-foreground">
          See when tests ran and whether pages passed or failed.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="flex-row items-center justify-between p-4">
          <span className="text-sm font-medium text-muted-foreground">Runs</span>
          <span className="text-2xl font-bold tabular-nums">{summary.runs}</span>
        </Card>
        <Card className="flex-row items-center justify-between border-l-4 border-l-success p-4">
          <span className="text-sm font-medium text-muted-foreground">Passed Pages</span>
          <span className="text-2xl font-bold tabular-nums text-success">{summary.passed}</span>
        </Card>
        <Card className="flex-row items-center justify-between border-l-4 border-l-destructive p-4">
          <span className="text-sm font-medium text-muted-foreground">Failed Pages</span>
          <span className="text-2xl font-bold tabular-nums text-destructive">{summary.failed}</span>
        </Card>
        <Card className="flex-row items-center justify-between p-4">
          <span className="text-sm font-medium text-muted-foreground">Pass Rate</span>
          <span className="text-2xl font-bold tabular-nums">{summary.passRate}%</span>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          <h2 className="text-base font-semibold tracking-tight">Recent runs</h2>
        </div>
        {runs.length === 0 ? (
          loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading history…
            </div>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              No runs yet. Run a test to generate reports.
            </p>
          )
        ) : (
          <Timeline runs={runs} />
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="flex flex-wrap items-center gap-3">
            {(
              [
                { value: 'all', label: 'All runs' },
                { value: 'pass', label: 'All passed' },
                { value: 'fail', label: 'Has failures' },
              ] as const
            ).map((opt) => (
              <Button
                key={opt.value}
                variant={statusFilter === opt.value ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setStatusFilter(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">
            {filteredRuns.length} run{filteredRuns.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading history…
          </div>
        ) : filteredRuns.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl px-4 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <HistoryIcon className="size-6 text-primary" />
            </div>
            <p className="text-sm font-medium">No run history matching the filter</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8" />
                  <TableHead>Run</TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                  <TableHead className="w-[110px] text-right">Passed</TableHead>
                  <TableHead className="w-[110px] text-right">Failed</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRuns.map((r) => {
                  const summary = r.summary
                  const ok = !summary || summary.failed === 0
                  return (
                    <FragmentRow
                      key={r.file.filename}
                      run={r}
                      expanded={expandedRun === r.file.filename}
                      ok={ok}
                      onToggle={() =>
                        setExpandedRun(
                          expandedRun === r.file.filename ? null : r.file.filename
                        )
                      }
                      onCompare={(page) => setDiffView({ page })}
                    />
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {runs.length > visible && (
          <div className="border-t p-3">
            <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + BATCH)}>
              Show more
            </Button>
          </div>
        )}
      </Card>

      <Dialog open={diffView != null} onOpenChange={(o) => !o && setDiffView(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{diffView?.page}</DialogTitle>
          </DialogHeader>
          {diffView && (
            <DiffSlider
              baselineUrl={getImageUrl('baseline', diffView.page)}
              currentUrl={getImageUrl('current', diffView.page)}
              label="Drag to compare Baseline vs Current"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FragmentRow({
  run,
  expanded,
  ok,
  onToggle,
  onCompare,
}: {
  run: Run
  expanded: boolean
  ok: boolean
  onToggle: () => void
  onCompare: (page: string) => void
}) {
  const { file, summary } = run
  return (
    <Fragment>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          {expanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <FileBarChart2 className="size-4 text-muted-foreground" />
            <span className="font-medium">
              {new Date(file.timestamp).toLocaleString('en-US')}
            </span>
            <span className="text-xs text-muted-foreground">{timeAgo(file.timestamp)}</span>
          </div>
        </TableCell>
        <TableCell>
          {summary ? (
            ok ? (
              <Badge variant="success">
                <CheckCircle2 /> Passed
              </Badge>
            ) : (
              <Badge variant="destructive">
                <XCircle /> Failed
              </Badge>
            )
          ) : (
            <Badge variant="secondary">Unknown</Badge>
          )}
        </TableCell>
        <TableCell className="tabular-nums text-right text-success">
          {summary ? summary.passed : '—'}
        </TableCell>
        <TableCell className="tabular-nums text-right text-destructive">
          {summary ? summary.failed : '—'}
        </TableCell>
        <TableCell className="text-right">
          <span className="text-xs text-muted-foreground">{run.pages.length} pages</span>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30">
            <RunDetail run={run} onCompare={onCompare} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  )
}

function Timeline({ runs }: { runs: Run[] }) {
  const limited = runs.slice(0, 20)
  const max = Math.max(1, ...limited.map((r) => r.summary?.failed ?? 0))
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1.5">
        {limited.map((r) => {
          const failed = r.summary?.failed ?? 0
          const ok = failed === 0
          return (
            <div key={r.file.filename} className="group relative flex flex-col items-center">
              <div
                className={cn(
                  'w-3 rounded-sm',
                  ok ? 'bg-success' : 'bg-destructive'
                )}
                style={{ height: `${Math.max(6, (failed / max) * 40 + 6)}px` }}
                title={`${new Date(r.file.timestamp).toLocaleString()} · ${r.summary?.failed ?? '?'} failed`}
              />
              <span className="mt-1 hidden w-max text-[10px] text-muted-foreground group-hover:block">
                {new Date(r.file.timestamp).toLocaleDateString()}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-success" /> Passed
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-destructive" /> Failed
        </span>
      </div>
    </div>
  )
}

function RunDetail({ run, onCompare }: { run: Run; onCompare: (page: string) => void }) {
  const summary = run.summary
  if (!summary) {
    return (
      <p className="py-3 text-sm text-muted-foreground">
        Could not load details for this run.
      </p>
    )
  }
  if (run.pages.length === 0) {
    return (
      <div className="grid gap-3 py-2 sm:grid-cols-3">
        <MiniStat label="Pages" value={summary.total} />
        <MiniStat label="Passed" value={summary.passed} success />
        <MiniStat label="Failed" value={summary.failed} destructive />
      </div>
    )
  }
  return (
    <div className="space-y-3 py-2">
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label="Pages" value={summary.total} />
        <MiniStat label="Passed" value={summary.passed} success />
        <MiniStat label="Failed" value={summary.failed} destructive />
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Page</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[90px]">Diff %</TableHead>
              <TableHead className="w-[110px] text-right">Diff Pixels</TableHead>
              <TableHead className="w-[130px] text-right">Visual</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {run.pages.map((p) => (
              <TableRow key={p.pageName}>
                <TableCell>
                  <span className="font-medium">{p.pageName}</span>
                </TableCell>
                <TableCell>{statusBadge(p)}</TableCell>
                <TableCell className="tabular-nums">{p.diffPercent}%</TableCell>
                <TableCell className="tabular-nums text-right text-muted-foreground">
                  {p.diffPixels.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {!p.errored && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onCompare(p.pageName)}
                    >
                      <GitCompareArrows /> Compare
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function MiniStat({
  label,
  value,
  success,
  destructive,
}: {
  label: string
  value: number
  success?: boolean
  destructive?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3',
        success && 'border-l-4 border-l-success',
        destructive && 'border-l-4 border-l-destructive'
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-lg font-bold tabular-nums',
          success && 'text-success',
          destructive && 'text-destructive'
        )}
      >
        {value}
      </div>
    </div>
  )
}
