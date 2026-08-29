import { useEffect, useRef, useState } from 'react'
import { FileText, Monitor, Target, ClipboardList, Play, Settings2, FileBarChart2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getConfig, getReports, updateConfig } from '../api'
import type { Config } from '../api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>
  value: React.ReactNode
  label: string
  className?: string
  onClick?: () => void
  role?: string
  tabIndex?: number
  onKeyDown?: (e: React.KeyboardEvent) => void
  ariaLabel?: string
}

function StatCard({ icon: Icon, value, label, className, ...editable }: StatCardProps) {
  return (
    <Card
      className={cn(
        'flex-row items-center gap-4 p-5',
        editable.onClick && 'cursor-pointer card-lift',
        className
      )}
      onClick={editable.onClick}
      role={editable.role}
      tabIndex={editable.tabIndex}
      onKeyDown={editable.onKeyDown}
      aria-label={editable.ariaLabel}
    >
      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <Icon className="size-6 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const [config, setConfig] = useState<Config | null>(null)
  const [reportCount, setReportCount] = useState(0)
  const [editingThreshold, setEditingThreshold] = useState(false)
  const [thresholdInput, setThresholdInput] = useState('')
  const sliderRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getConfig().then(setConfig)
    getReports().then((r) => setReportCount(r.length))
  }, [])

  useEffect(() => {
    if (editingThreshold && sliderRef.current) {
      sliderRef.current.focus()
    }
  }, [editingThreshold])

  const startEditThreshold = () => {
    if (!config) return
    setThresholdInput(String(config.threshold))
    setEditingThreshold(true)
  }

  const saveThreshold = async () => {
    const val = parseFloat(thresholdInput)
    if (!isNaN(val) && val >= 0 && val <= 100) {
      try {
        const updated = await updateConfig({ threshold: val })
        setConfig(updated)
      } catch {
        // revert on failure
      }
    }
    setEditingThreshold(false)
  }

  const cancelEdit = () => setEditingThreshold(false)

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visual regression monitoring overview.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={FileText}
          label="Pages to test"
          value={config ? config.pages.length : <Skeleton className="h-6 w-10" />}
        />
        <StatCard
          icon={Monitor}
          label="Viewport"
          value={config ? `${config.viewport.width}×${config.viewport.height}` : <Skeleton className="h-6 w-16" />}
        />
        <StatCard
          icon={Target}
          label="Threshold"
          value={
            editingThreshold ? (
              <div
                className="flex flex-col gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  ref={sliderRef}
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  onMouseUp={saveThreshold}
                  onTouchEnd={saveThreshold}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') cancelEdit()
                    if (e.key === 'Enter') saveThreshold()
                  }}
                  className="threshold-slider"
                  aria-label="Threshold percent"
                />
                <span className="text-2xl font-bold tabular-nums text-primary">
                  {thresholdInput}%
                </span>
              </div>
            ) : config ? (
              <span className="tabular-nums">{config.threshold}%</span>
            ) : (
              <Skeleton className="h-6 w-10" />
            )
          }
          onClick={editingThreshold ? undefined : startEditThreshold}
          role="button"
          tabIndex={0}
          ariaLabel="Edit threshold"
          onKeyDown={(e) => {
            if (!editingThreshold && (e.key === 'Enter' || e.key === ' ')) startEditThreshold()
          }}
        />
        <StatCard
          icon={ClipboardList}
          label={reportCount > 0 ? 'Reports total' : 'Reports'}
          value={
            reportCount > 0 && config ? (
              <span className="tabular-nums">{reportCount}</span>
            ) : config ? (
              '—'
            ) : (
              <Skeleton className="h-6 w-10" />
            )
          }
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/runner">
              <Play /> Run Tests
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/pages">
              <Settings2 /> Manage Pages
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/reports">
              <FileBarChart2 /> View Reports
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}