import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileBarChart2, Inbox } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  fetchReportHtml,
  getDiffRegions,
  getImageUrl,
  getReports,
} from '@/api'
import { useProject } from '@/contexts/ProjectContext'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { parseReport, type PageResult, type ReportSummary } from '@/lib/reportParser'
import VerdictBar from './VerdictBar'
import LiveRunGauge from './LiveRunGauge'
import TriageInbox from './TriageInbox'
import PageHeatmap from './PageHeatmap'
import SignalStrip from './SignalStrip'
import RunSettingsCard from './RunSettingsCard'
import FullPageDiff from './FullPageDiff'
import type { DiffRegion } from '@/api'

interface LatestRun {
  filename: string
  timestamp: number
  pages: PageResult[]
  summary: ReportSummary | null
  generatedAt?: number
  rich: boolean
  model: string | null
}

/**
 * Home answers one question: is the site healthy right now.
 *
 * Everything on this screen is derived from the most recent report. The
 * classification column the agent already produces decides whether a change
 * blocks a release, so the verdict is prioritised by impact rather than by
 * page order.
 */
export default function Home() {
  const { project } = useProject()
  const projectId = project?.id

  const [run, setRun] = useState<LatestRun | null>(null)
  const [reportCount, setReportCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [compare, setCompare] = useState<{ page: string } | null>(null)
  const [regions, setRegions] = useState<DiffRegion[]>([])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      setSelected(null)
      try {
        const files = await getReports(projectId)
        if (cancelled) return
        setReportCount(files.length)

        // Most recent report is the only one the health verdict needs.
        const latest = [...files].sort((a, b) => b.timestamp - a.timestamp)[0]
        if (!latest) {
          setRun(null)
          return
        }

        const html = await fetchReportHtml(latest.filename, projectId)
        if (cancelled) return
        const parsed = parseReport(html)

        const model =
          parsed.pages.find((p) => p.aiModel)?.aiModel ?? null

        setRun({
          filename: latest.filename,
          timestamp: latest.timestamp,
          pages: parsed.pages,
          summary: parsed.summary,
          generatedAt: parsed.generatedAt ?? latest.timestamp,
          rich: parsed.rich,
          model,
        })
      } catch (e) {
        if (!cancelled) {
          setRun(null)
          setError(
            e instanceof Error ? e.message : 'Could not load the latest report'
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const pages = run?.pages ?? []

  const handleSelect = useCallback((pageName: string) => {
    setSelected((prev) => (prev === pageName ? null : pageName))
  }, [])

  const handleCompare = useCallback(
    (pageName: string) => {
      setCompare({ page: pageName })
      setRegions([])
      getDiffRegions(pageName, projectId).then((data) =>
        setRegions(data?.regions ?? [])
      )
    },
    [projectId]
  )

  const emptyState = useMemo(
    () => !loading && !error && reportCount === 0,
    [loading, error, reportCount]
  )

  return (
    <div className="space-y-6">
      <VerdictBar
        summary={run?.summary ?? null}
        pages={pages}
        generatedAt={run?.generatedAt}
        runCount={reportCount}
        loading={loading}
      />

      <LiveRunGauge projectId={projectId} />

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/8 p-4">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/reports">
              <FileBarChart2 /> Open reports
            </Link>
          </Button>
        </div>
      )}

      {emptyState && <EmptyState />}

      {!emptyState && !error && (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <TriageInbox
              pages={pages}
              selected={selected}
              onSelect={handleSelect}
              onCompare={handleCompare}
            />
            <div className="space-y-6">
              <PageHeatmap
                pages={pages}
                selected={selected}
                onSelect={handleSelect}
              />
              <SignalStrip pages={pages} model={run?.model ?? null} rich={run?.rich ?? false} />
            </div>
          </div>

          <RunSettingsCard />
        </>
      )}

      <Dialog open={compare != null} onOpenChange={(o) => !o && setCompare(null)}>
        <DialogContent className="max-w-7xl">
          <DialogHeader>
            <DialogTitle>{compare?.page}</DialogTitle>
          </DialogHeader>
          {compare && (
            <FullPageDiff
              baselineUrl={getImageUrl('baseline', compare.page, projectId)}
              currentUrl={getImageUrl('current', compare.page, projectId)}
              diffUrl={getImageUrl('diff', compare.page, projectId)}
              regions={regions}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-xl border bg-card p-10 text-center shadow-depth-1">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
        <Inbox className="size-6 text-primary" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-base font-semibold tracking-tight">No reports yet</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        Establish a baseline for your pages, then this screen will track every visual,
        accessibility, and performance regression from that point on.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link to="/crawl">Discover pages</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/runner">Run baseline</Link>
        </Button>
      </div>
    </div>
  )
}