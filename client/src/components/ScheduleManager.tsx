import { useEffect, useState } from 'react'
import { Clock, Info } from 'lucide-react'
import { toast } from 'sonner'
import { getSchedules, type Schedule } from '../api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useProject } from '@/contexts/ProjectContext'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function formatLastRun(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function ScheduleManager() {
  const { project, config } = useProject()
  const projectId = project?.id
  const [schedules, setSchedules] = useState<Schedule[]>([])

  const refresh = () => getSchedules().then(setSchedules)

  useEffect(() => {
    getSchedules().then(setSchedules).catch(() => toast.error('Failed to load schedules'))
  }, [projectId])

  const visibleSchedules = schedules.filter((s) => !s.projectId || s.projectId === projectId)

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Schedules</h1>
        <p className="text-sm text-muted-foreground">
          Scheduled runs are defined in <code>schedules.yml</code> in the repository and run
          automatically on GitHub Actions.
        </p>
      </header>

      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          This page is read-only. To add, change, or pause a schedule, edit the{' '}
          <code className="rounded bg-background px-1.5 py-0.5 text-xs">schedules.yml</code> file
          and push — the workflow picks it up on the next hourly run.
        </p>
      </div>

      {visibleSchedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Clock className="size-6 text-primary" />
          </div>
          <p className="text-sm font-medium">No schedules defined</p>
          <p className="text-sm text-muted-foreground">
            Add entries to <code>schedules.yml</code> to get started.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Time (UTC)</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Run</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleSchedules.map((s) => (
                <TableRow key={s.name}>
                  <TableCell>
                    <span className="font-medium">{s.name}</span>
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-2 py-0.5 text-xs">{s.cronExpression}</code>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.projectId
                      ? (config?.projects.find((p) => p.id === s.projectId)?.name ?? s.projectId)
                      : 'Active project'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {s.mode}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={s.enabled ? 'outline' : 'secondary'} className={s.enabled ? 'text-success' : ''}>
                        {s.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                      {s.status === 'pass' && (
                        <span className="text-sm text-success">Last run passed</span>
                      )}
                      {s.status === 'fail' && (
                        <span className="text-sm text-destructive">Last run failed</span>
                      )}
                      {s.status === 'pending' && s.enabled && (
                        <span className="text-sm text-muted-foreground">Waiting for first run</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.lastRun ? (
                      <span title={new Date(s.lastRun).toLocaleString('en-US')}>
                        {formatLastRun(s.lastRun)}
                      </span>
                    ) : (
                      'Never'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={refresh}>
          Refresh
        </Button>
      </div>
    </div>
  )
}