import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Monitor, Target, Clock, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { updateConfig } from '@/api'
import { useProject } from '@/contexts/ProjectContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Capture settings for the next run. Collapsed by default — configuration is
 * not health, so it should not compete with the verdict for attention.
 */
export default function RunSettingsCard() {
  const { project, reload } = useProject()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [thresholdInput, setThresholdInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const sliderRef = useRef<HTMLInputElement>(null)

  const config = project

  useEffect(() => {
    if (editing && sliderRef.current) sliderRef.current.focus()
  }, [editing])

  if (!config) return null

  const startEdit = () => {
    setThresholdInput(String(config.threshold))
    setEditing(true)
  }

  const cancelEdit = () => setEditing(false)

  const saveThreshold = async () => {
    const val = parseFloat(thresholdInput)
    setEditing(false)
    if (isNaN(val) || val < 0 || val > 100) {
      toast.error('Threshold must be between 0 and 100')
      return
    }
    if (val === config.threshold) return

    setSaving(true)
    try {
      await updateConfig({ threshold: val }, config.id)
      await reload()
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1800)
    } catch {
      toast.error('Could not save threshold')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border bg-card shadow-depth-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/50"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Target className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-medium">Next run settings</span>
            <span className="tabular block truncate text-xs text-muted-foreground">
              {config.viewport.width}×{config.viewport.height} · threshold {config.threshold}% ·
              wait {config.waitFor || 'load'}
            </span>
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          {saved && <Check className="size-4 text-success" aria-label="Saved" />}
          <ChevronDown
            className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Setting
              icon={Monitor}
              label="Viewport"
              value={`${config.viewport.width} × ${config.viewport.height}`}
            />
            <Setting icon={Clock} label="Wait for" value={config.waitFor || 'load'} />
            <Setting
              icon={Target}
              label="Pages tracked"
              value={`${config.pages.length}`}
            />
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Diff threshold</p>
                <p className="text-xs text-muted-foreground">
                  Percentage of changed pixels tolerated before a page fails.
                </p>
              </div>

              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={sliderRef}
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={thresholdInput}
                    onChange={(e) => setThresholdInput(e.target.value)}
                    onMouseUp={saveThreshold}
                    onTouchEnd={saveThreshold}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') cancelEdit()
                      if (e.key === 'Enter') void saveThreshold()
                    }}
                    className="threshold-slider w-40"
                    aria-label="Diff threshold percent"
                  />
                  <span className="tabular w-14 text-right text-sm font-semibold text-primary">
                    {thresholdInput}%
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="tabular text-lg font-semibold">{config.threshold}%</span>
                  <Button variant="outline" size="sm" onClick={startEdit}>
                    Edit
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Setting({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" aria-hidden="true" />
        {label}
      </div>
      <div className="tabular mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  )
}