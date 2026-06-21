import { useRef, useState, useCallback, useEffect } from 'react'

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
    <div className="diff-slider-container">
      {label && <div className="diff-label">{label}</div>}
      <div
        ref={containerRef}
        className={`diff-slider ${dragging ? 'dragging' : ''}`}
        onMouseDown={onMouseDown}
        onTouchStart={onMouseDown}
      >
        <img src={currentUrl} alt="current" className="diff-image" draggable={false} />
        <div className="diff-overlay" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
          <img src={baselineUrl} alt="baseline" className="diff-image" draggable={false} />
        </div>
        <div className="diff-handle" style={{ left: `${position}%` }}>
          <div className="diff-handle-line" />
          <div className="diff-handle-knob">⟷</div>
        </div>
        <div className="diff-labels">
          <span className="diff-label-left">Baseline</span>
          <span className="diff-label-right">Current</span>
        </div>
      </div>
    </div>
  )
}
