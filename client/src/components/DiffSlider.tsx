import { useRef, useState, useCallback, useEffect } from 'react'
import { MoveHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  baselineUrl: string
  currentUrl: string
  label?: string
}

export default function DiffSlider({ baselineUrl, currentUrl, label }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(50)
  const [dragging, setDragging] = useState(false)

  const handleMove = useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
      setPosition((x / rect.width) * 100)
    },
    []
  )

  const onMouseDown = () => setDragging(true)

  useEffect(() => {
    if (!dragging) return
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX)
    const onTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX)
    const onEnd = () => setDragging(false)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onTouchMove)
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [dragging, handleMove])

  return (
    <div className="space-y-3">
      {label && (
        <p className="text-center text-sm text-muted-foreground">{label}</p>
      )}
      <div
        ref={containerRef}
        className={cn(
          'relative select-none overflow-hidden rounded-xl border bg-muted',
          dragging ? 'cursor-col-resize' : 'cursor-ew-resize'
        )}
        onMouseDown={onMouseDown}
        onTouchStart={onMouseDown}
      >
        <img
          src={currentUrl}
          alt="Current"
          draggable={false}
          className="block h-auto w-full"
        />
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <img
            src={baselineUrl}
            alt="Baseline"
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>

        <div className="absolute top-0 bottom-0 z-10 -translate-x-1/2" style={{ left: `${position}%` }}>
          <div className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.6)]" />
          <div className="absolute top-1/2 left-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-foreground shadow-lg">
            <MoveHorizontal className="size-5" />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-between px-3">
          <span className="rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white">
            Baseline
          </span>
          <span className="rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white">
            Current
          </span>
        </div>
      </div>
    </div>
  )
}