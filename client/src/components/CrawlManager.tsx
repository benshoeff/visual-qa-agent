import { useState, useEffect, useRef } from 'react'
import {
  ScanSearch,
  Loader2,
  CheckSquare,
  Square,
  CheckCircle2,
  XCircle,
  Settings2,
} from 'lucide-react'
import { toast } from 'sonner'
import { startCrawl, getCrawlJob, confirmBaselines } from '../api'
import type { CrawlJob, DiscoveredPage } from '../api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface CrawlConfigInput {
  maxPages: number
  maxDepth: number
  sameDomainOnly: boolean
  waitFor: 'networkidle' | 'domcontentloaded' | 'load'
}

const STATUS_STYLE: Record<
  CrawlJob['status'],
  { badge: 'warning' | 'default' | 'success' | 'destructive' }
> = {
  pending: { badge: 'warning' },
  running: { badge: 'default' },
  completed: { badge: 'success' },
  failed: { badge: 'destructive' },
}

function PageCard({
  page,
  selected,
  onToggle,
}: {
  page: DiscoveredPage
  selected: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 transition-all',
        selected && 'border-primary/60 ring-1 ring-primary/30'
      )}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{page.name}</span>
            {page.depth > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Depth {page.depth}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{page.url}</p>
        </div>
      </label>
    </div>
  )
}

export default function CrawlManager() {
  const [url, setUrl] = useState('')
  const [config, setConfig] = useState<CrawlConfigInput>({
    maxPages: 50,
    maxDepth: 3,
    sameDomainOnly: true,
    waitFor: 'networkidle',
  })
  const [autoCapture, setAutoCapture] = useState(true)
  const [starting, setStarting] = useState(false)
  const [activeJob, setActiveJob] = useState<CrawlJob | null>(null)
  const [polling, setPolling] = useState(false)
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set())
  const [showAdvanced, setShowAdvanced] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
      setPolling(false)
    }
  }

  const startPolling = (jobId: string, alreadyDone = false) => {
    if (alreadyDone) return
    setPolling(true)
    pollRef.current = setInterval(async () => {
      try {
        const job = await getCrawlJob(jobId)
        if (job) {
          setActiveJob(job)
          if (job.status === 'completed' || job.status === 'failed') {
            stopPolling()
            toast.success(job.status === 'completed' ? 'Crawl completed' : 'Crawl failed')
          }
        }
      } catch {
        stopPolling()
      }
    }, 15000)
  }

  const handleStartCrawl = async () => {
    if (!url.trim()) return
    setStarting(true)
    try {
      const { jobId } = await startCrawl(url.trim(), {
        maxPages: config.maxPages,
        maxDepth: config.maxDepth,
        sameDomainOnly: config.sameDomainOnly,
        waitFor: config.waitFor,
      })
      setUrl('')
      setActiveJob({
        id: jobId,
        status: 'pending',
        startUrl: url.trim(),
        discoveredPages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      setSelectedPages(new Set())
      startPolling(jobId)
      toast.success('Crawl dispatched to GitHub Actions')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to start crawl')
    } finally {
      setStarting(false)
    }
  }

  const handleConfirmBaselines = async () => {
    if (!activeJob || selectedPages.size === 0) return
    try {
      const result = await confirmBaselines(activeJob.id, Array.from(selectedPages))
      toast.success(`Added ${result.added} pages, skipped ${result.skipped}`)
      setSelectedPages(new Set())
    } catch (err) {
      toast.error((err as Error).message || 'Failed to confirm baselines')
    }
  }

  const togglePage = (name: string) => {
    const newSet = new Set(selectedPages)
    if (newSet.has(name)) newSet.delete(name)
    else newSet.add(name)
    setSelectedPages(newSet)
  }

  const toggleAllPages = () => {
    if (!activeJob) return
    const allNames = activeJob.discoveredPages.map((p) => p.name)
    setSelectedPages(
      selectedPages.size === allNames.length ? new Set() : new Set(allNames)
    )
  }

  const status = activeJob ? STATUS_STYLE[activeJob.status] : null
  const isBusy = starting || polling

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Site Crawler</h1>
        <p className="text-sm text-muted-foreground">
          Discover pages and capture baselines automatically (runs in GitHub Actions).
        </p>
      </header>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Start New Crawl</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
          >
            <Settings2 /> Advanced
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="crawl-url">Website URL</Label>
            <Input
              id="crawl-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          {showAdvanced && (
            <div className="space-y-5 rounded-lg border bg-muted/30 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="crawl-max-pages">Max Pages</Label>
                  <Input
                    id="crawl-max-pages"
                    type="number"
                    value={config.maxPages}
                    onChange={(e) =>
                      setConfig({ ...config, maxPages: parseInt(e.target.value) || 1 })
                    }
                    min={1}
                    max={500}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="crawl-max-depth">Max Depth</Label>
                  <Input
                    id="crawl-max-depth"
                    type="number"
                    value={config.maxDepth}
                    onChange={(e) =>
                      setConfig({ ...config, maxDepth: parseInt(e.target.value) || 1 })
                    }
                    min={1}
                    max={10}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Wait Strategy</Label>
                  <Select
                    value={config.waitFor}
                    onValueChange={(v) =>
                      setConfig({ ...config, waitFor: v as CrawlConfigInput['waitFor'] })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="networkidle">Network Idle</SelectItem>
                      <SelectItem value="domcontentloaded">DOM Content Loaded</SelectItem>
                      <SelectItem value="load">Load</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={config.sameDomainOnly}
                  onChange={(e) =>
                    setConfig({ ...config, sameDomainOnly: e.target.checked })
                  }
                  className="size-4 accent-[var(--primary)]"
                />
                Same domain only
              </label>
            </div>
          )}

          <div className="flex flex-wrap gap-5">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={autoCapture}
                onChange={(e) => setAutoCapture(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Auto-capture baselines after crawl
            </label>
          </div>

          <Button onClick={handleStartCrawl} disabled={!url.trim() || isBusy}>
            {isBusy ? <Loader2 className="animate-spin" /> : <ScanSearch />}
            {isBusy
              ? 'Crawl running in GitHub Actions…'
              : autoCapture
                ? 'Crawl & Capture Baselines'
                : 'Crawl Only'}
          </Button>
        </CardContent>
      </Card>

      {activeJob && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Crawl Progress</CardTitle>
            {status && <Badge variant={status.badge}>{activeJob.status.toUpperCase()}</Badge>}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm">
              <span className="font-medium">URL:</span>{' '}
              <span className="text-muted-foreground">{activeJob.startUrl}</span>
            </div>

            {(activeJob.status === 'pending' || activeJob.status === 'running') && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Crawling and capturing… This runs in GitHub Actions and can take several minutes.
              </div>
            )}

            {activeJob.status === 'failed' && activeJob.error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <XCircle className="size-4 shrink-0" />
                <span>
                  <strong>Error:</strong> {activeJob.error}
                </span>
              </div>
            )}

            {activeJob.status === 'completed' && activeJob.discoveredPages.length > 0 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-sm font-medium">
                    Discovered Pages ({activeJob.discoveredPages.length})
                  </h3>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={toggleAllPages}>
                      {selectedPages.size === activeJob.discoveredPages.length ? (
                        <>
                          <Square /> Deselect All
                        </>
                      ) : (
                        <>
                          <CheckSquare /> Select All
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      disabled={selectedPages.size === 0}
                      onClick={handleConfirmBaselines}
                    >
                      <CheckCircle2 /> Add {selectedPages.size} to Config
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {activeJob.discoveredPages.map((page) => (
                    <PageCard
                      key={page.name}
                      page={page}
                      selected={selectedPages.has(page.name)}
                      onToggle={() => togglePage(page.name)}
                    />
                  ))}
                </div>
              </div>
            )}

            {activeJob.status === 'completed' && activeJob.discoveredPages.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No pages discovered. Try adjusting crawl settings.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}