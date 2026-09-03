import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Camera,
  Loader2,
  Play,
  CheckCircle2,
  XCircle,
  ExternalLink,
  FileBarChart2,
  CheckSquare,
  Square,
  AlertTriangle,
  History as HistoryIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  getPages,
  dispatchRun,
  getRunStatus,
  isRunPending,
  runConclusion,
  getReports,
  fetchReportHtml,
} from '../api'
import type { PageConfig, RunStatus } from '../api'
import { parseReport } from '@/lib/reportParser'
import type { PageResult } from '@/lib/reportParser'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export default function TestRunner() {
  const [loading, setLoading] = useState<'baseline' | 'test' | null>(null)
  const [error, setError] = useState('')
  const [pages, setPages] = useState<PageConfig[]>([])
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set())
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null)
  const [runSummary, setRunSummary] = useState<PageResult[]>([])
  const polling = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadSummary = async () => {
    try {
      const reports = await getReports()
      const latest = reports[0]
      if (!latest) {
        setRunSummary([])
        return
      }
      const html = await fetchReportHtml(latest.filename)
      const { pages } = parseReport(html)
      setRunSummary(pages)
    } catch {
      setRunSummary([])
    }
  }

  useEffect(() => {
    getPages().then(setPages).catch(() => {})
    getRunStatus().then((runs) => setRunStatus(runs[0] ?? null)).catch(() => {})
    loadSummary()
  }, [])

  useEffect(() => {
    return () => {
      if (polling.current) clearInterval(polling.current)
    }
  }, [])

  const stopPolling = () => {
    if (polling.current) {
      clearInterval(polling.current)
      polling.current = null
    }
  }

  const startPolling = () => {
    stopPolling()
    polling.current = setInterval(async () => {
      try {
        const runs = await getRunStatus()
        const latest = runs[0] ?? null
        setRunStatus(latest)
        if (latest && !isRunPending(latest)) {
          stopPolling()
          setLoading(null)
          getPages().then(setPages).catch(() => {})
          loadSummary()
        }
      } catch {
        stopPolling()
        setLoading(null)
      }
    }, 15000)
  }

  const allSelected = pages.length > 0 && selectedPages.size === pages.length

  const toggleSelectAll = () => {
    setSelectedPages(allSelected ? new Set() : new Set(pages.map((p) => p.name)))
  }

  const togglePage = (name: string) => {
    const next = new Set(selectedPages)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setSelectedPages(next)
  }

  const handleRun = async (mode: 'baseline' | 'test') => {
    const names = [...selectedPages]
    if (names.length === 0) {
      setError('Select at least one page to run')
      return
    }
    setError('')
    setLoading(mode)
    setRunStatus(null)
    try {
      await dispatchRun(mode, { pages: names })
      startPolling()
    } catch (e) {
      setError((e as Error).message)
      setLoading(null)
    }
  }

  const conclusion = runConclusion(runStatus)
  const pending = isRunPending(runStatus)

  const summaryPassed = runSummary.filter((r) => r.passed).length
  const summaryFailed = runSummary.filter((r) => !r.passed && r.errored).length
  const summaryFailedNotErrored = runSummary.filter((r) => !r.passed && !r.errored).length
  const summaryFailedCount = summaryFailed + summaryFailedNotErrored

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Test Runner</h1>
        <p className="text-sm text-muted-foreground">
          Runs are executed in GitHub Actions and will appear below once started.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Select Pages</CardTitle>
        </CardHeader>
        <CardContent>
          {pages.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No pages configured yet.{' '}
              <Link to="/pages" className="text-primary hover:underline">
                Add pages
              </Link>{' '}
              to run tests.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <label className="flex cursor-pointer items-center gap-3 border-b bg-muted/40 px-4 py-3 hover:bg-muted/60">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className="text-sm font-medium">
                  Select All ({pages.length})
                </span>
                {allSelected ? (
                  <CheckSquare className="ml-auto size-4 text-primary" />
                ) : (
                  <Square className="ml-auto size-4 text-muted-foreground" />
                )}
              </label>
              <div className="max-h-[320px] divide-y overflow-y-auto">
                {pages.map((p) => (
                  <label
                    key={p.name}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50',
                      selectedPages.has(p.name) && 'bg-primary/5'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPages.has(p.name)}
                      onChange={() => togglePage(p.name)}
                      className="size-4 accent-[var(--primary)]"
                    />
                    <span className="min-w-0 text-sm font-medium">{p.name}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {p.url}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-5">
          <Button
            onClick={() => handleRun('baseline')}
            disabled={loading !== null || selectedPages.size === 0}
          >
            {loading === 'baseline' ? <Loader2 className="animate-spin" /> : <Camera />}
            {loading === 'baseline' ? 'Capturing…' : 'Capture Baseline'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleRun('test')}
            disabled={loading !== null || selectedPages.size === 0}
          >
            {loading === 'test' ? <Loader2 className="animate-spin" /> : <Play />}
            {loading === 'test' ? 'Running…' : 'Run Tests'}
          </Button>
          {selectedPages.size === 0 && (
            <p className="text-sm text-muted-foreground">
              Select at least one page to run.
            </p>
          )}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {loading === 'baseline'
                ? 'Capturing baseline screenshots…'
                : 'Running visual tests…'}
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <XCircle className="size-4" /> {error}
        </div>
      )}

      {runStatus && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Latest Run</CardTitle>
            {pending ? (
              <Badge variant="warning">
                <Loader2 className="size-3 animate-spin" /> Running
              </Badge>
            ) : conclusion === 'success' ? (
              <Badge variant="success">
                <CheckCircle2 /> Success
              </Badge>
            ) : (
              <Badge variant="destructive">
                <XCircle /> <span className="capitalize">{runStatus.conclusion ?? 'failed'}</span>
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm">
              <span className="font-medium">Run #{runStatus.runNumber}</span>
              <span className="text-muted-foreground">
                {' '}
                · {new Date(runStatus.createdAt).toLocaleString('en-US')}
              </span>
            </div>
            {pending && (
              <div className="flex items-center gap-3">
                <Progress value={45} className="flex-1" />
                <span className="shrink-0 text-xs text-muted-foreground">
                  Polling every 15s…
                </span>
              </div>
            )}
            {!pending && latestByPage.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="font-medium">{summaryPassed} passed</span>
                  <span className="mx-1 text-muted-foreground">/</span>
                  <span className="font-medium text-destructive">{summaryFailed} failed</span>
                  <span className="mx-1 text-muted-foreground">/</span>
                  <span className="text-muted-foreground">{latestByPage.length} pages</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {latestByPage.map((r) => {
                    const ok = r.status === 'PASSED' || r.status === 'AI_ACCEPTED' || r.status === 'AI_REJECTED'
                    const err = r.status === 'FAILED' || r.status === 'ERROR'
                    return (
                      <span
                        key={r.page}
                        title={`${r.page}: ${r.status} · diff ${r.diffPercent}%`}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium',
                          ok
                            ? 'border-success/40 bg-success/10 text-success'
                            : err
                              ? 'border-destructive/40 bg-destructive/10 text-destructive'
                              : 'border-warning/40 bg-warning/10 text-foreground'
                        )}
                      >
                        {ok ? <CheckCircle2 /> : err ? <XCircle /> : <AlertTriangle />}
                        {r.page}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={runStatus.htmlUrl} target="_blank" rel="noreferrer">
                  <ExternalLink /> View Run Logs
                </a>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/reports">
                  <FileBarChart2 /> View Reports
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/history">
                  <HistoryIcon /> View History
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}