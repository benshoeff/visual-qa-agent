import { useState, useEffect, useRef } from 'react'
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
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { getPages, dispatchRun, getRunStatus, isRunPending, runConclusion } from '../api'
import type { PageConfig, RunStatus } from '../api'
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
  const polling = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    getPages().then(setPages).catch(() => {})
    getRunStatus().then((runs) => setRunStatus(runs[0] ?? null)).catch(() => {})
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
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}