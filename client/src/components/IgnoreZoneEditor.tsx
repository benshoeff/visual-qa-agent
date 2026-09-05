import { useRef, useState, useCallback, useEffect } from 'react'
import { EyeOff, Trash2, Plus, Pencil, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createIgnoreZone,
  updateIgnoreZone,
  deleteIgnoreZone,
} from '../api'
import type { IgnoreZone } from '../api'

interface Props {
  pageName: string | null
  baselineUrl: string
  initialZones: IgnoreZone[]
  onSaved: () => void
  onClose: () => void
}

interface DrawState {
  drawing: boolean
  startX: number
  startY: number
  endX: number
  endY: number
}

const TEST_ATTRS = ['data-testid', 'data-cy', 'data-test', 'data-e2e', 'id'] as const
type TestAttr = (typeof TEST_ATTRS)[number]

export default function IgnoreZoneEditor({ pageName, baselineUrl, initialZones, onSaved, onClose }: Props) {
  const hasBaseline = !!baselineUrl
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [zones, setZones] = useState<IgnoreZone[]>(initialZones)
  const [draw, setDraw] = useState<DrawState>({ drawing: false, startX: 0, startY: 0, endX: 0, endY: 0 })
  const [selectorInput, setSelectorInput] = useState('')
  const [selectorName, setSelectorName] = useState('')
  const [testAttr, setTestAttr] = useState<TestAttr>('data-testid')
  const [testAttrValue, setTestAttrValue] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [saving, setSaving] = useState(false)
  const [imgSize, setImgSize] = useState<{ w: number; h: number; natW: number; natH: number } | null>(null)

  const toImageCoords = useCallback(
    (clientX: number, clientY: number) => {
      if (!imgRef.current) return { x: 0, y: 0 }
      const rect = imgRef.current.getBoundingClientRect()
      const x = Math.round(((clientX - rect.left) / rect.width) * (imgSize?.natW ?? rect.width))
      const y = Math.round(((clientY - rect.top) / rect.height) * (imgSize?.natH ?? rect.height))
      return { x: Math.max(0, x), y: Math.max(0, y) }
    },
    [imgSize]
  )

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      const { x, y } = toImageCoords(e.clientX, e.clientY)
      setDraw({ drawing: true, startX: x, startY: y, endX: x, endY: y })
    },
    [toImageCoords]
  )

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!draw.drawing) return
      const { x, y } = toImageCoords(e.clientX, e.clientY)
      setDraw((prev) => ({ ...prev, endX: x, endY: y }))
    },
    [draw.drawing, toImageCoords]
  )

  const onMouseUp = useCallback(() => {
    if (!draw.drawing) return
    setDraw((prev) => {
      const x = Math.min(prev.startX, prev.endX)
      const y = Math.min(prev.startY, prev.endY)
      const w = Math.abs(prev.endX - prev.startX)
      const h = Math.abs(prev.endY - prev.startY)
      if (w > 5 && h > 5) {
        const newZone: IgnoreZone = {
          id: `temp-${Date.now()}`,
          name: `Zone ${zones.length + 1}`,
          type: 'bounding-box',
          x,
          y,
          width: w,
          height: h,
          enabled: true,
        }
        setZones((prev) => [...prev, newZone])
      }
      return { ...prev, drawing: false }
    })
  }, [draw.drawing, zones.length])

  useEffect(() => {
    if (!draw.drawing) return
    const onUp = () => setDraw((prev) => ({ ...prev, drawing: false }))
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [draw.drawing])

  const handleAddSelector = async () => {
    const sel = selectorInput.trim()
    if (!sel) return
    const newZone: IgnoreZone = {
      id: `temp-${Date.now()}`,
      name: selectorName.trim() || `Selector: ${sel}`,
      type: 'selector',
      selector: sel,
      enabled: true,
    }
    setZones((prev) => [...prev, newZone])
    setSelectorInput('')
    setSelectorName('')
  }

  const handleAddTestAttr = () => {
    const val = testAttrValue.trim()
    if (!val) return
    const escaped = val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const sel = testAttr === 'id' ? `#${escaped}` : `[${testAttr}="${escaped}"]`
    const newZone: IgnoreZone = {
      id: `temp-${Date.now()}`,
      name: sel,
      type: 'selector',
      selector: sel,
      enabled: true,
    }
    setZones((prev) => [...prev, newZone])
    setTestAttrValue('')
  }

  const handleToggle = (id: string) => {
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, enabled: !z.enabled } : z)))
  }

  const handleDelete = (id: string) => {
    setZones((prev) => prev.filter((z) => z.id !== id))
  }

  const handleRename = (id: string) => {
    if (editingId === id) {
      setZones((prev) => prev.map((z) => (z.id === id ? { ...z, name: editingName } : z)))
      setEditingId(null)
    } else {
      setEditingName(zones.find((z) => z.id === id)?.name ?? '')
      setEditingId(id)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Delete removed zones
      for (const old of initialZones) {
        if (!zones.find((z) => z.id === old.id)) {
          await deleteIgnoreZone(old.id, pageName ?? undefined)
        }
      }
      // Create new zones and update existing
      for (const zone of zones) {
        if (zone.id.startsWith('temp-')) {
          const { id: _tmpId, ...rest } = zone
          void _tmpId
          await createIgnoreZone({ ...rest, pageName: pageName ?? undefined })
        } else {
          await updateIgnoreZone(zone.id, zone, pageName ?? undefined)
        }
      }
      toast.success('Ignore zones saved')
      onSaved()
    } catch (err) {
      toast.error(`Failed to save: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  // Compute overlay rect for drawing preview
  const drawRect = draw.drawing
    ? {
        x: Math.min(draw.startX, draw.endX),
        y: Math.min(draw.startY, draw.endY),
        w: Math.abs(draw.endX - draw.startX),
        h: Math.abs(draw.endY - draw.startY),
      }
    : null

  const toDisplayRect = (zone: { x?: number; y?: number; width?: number; height?: number }) => {
    if (!imgSize) return null
    const scaleX = imgSize.w / imgSize.natW
    const scaleY = imgSize.h / imgSize.natH
    return {
      left: (zone.x ?? 0) * scaleX,
      top: (zone.y ?? 0) * scaleY,
      width: (zone.width ?? 0) * scaleX,
      height: (zone.height ?? 0) * scaleY,
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Canvas */}
      <div className="flex-1 min-w-0">
        {!hasBaseline && (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed bg-muted text-center text-sm text-muted-foreground">
            <div className="px-6">
              <EyeOff className="mx-auto mb-2 size-8 opacity-50" />
              No baseline image available.
              <br />
              Use a Test ID or CSS selector below — these work globally.
            </div>
          </div>
        )}
        {hasBaseline && (
        <>
        <div
          ref={containerRef}
          className={cn(
            'relative overflow-hidden rounded-xl border bg-muted select-none',
            draw.drawing ? 'cursor-crosshair' : 'cursor-default'
          )}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
        >
          <img
            ref={imgRef}
            src={baselineUrl}
            alt="Baseline"
            draggable={false}
            className="block h-auto w-full"
            onLoad={() => {
              const img = imgRef.current
              if (img) {
                setImgSize({
                  w: img.clientWidth,
                  h: img.clientHeight,
                  natW: img.naturalWidth,
                  natH: img.naturalHeight,
                })
              }
            }}
          />

          {/* Existing zone overlays */}
          {zones
            .filter((z) => z.type === 'bounding-box' && z.x != null && z.y != null && z.width != null && z.height != null)
            .map((z) => {
              const r = toDisplayRect(z)
              if (!r) return null
              return (
                <div
                  key={z.id}
                  className={cn(
                    'absolute border-2 border-dashed rounded-sm pointer-events-none',
                    z.enabled
                      ? 'bg-yellow-400/25 border-yellow-500'
                      : 'bg-gray-400/15 border-gray-400 border-dotted'
                  )}
                  style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
                >
                  <span className="absolute top-0.5 left-1 text-[10px] font-medium text-yellow-700 truncate max-w-full">
                    {z.name}
                  </span>
                </div>
              )
            })}

          {/* Drawing preview */}
          {drawRect && imgSize && (() => {
            const scaleX = imgSize.w / imgSize.natW
            const scaleY = imgSize.h / imgSize.natH
            return (
              <div
                className="absolute border-2 border-dashed border-blue-500 bg-blue-400/20 pointer-events-none rounded-sm"
                style={{
                  left: drawRect.x * scaleX,
                  top: drawRect.y * scaleY,
                  width: drawRect.w * scaleX,
                  height: drawRect.h * scaleY,
                }}
              />
            )
          })()}
        </div>
        <p className="mt-2 text-xs text-muted-foreground text-center">
          Drag on the image to draw a bounding box ignore zone
        </p>
        </>
        )}
      </div>

      {/* Sidebar */}
      <div className="w-full lg:w-80 shrink-0 space-y-4">
        {/* Zone list */}
        <div className="rounded-lg border p-3 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <EyeOff className="size-4" />
            Ignore Zones ({zones.length})
          </h3>

          {zones.length === 0 && (
            <p className="text-xs text-muted-foreground">No zones defined yet.</p>
          )}

          {zones.map((z) => (
            <div
              key={z.id}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
            >
              <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                {editingId === z.id ? (
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRename(z.id)}
                    className="h-6 text-xs"
                    autoFocus
                  />
                ) : (
                  <span className="truncate block text-xs">{z.name}</span>
                )}
                <Badge variant="outline" className="text-[10px] mt-0.5">
                  {z.type === 'bounding-box' ? 'Bounding Box' : 'Selector'}
                </Badge>
              </div>
              <Switch
                checked={z.enabled}
                onCheckedChange={() => handleToggle(z.id)}
                className="scale-75"
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => handleRename(z.id)}
              >
                <Pencil className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-destructive"
                onClick={() => handleDelete(z.id)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>

        {/* Add by Test ID */}
        <div className="rounded-lg border p-3 space-y-2">
          <h3 className="text-sm font-semibold">Add by Test ID</h3>
          <p className="text-xs text-muted-foreground">
            Target an element by the attribute you use in Cypress / Playwright.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">Attribute</Label>
            <Select
              value={testAttr}
              onValueChange={(v) => setTestAttr(v as TestAttr)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEST_ATTRS.map((a) => (
                  <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Value</Label>
            <Input
              value={testAttrValue}
              onChange={(e) => setTestAttrValue(e.target.value)}
              placeholder="e.g. page-title"
              className="h-8 text-xs font-mono"
              onKeyDown={(e) => e.key === 'Enter' && handleAddTestAttr()}
            />
          </div>
          {testAttrValue.trim() && (
            <div className="rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] text-muted-foreground truncate">
              {testAttr === 'id'
                ? `#${testAttrValue.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"')}`
                : `[${testAttr}="${testAttrValue.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`}
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={handleAddTestAttr}
            disabled={!testAttrValue.trim()}
          >
            <Plus className="mr-1 size-3" />
            Add Test ID Zone
          </Button>
        </div>

        {/* Add by selector */}
        <div className="rounded-lg border p-3 space-y-2">
          <h3 className="text-sm font-semibold">Add by CSS Selector</h3>
          <div className="space-y-1.5">
            <Label className="text-xs">Name (optional)</Label>
            <Input
              value={selectorName}
              onChange={(e) => setSelectorName(e.target.value)}
              placeholder="e.g. Ad Banner"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">CSS Selector</Label>
            <Input
              value={selectorInput}
              onChange={(e) => setSelectorInput(e.target.value)}
              placeholder={'e.g. [data-testid="page-title"], .ad-banner'}
              className="h-8 text-xs"
              onKeyDown={(e) => e.key === 'Enter' && handleAddSelector()}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={handleAddSelector}
            disabled={!selectorInput.trim()}
          >
            <Plus className="mr-1 size-3" />
            Add Selector Zone
          </Button>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Zones'}
          </Button>
        </div>
      </div>
    </div>
  )
}
