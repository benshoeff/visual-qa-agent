import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, AlertTriangle, Clock } from 'lucide-react'
import { toast } from 'sonner'
import {
  getSchedules,
  addSchedule,
  updateSchedule,
  deleteSchedule,
  validateCron,
  type Schedule,
} from '../api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const PRESETS = [
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Daily at 9:00', cron: '0 9 * * *' },
  { label: 'Daily at 18:00', cron: '0 18 * * *' },
  { label: 'Weekdays at 9:00', cron: '0 9 * * 1-5' },
  { label: 'Weekly (Mon 9:00)', cron: '0 9 * * 1' },
]

interface EditorState {
  isNew: boolean
  id?: string
  name: string
  cronExpression: string
  mode: 'baseline' | 'test'
  enabled: boolean
}

export default function ScheduleManager() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null)
  const [error, setError] = useState('')
  const [validCron, setValidCron] = useState<{ valid: boolean; nextRun: string | null } | null>(null)

  const refresh = () => getSchedules().then(setSchedules)

  useEffect(() => {
    getSchedules().then(setSchedules).catch(() => toast.error('Failed to load schedules'))
  }, [])

  const openNew = () => {
    setEditor({ isNew: true, name: '', cronExpression: '', mode: 'test', enabled: true })
    setValidCron(null)
    setError('')
  }

  const openEdit = (s: Schedule) => {
    setEditor({
      isNew: false,
      id: s.id,
      name: s.name,
      cronExpression: s.cronExpression,
      mode: s.mode,
      enabled: s.enabled,
    })
    setValidCron(null)
    setError('')
  }

  const closeEditor = () => {
    setEditor(null)
    setError('')
    setValidCron(null)
  }

  const handleSave = async () => {
    if (!editor) return
    if (!editor.name || !editor.cronExpression || !editor.mode) {
      setError('Name, cron expression, and mode are required')
      return
    }
    setError('')
    try {
      if (editor.isNew) {
        await addSchedule({
          name: editor.name,
          cronExpression: editor.cronExpression,
          mode: editor.mode,
          enabled: editor.enabled,
        })
        toast.success(`Schedule "${editor.name}" created`)
      } else if (editor.id) {
        await updateSchedule(editor.id, {
          name: editor.name,
          cronExpression: editor.cronExpression,
          mode: editor.mode,
          enabled: editor.enabled,
        })
        toast.success(`Schedule "${editor.name}" updated`)
      }
      closeEditor()
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteSchedule(deleteTarget.id)
      toast.success(`Schedule "${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
      await refresh()
    } catch (e) {
      toast.error((e as Error).message)
      setDeleteTarget(null)
    }
  }

  const toggleEnabled = async (s: Schedule) => {
    try {
      await updateSchedule(s.id, { enabled: !s.enabled })
      await refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleCronChange = async (cron: string) => {
    setEditor((prev) => (prev ? { ...prev, cronExpression: cron } : prev))
    if (cron) {
      const result = validateCron(cron)
      setValidCron(result)
    } else {
      setValidCron(null)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Schedules</h1>
          <p className="text-sm text-muted-foreground">
            Automate baseline capture and regression runs.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus /> Add Schedule
        </Button>
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4" /> {error}
        </div>
      )}

      {schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Clock className="size-6 text-primary" />
          </div>
          <p className="text-sm font-medium">No schedules yet</p>
          <p className="text-sm text-muted-foreground">Click “Add Schedule” to create one.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Run</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <span className="font-medium">{s.name}</span>
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-2 py-0.5 text-xs">{s.cronExpression}</code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {s.mode}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={s.enabled}
                        onCheckedChange={() => toggleEnabled(s)}
                        aria-label={`Toggle ${s.name}`}
                      />
                      <span className="text-sm text-muted-foreground">
                        {s.enabled ? 'Active' : 'Paused'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.lastRun ? new Date(s.lastRun).toLocaleString('en-US') : 'Never'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(s)} aria-label={`Edit ${s.name}`}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteTarget(s)}
                        aria-label={`Delete ${s.name}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Editor dialog */}
      <Dialog open={editor != null} onOpenChange={(o) => !o && closeEditor()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editor?.isNew ? 'New Schedule' : 'Edit Schedule'}</DialogTitle>
            <DialogDescription>
              {editor?.isNew
                ? 'Automate a recurring run.'
                : 'Update schedule details.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sch-name">Name</Label>
              <Input
                id="sch-name"
                value={editor?.name ?? ''}
                onChange={(e) => setEditor((p) => (p ? { ...p, name: e.target.value } : p))}
                placeholder="Nightly regression"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sch-cron">Cron Expression</Label>
              <Input
                id="sch-cron"
                value={editor?.cronExpression ?? ''}
                onChange={(e) => handleCronChange(e.target.value)}
                placeholder="0 9 * * *"
              />
            </div>

            {validCron && (
              <p
                className={
                  validCron.valid
                    ? 'text-sm text-success'
                    : 'text-sm text-destructive'
                }
              >
                {validCron.valid
                  ? '✓ Valid — next run: pending (GitHub Actions)'
                  : 'Invalid cron expression'}
              </p>
            )}

            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Presets</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <Button
                    key={p.cron}
                    variant="outline"
                    size="sm"
                    onClick={() => handleCronChange(p.cron)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mode</Label>
              <Select
                value={editor?.mode ?? 'test'}
                onValueChange={(v) =>
                  setEditor((prev) => (prev ? { ...prev, mode: v as 'baseline' | 'test' } : prev))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">Test (compare vs baseline)</SelectItem>
                  <SelectItem value="baseline">Baseline (capture screenshots)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Enabled</p>
                <p className="text-xs text-muted-foreground">
                  Runs won’t dispatch while paused.
                </p>
              </div>
              <Switch
                checked={editor?.enabled ?? true}
                onCheckedChange={(v) => setEditor((prev) => (prev ? { ...prev, enabled: v } : prev))}
                aria-label="Enabled"
              />
            </div>

            {error && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="size-4" /> {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeEditor}>
              Cancel
            </Button>
            <Button onClick={handleSave}>{editor?.isNew ? 'Create' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-4 text-destructive" /> Delete schedule?
            </DialogTitle>
            <DialogDescription>
              “{deleteTarget?.name}” will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}