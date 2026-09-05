import { useCallback, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { DiffRegion } from '../api'

interface Props {
  baselineUrl: string
  currentUrl: string
  diffUrl?: string
  label?: string
  regions?: DiffRegion[]
}

const ZOOM_STEP = 0.25
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3

export default function FullPageDiff({
  baselineUrl,
  currentUrl,
  diffUrl,
  label,
  regions = [],
}: Props) {
  const [view, setView] = useState<'compare' | 'diff'>('compare')
  const [zoom, setZoom] = useState(1)
  const [totalH, setTotalH] = useState<number>(0)

  const paneBaseRef = useRef<HTMLDivElement>(null)
  const paneCurRef = useRef<HTMLDivElement>(null)
  const paneDiffRef = useRef<HTMLDivElement>(null)
  const imgBaseRef = useRef<HTMLImageElement>(null)
  const imgCurRef = useRef<HTMLImageElement>(null)
  const imgDiffRef = useRef<HTMLImageElement>(null)
  const syncing = useRef(false)

  const updateTotalH = useCallback(() => {
    const heights = [
      imgBaseRef.current?.naturalHeight,
      imgCurRef.current?.naturalHeight,
      imgDiffRef.current?.naturalHeight,
    ].filter((h): h is number => !!h)
    if (heights.length > 0) setTotalH(Math.max(...heights))
  }, [])

  const syncScroll = useCallback((from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to || syncing.current) return
    syncing.current = true
    to.scrollTop = from.scrollTop
    to.scrollLeft = from.scrollLeft
    requestAnimationFrame(() => {
      syncing.current = false
    })
  }, [])

  const jumpTo = useCallback((y: number, target: 'diff' | 'compare') => {
    const scrollPane = (pane: HTMLDivElement | null, img: HTMLImageElement | null) => {
      if (!pane || !img || !img.naturalHeight) return
      const scale = img.getBoundingClientRect().height / img.naturalHeight
      pane.scrollTop = Math.max(0, y * scale)
    }
    if (target === 'diff') {
      scrollPane(paneDiffRef.current, imgDiffRef.current)
    } else {
      scrollPane(paneBaseRef.current, imgBaseRef.current)
      scrollPane(paneCurRef.current, imgCurRef.current)
    }
  }, [])

  const handleMinimapClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.height === 0 || totalH === 0) return
    const y = ((e.clientY - rect.top) / rect.height) * totalH
    jumpTo(y, view === 'diff' ? 'diff' : 'compare')
  }

  const stepZoom = (delta: number) =>
    setZoom((z) => Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta)) / ZOOM_STEP) * ZOOM_STEP)

  const zoomPct = `${zoom * 100}%`
  const hasDiff = !!diffUrl

  return (
    <div className="space-y-3">
      {label && <p className="text-center text-sm text-muted-foreground">{label}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border p-0.5">
          <button
            type="button"
            onClick={() => setView('compare')}
            className={cn(
              'rounded-md px-3 py-1 text-sm font-medium transition-colors',
              view === 'compare' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            Baseline vs Current
          </button>
          {hasDiff && (
            <button
              type="button"
              onClick={() => setView('diff')}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                view === 'diff' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              Diff Image
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => stepZoom(-ZOOM_STEP)} title="Zoom out">
            <ZoomOut />
          </Button>
          <span className="w-14 text-center text-sm tabular-nums text-muted-foreground">
            {zoomPct}
          </span>
          <Button variant="outline" size="icon-sm" onClick={() => stepZoom(ZOOM_STEP)} title="Zoom in">
            <ZoomIn />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom(1)} title="Reset zoom">
            <RotateCcw />
          </Button>
        </div>
      </div>

      {view === 'compare' ? (
        <div className="flex h-[60vh] gap-2">
          <div className="min-w-0 flex-1">
            <div
              ref={paneBaseRef}
              onScroll={(event) => syncScroll(event.currentTarget, paneCurRef.current)}
              className="h-full overflow-auto rounded-lg border bg-muted [scrollbar-gutter:stable]"
            >
              <img
                ref={imgBaseRef}
                src={baselineUrl}
                alt="Baseline"
                onLoad={updateTotalH}
                style={{ width: zoomPct, maxWidth: 'none' }}
                className="block h-auto"
              />
            </div>
            <p className="mt-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Baseline
            </p>
          </div>

          <div className="min-w-0 flex-1">
            <div
              ref={paneCurRef}
              onScroll={(event) => syncScroll(event.currentTarget, paneBaseRef.current)}
              className="h-full overflow-auto rounded-lg border bg-muted [scrollbar-gutter:stable]"
            >
              <img
                ref={imgCurRef}
                src={currentUrl}
                alt="Current"
                onLoad={updateTotalH}
                style={{ width: zoomPct, maxWidth: 'none' }}
                className="block h-auto"
              />
            </div>
            <p className="mt-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Current
            </p>
          </div>

          {regions.length > 0 && (
            <Minimap regions={regions} totalH={totalH} onClick={handleMinimapClick} />
          )}
        </div>
      ) : (
        hasDiff && (
          <div className="flex h-[60vh] gap-2">
            <div
              ref={paneDiffRef}
              onScroll={(event) => syncScroll(event.currentTarget, null)}
              className="relative min-w-0 flex-1 overflow-auto rounded-lg border bg-muted"
            >
              <img
                ref={imgDiffRef}
                src={diffUrl}
                alt="Diff"
                onLoad={updateTotalH}
                style={{ width: zoomPct, maxWidth: 'none' }}
                className="block h-auto"
              />
            </div>
            <Minimap regions={regions} totalH={totalH} onClick={handleMinimapClick} />
          </div>
        )
      )}

      {regions.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {regions.length} diff region{regions.length === 1 ? '' : 's'} — click the mini-map to jump. The
          shorter capture is padded with neutral grey to compare full-page heights.
        </p>
      )}
    </div>
  )
}

function Minimap({
  regions,
  totalH,
  onClick,
}: {
  regions: DiffRegion[]
  totalH: number
  onClick: (e: ReactMouseEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === ' ' && onClick(e as unknown as ReactMouseEvent<HTMLDivElement>)}
      className="relative h-full w-14 shrink-0 cursor-pointer select-none overflow-hidden rounded-lg border bg-background"
      title="Click to jump to a diff region"
    >
      {totalH > 0 &&
        regions.map((r, i) => (
          <div
            key={i}
            className="absolute left-0 w-full border-l-2 border-red-600 bg-red-500/40"
            style={{
              top: `${(r.y / totalH) * 100}%`,
              height: `${(r.height / totalH) * 100}%`,
            }}
            title={`Region ${i + 1}: y=${r.y} h=${r.height}`}
          />
        ))}
      <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-background/80 px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        {totalH > 0 ? `${regions.length} diff` : '…'}
      </span>
    </div>
  )
}