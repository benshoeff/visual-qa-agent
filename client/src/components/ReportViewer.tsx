import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  FileBarChart2,
  GitCompareArrows,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { getReports, getReportUrl, getImageUrl, fetchReportHtml } from '../api'
import type { ReportFile } from '../api'
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

const PER_PAGE = 10

interface PageResult {
  pageName: string
  passed: boolean
  diffPercent: number
  diffPixels: number
  errored?: boolean
}

interface Summary {
  total: number
  passed: number
  failed: number
}

function parseReport(html: string): { summary: Summary | null; pages: PageResult[] } {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const nums = Array.from(doc.querySelectorAll('.summary .stat .num')).map((el) =>
    parseInt(el.textContent ?? '', 10)
  )
  let summary: Summary | null = null
  if (nums.length >= 3) {
    summary = {
      total: nums[0] || 0,
      passed: nums[1] || 0,
      failed: nums[2] || 0,
    }
  }

  const pages: PageResult[] = []
  doc.querySelectorAll('tbody tr').forEach((row) => {
    const nameEl = row.querySelector('td strong')
    if (!nameEl) return
    const cells = row.querySelectorAll('td')
    const statusCell = cells[1]
    const diffCell = cells[2]
    const pixelsCell = cells[3]
    const isErrorRow = row.classList.contains('error-msg')
    if (!statusCell || !diffCell || !pixelsCell) return
    const text = statusCell.textContent ?? ''
    const passed = isErrorRow ? false : text.includes('✅') || text.toLowerCase().includes('pass')
    pages.push({
      pageName: nameEl.textContent || '',
      passed,
      errored: isErrorRow || text.toLowerCase().includes('error'),
      diffPercent: parseFloat(diffCell.textContent?.replace('%', '') || '0'),
      diffPixels: parseInt(pixelsCell.textContent?.replace(/[^0-9]/g, '') || '0'),
    })
  })

  return { summary, pages }
}

export default function ReportViewer() {
  const [reports, setReports] = useState<ReportFile[]>([])
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [report, setReport] = useState<{ summary: Summary | null; pages: PageResult[] } | null>(null)
  const [page, setPage] = useState(0)
  const [diffView, setDiffView] = useState<{ page: string; errored?: boolean } | null>(null)

  const totalPages = Math.max(1, Math.ceil(reports.length / PER_PAGE))
  const paginated = reports.slice(page * PER_PAGE, (page + 1) * PER_PAGE)

  useEffect(() => {
    getReports()
      .then((data) => {
        setReports(data)
        setPage(0)
      })
      .catch(() => toast.error('Failed to load reports'))
  }, [])

  const viewReport = async (filename: string) => {
    setSelectedReport(filename)
    setReport(null)
    try {
      const html = await fetchReportHtml(filename)
      setReport(parseReport(html))
    } catch {
      toast.error('Failed to load report')
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Browse past run results and compare screenshots.
        </p>
      </header>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <FileBarChart2 className="size-6 text-primary" />
          </div>
          <p className="text-sm font-medium">No reports yet</p>
          <p className="text-sm text-muted-foreground">Run a test first to generate reports.</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border bg-card">
            <div className="divide-y">
              {paginated.map((r) => (
                <div
                  key={r.filename}
                  role="button"
                  tabIndex={0}
                  onClick={() => viewReport(r.filename)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') viewReport(r.filename)
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/50',
                    selectedReport === r.filename && 'bg-primary/5 hover:bg-primary/5'
                  )}
                >
                  <FileBarChart2
                    className={cn(
                      'size-4 shrink-0 text-muted-foreground',
                      selectedReport === r.filename && 'text-primary'
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {r.filename}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(r.timestamp).toLocaleString('en-US')}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {(r.size / 1024).toFixed(0)} KB
                  </span>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft /> Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  Next <ChevronRight />
                </Button>
              </div>
            )}
          </div>

          {selectedReport && (
            <section className="space-y-4">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight">{selectedReport}</h2>
                <Button variant="outline" size="sm" asChild>
                  <a href={getReportUrl(selectedReport)} target="_blank" rel="noreferrer">
                    <ExternalLink /> Open Full Report
                  </a>
                </Button>
              </header>

              {report ? (
                <>
                  {report.summary && (
                    <div className="grid grid-cols-3 gap-3">
                      <Card className="flex-row items-center justify-between p-4">
                        <span className="text-sm font-medium text-muted-foreground">
                          Total Pages
                        </span>
                        <span className="text-2xl font-bold tabular-nums">
                          {report.summary.total}
                        </span>
                      </Card>
                      <Card className="flex-row items-center justify-between border-l-4 border-l-success p-4">
                        <span className="text-sm font-medium text-muted-foreground">
                          Passed
                        </span>
                        <span className="text-2xl font-bold tabular-nums text-success">
                          {report.summary.passed}
                        </span>
                      </Card>
                      <Card className="flex-row items-center justify-between border-l-4 border-l-destructive p-4">
                        <span className="text-sm font-medium text-muted-foreground">
                          Failed
                        </span>
                        <span className="text-2xl font-bold tabular-nums text-destructive">
                          {report.summary.failed}
                        </span>
                      </Card>
                    </div>
                  )}

                  {report.pages.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border bg-card">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead>Page</TableHead>
                            <TableHead className="w-[120px]">Status</TableHead>
                            <TableHead className="w-[100px]">Diff %</TableHead>
                            <TableHead className="w-[120px]">Diff Pixels</TableHead>
                            <TableHead className="w-[140px] text-right">Visual</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.pages.map((p) => (
                            <TableRow key={p.pageName}>
                              <TableCell>
                                <span className="font-medium">{p.pageName}</span>
                              </TableCell>
                              <TableCell>
                                {p.errored ? (
                                  <Badge variant="warning">
                                    <AlertTriangle /> Error
                                  </Badge>
                                ) : p.passed ? (
                                  <Badge variant="success">
                                    <CheckCircle2 /> Pass
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive">
                                    <XCircle /> Fail
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="tabular-nums">{p.diffPercent}%</TableCell>
                              <TableCell className="tabular-nums text-muted-foreground">
                                {p.diffPixels.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right">
                                {!p.errored && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDiffView({ page: p.pageName })}
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
                  ) : (
                    <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                      Could not parse report details. Open the full report instead.
                    </p>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="size-4 animate-spin rounded-full border-2 border-border border-t-primary" />
                  Loading report…
                </div>
              )}
            </section>
          )}
        </>
      )}

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