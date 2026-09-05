import { useCallback, useEffect, useState } from 'react'
import { EyeOff, Globe, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getPages, getIgnoreZones, getIgnoreZonesAll, getImageUrl } from '../api'
import type { IgnoreZone, PageConfig } from '../api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import IgnoreZoneEditor from './IgnoreZoneEditor'

const urlPage = new URLSearchParams(window.location.search).get('page')

export default function IgnoreZonesPage() {
  const [pages, setPages] = useState<PageConfig[]>([])
  const [selectedPage, setSelectedPage] = useState<string>(urlPage ?? '__global__')
  const [zones, setZones] = useState<IgnoreZone[]>([])
  const [allData, setAllData] = useState<Record<string, IgnoreZone[]>>({})
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadPages = useCallback(async () => {
    try {
      const p = await getPages()
      setPages(p)
    } catch {
      // ignore
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (selectedPage === '__global__') {
        const data = await getIgnoreZonesAll()
        setZones(data.global)
        setAllData(data.pages)
      } else {
        const z = await getIgnoreZones(selectedPage)
        setZones(z)
      }
    } catch (err) {
      toast.error(`Failed to load: ${(err as Error).message}`)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPage, refreshKey])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPages()
  }, [loadPages])

  // When the list of pages loads, fall back to the first page if no explicit
  // page is selected, so the baseline image is available for the editor.
  useEffect(() => {
    if (!urlPage && selectedPage === '__global__' && pages.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPage(pages[0].name)
    }
  }, [pages, selectedPage])

  // Reload zones whenever the selected page or refresh key changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [loadData])

  const baselineUrl = selectedPage !== '__global__'
    ? `${getImageUrl('baseline', selectedPage)}&t=${refreshKey}`
    : ''

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <EyeOff className="size-6" />
            Ignore Zones
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define areas to ignore during visual comparison — reduce false positives from dynamic content.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Select value={selectedPage} onValueChange={setSelectedPage}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__global__">
              <div className="flex items-center gap-2">
                <Globe className="size-4" />
                Global (all pages)
              </div>
            </SelectItem>
            {pages.map((p) => (
              <SelectItem key={p.name} value={p.name}>
                <div className="flex items-center gap-2">
                  <FileText className="size-4" />
                  {p.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={() => setEditorOpen(true)}>
          <EyeOff className="mr-2 size-4" />
          Edit Zones
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : selectedPage === '__global__' ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="size-4" />
                Global Ignore Zones ({zones.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {zones.length === 0 ? (
                <p className="text-sm text-muted-foreground">No global ignore zones defined.</p>
              ) : (
                <div className="space-y-2">
                  {zones.map((z) => (
                    <div key={z.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                      <span className="flex-1 truncate">{z.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {z.type === 'bounding-box' ? 'Bounding Box' : 'Selector'}
                      </Badge>
                      <Badge variant={z.enabled ? 'default' : 'secondary'} className="text-[10px]">
                        {z.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {Object.keys(allData).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Per-Page Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(allData)
                    .filter(([, z]) => z.length > 0)
                    .map(([pageName, pageZones]) => (
                      <div key={pageName} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                        <FileText className="size-4 shrink-0" />
                        <span className="flex-1">{pageName}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {pageZones.length} zone{pageZones.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="size-4" />
                {selectedPage} — Ignore Zones ({zones.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {zones.length === 0 ? (
                <p className="text-sm text-muted-foreground">No ignore zones for this page.</p>
              ) : (
                <div className="space-y-2">
                  {zones.map((z) => (
                    <div key={z.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                      <span className="flex-1 truncate">{z.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {z.type === 'bounding-box' ? 'Bounding Box' : z.selector}
                      </Badge>
                      <Badge variant={z.enabled ? 'default' : 'secondary'} className="text-[10px]">
                        {z.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Baseline Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <img
                src={baselineUrl}
                alt={selectedPage}
                className="w-full rounded-md border"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}

      <Separator />

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedPage === '__global__' ? 'Global' : selectedPage} — Ignore Zone Editor
            </DialogTitle>
          </DialogHeader>
          {editorOpen && (
            <IgnoreZoneEditor
              pageName={selectedPage === '__global__' ? null : selectedPage}
              baselineUrl={baselineUrl}
              initialZones={zones}
              onSaved={() => {
                setRefreshKey((k) => k + 1)
                setEditorOpen(false)
              }}
              onClose={() => setEditorOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
