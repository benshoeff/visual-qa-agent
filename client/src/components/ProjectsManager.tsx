import { useState } from 'react'
import { FolderKanban, Globe, FileText, Check, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  addProject,
  updateProject,
  deleteProject,
  type ProjectConfig,
} from '../api'
import { useProject } from '@/contexts/ProjectContext'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type EditorState = { name: string; baseUrl: string }

export default function ProjectsManager() {
  const { config, project, switchProject, reload } = useProject()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ProjectConfig | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProjectConfig | null>(null)
  const [editor, setEditor] = useState<EditorState>({ name: '', baseUrl: '' })
  const [busy, setBusy] = useState(false)

  const openCreate = () => {
    setEditor({ name: '', baseUrl: '' })
    setCreating(true)
  }

  const openEdit = (p: ProjectConfig) => {
    setEditor({ name: p.name, baseUrl: p.baseUrl })
    setEditing(p)
  }

  const save = async () => {
    if (!editor.name.trim() || !editor.baseUrl.trim()) {
      toast.error('Name and base URL are required')
      return
    }
    setBusy(true)
    try {
      if (creating) {
        await addProject({ name: editor.name.trim(), baseUrl: editor.baseUrl.trim() })
        toast.success('Project created')
        setCreating(false)
      } else if (editing) {
        await updateProject(editing.id, { name: editor.name.trim(), baseUrl: editor.baseUrl.trim() })
        toast.success('Project updated')
        setEditing(null)
      }
      await reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await deleteProject(deleteTarget.id)
      toast.success(`Project "${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
      await reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading projects…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Manage test sites. Each project has its own pages, viewport and threshold.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus /> New Project
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {config.projects.map((p) => (
          <Card key={p.id} className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FolderKanban className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{p.name}</span>
                    {p.id === project?.id && <Badge>Active</Badge>}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" aria-label={`Edit ${p.name}`} onClick={() => openEdit(p)}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Delete ${p.name}`} onClick={() => setDeleteTarget(p)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Globe className="size-3.5 shrink-0" />
              <span className="truncate">{p.baseUrl}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">
                <FileText className="size-3" /> {p.pages.length} pages
              </Badge>
              <Badge variant="outline">{p.viewport.width}×{p.viewport.height}</Badge>
              <Badge variant="outline">threshold {Math.round(p.threshold * 100)}%</Badge>
            </div>

            {p.id !== project?.id && (
              <Button
                variant="outline"
                size="sm"
                className="mt-auto w-full"
                onClick={() => switchProject(p.id).then(() => toast.success(`Switched to "${p.name}"`))}
              >
                <Check /> Set active
              </Button>
            )}
          </Card>
        ))}

        <button
          onClick={openCreate}
          className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          aria-label="Create project"
        >
          <Plus className="size-6" />
          <span className="text-sm">Add project</span>
        </button>
      </div>

      <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{creating ? 'New Project' : 'Edit Project'}</DialogTitle>
            <DialogDescription>
              Each project is a self-contained test site with separated baselines, diffs and reports.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                placeholder="My site"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-url">Base URL</Label>
              <Input
                id="project-url"
                value={editor.baseUrl}
                onChange={(e) => setEditor({ ...editor, baseUrl: e.target.value })}
                placeholder="https://example.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreating(false); setEditing(null) }}>Cancel</Button>
            <Button onClick={save} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete project</DialogTitle>
            <DialogDescription>
              This removes "{deleteTarget?.name}" and its pages, baselines, diffs and reports are no longer accessible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}