import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Camera,
  Play,
  EyeOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { getPages, addPage, updatePage, deletePage, dispatchRun, getImageUrl } from '../api'
import type { PageConfig } from '../api'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

const emptyPage = (): PageConfig => ({ name: '', url: '' })

type LoadingState = Record<string, 'baseline' | 'test' | null>

function PageThumbnail({
  name,
  refreshKey,
  onPreview,
}: {
  name: string
  refreshKey: number
  onPreview: (url: string) => void
}) {
  const [hidden, setHidden] = useState(false)
  const url = `${getImageUrl('baseline', name)}&t=${refreshKey}`

  return hidden ? (
    <div className="flex size-[60px] items-center justify-center rounded-md border bg-muted text-[10px] text-muted-foreground">
      No shot
    </div>
  ) : (
    <img
      src={url}
      alt={name}
      title={`Preview ${name}`}
      className="size-[60px] cursor-pointer rounded-md border object-cover transition-opacity hover:opacity-80"
      onError={() => setHidden(true)}
      onClick={() => onPreview(url)}
    />
  )
}

export default function PagesManager() {
  const [pages, setPages] = useState<PageConfig[]>([])
  const [editing, setEditing] = useState<PageConfig | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PageConfig | null>(null)
  const [error, setError] = useState('')
  const [loadingPages, setLoadingPages] = useState<LoadingState>({})
  const [refreshKey, setRefreshKey] = useState(0)
  const [originalName, setOriginalName] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null)

  const refresh = useCallback(() => getPages().then(setPages), [])

  useEffect(() => {
    getPages().then(setPages).catch(() => toast.error('Failed to load pages'))
  }, [])

  const closeEditor = () => {
    setEditing(null)
    setOriginalName(null)
    setIsNew(false)
    setError('')
  }

  const handleSave = async () => {
    if (!editing) return
    if (!editing.name || !editing.url) {
      setError('Name and URL are required')
      return
    }
    setError('')
    try {
      if (isNew) {
        await addPage(editing)
        toast.success(`Page "${editing.name}" added`)
      } else {
        await updatePage(originalName!, editing)
        toast.success(`Page "${editing.name}" updated`)
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
      await deletePage(deleteTarget.name)
      toast.success(`Page "${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
      await refresh()
    } catch (e) {
      toast.error((e as Error).message)
      setDeleteTarget(null)
    }
  }

  const startEdit = (page: PageConfig) => {
    setEditing({ ...page })
    setOriginalName(page.name)
    setIsNew(false)
    setError('')
  }

  const startNew = () => {
    setEditing(emptyPage())
    setOriginalName(null)
    setIsNew(true)
    setError('')
  }

  const runForPage = async (name: string, mode: 'baseline' | 'test') => {
    setLoadingPages((prev) => ({ ...prev, [name]: mode }))
    setError('')
    try {
      await dispatchRun(mode, { pages: [name] })
      await new Promise((r) => setTimeout(r, 15000))
      await refresh()
      setRefreshKey((k) => k + 1)
      toast.success(mode === 'baseline' ? 'Baseline captured' : 'Test completed')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoadingPages((prev) => ({ ...prev, [name]: null }))
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Pages</h1>
          <p className="text-sm text-muted-foreground">
            Pages under visual regression monitoring.
          </p>
        </div>
        <Button onClick={startNew}>
          <Plus /> Add Page
        </Button>
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4" /> {error}
        </div>
      )}

      {pages.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Plus className="size-6 text-primary" />
          </div>
          <p className="text-sm font-medium">No pages configured yet</p>
          <p className="text-sm text-muted-foreground">
            Click “Add Page” to start monitoring a URL.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[76px]">Preview</TableHead>
                <TableHead className="w-[160px]">Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="w-[90px]">Threshold</TableHead>
                <TableHead className="w-[300px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.map((p) => {
                const loading = loadingPages[p.name]
                return (
                  <TableRow key={p.name}>
                    <TableCell>
                      <PageThumbnail
                        name={p.name}
                        refreshKey={refreshKey}
                        onPreview={(url) => setPreview({ name: p.name, url })}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{p.name}</span>
                    </TableCell>
                    <TableCell>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="max-w-[320px] truncate text-primary hover:underline"
                        title={p.url}
                      >
                        {p.url}
                      </a>
                    </TableCell>
                    <TableCell>
                      {p.threshold != null ? (
                        <Badge variant="outline">{p.threshold}%</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={loading != null}
                          onClick={() => runForPage(p.name, 'baseline')}
                        >
                          {loading === 'baseline' ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Camera />
                          )}
                          {loading === 'baseline' ? 'Capturing…' : 'Baseline'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={loading != null}
                          onClick={() => runForPage(p.name, 'test')}
                        >
                          {loading === 'test' ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Play />
                          )}
                          {loading === 'test' ? 'Running…' : 'Test'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => window.location.href = `/ignore-zones?page=${encodeURIComponent(p.name)}`}
                          aria-label={`Ignore zones for ${p.name}`}
                          title="Ignore Zones"
                        >
                          <EyeOff />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => startEdit(p)} aria-label={`Edit ${p.name}`}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeleteTarget(p)}
                          aria-label={`Delete ${p.name}`}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={editing != null} onOpenChange={(o) => !o && closeEditor()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNew ? 'Add Page' : 'Edit Page'}</DialogTitle>
            <DialogDescription>
              {isNew
                ? 'Add a URL to start monitoring.'
                : 'Update the page details.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="page-name">Name</Label>
              <Input
                id="page-name"
                value={editing?.name ?? ''}
                onChange={(e) => setEditing((prev) => prev && { ...prev, name: e.target.value })}
                placeholder="homepage"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="page-url">URL</Label>
              <Input
                id="page-url"
                value={editing?.url ?? ''}
                onChange={(e) => setEditing((prev) => prev && { ...prev, url: e.target.value })}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="page-threshold">
                Threshold % <span className="font-normal text-muted-foreground">(optional — overrides global)</span>
              </Label>
              <Input
                id="page-threshold"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={editing?.threshold ?? ''}
                onChange={(e) =>
                  setEditing((prev) =>
                    prev
                      ? {
                          ...prev,
                          threshold: e.target.value
                            ? parseFloat(e.target.value)
                            : undefined,
                        }
                      : null
                  )
                }
                placeholder="e.g. 5"
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
            <Button onClick={handleSave}>{isNew ? 'Add' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-4 text-destructive" /> Delete page?
            </DialogTitle>
            <DialogDescription>
              “{deleteTarget?.name}” and its baselines / diffs will be removed. This
              action cannot be undone.
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
    {/* Preview dialog */}
      <Dialog open={preview != null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
            <DialogDescription>Baseline screenshot</DialogDescription>
          </DialogHeader>
          {preview && (
            <img
              src={preview.url}
              alt={`${preview.name} preview`}
              className="w-full rounded-md border"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}