import { useEffect, useState } from 'react'
import { getPages, addPage, updatePage, deletePage, runPageBaseline, runPageTest, getImageUrl } from '../api'
import type { PageConfig, CompareResult } from '../api'

const emptyPage = (): PageConfig => ({
  name: '',
  url: '',
})

export default function PagesManager() {
  const [pages, setPages] = useState<PageConfig[]>([])
  const [editing, setEditing] = useState<PageConfig | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [error, setError] = useState('')
  const [loadingPages, setLoadingPages] = useState<Record<string, 'baseline' | 'test' | null>>({})
  const [pageResults, setPageResults] = useState<Record<string, CompareResult | null>>({})
  const [refreshKey, setRefreshKey] = useState(0)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [originalName, setOriginalName] = useState<string | null>(null)

  useEffect(() => {
    getPages().then(setPages).catch((e) => setError(e.message))
  }, [])

  const refresh = () => getPages().then(setPages)

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
      } else {
        await updatePage(originalName!, editing)
      }
      setEditing(null)
      setOriginalName(null)
      setIsNew(false)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete page "${name}"?`)) return
    try {
      await deletePage(name)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
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

  const handlePageBaseline = async (name: string) => {
    setLoadingPages((prev) => ({ ...prev, [name]: 'baseline' }))
    setError('')
    try {
      await runPageBaseline(name)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingPages((prev) => ({ ...prev, [name]: null }))
    }
  }

  const handlePageTest = async (name: string) => {
    setLoadingPages((prev) => ({ ...prev, [name]: 'test' }))
    setError('')
    try {
      const { result } = await runPageTest(name)
      setPageResults((prev) => ({ ...prev, [name]: result }))
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingPages((prev) => ({ ...prev, [name]: null }))
    }
  }

  return (
    <div>
      <div className="section-header">
        <h1>Pages</h1>
        <button className="btn btn-primary" onClick={startNew}>
          + Add Page
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {editing && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{isNew ? 'Add Page' : 'Edit Page'}</h2>
              <button className="modal-x" onClick={() => { setEditing(null); setOriginalName(null); setIsNew(false); setError('') }}>&times;</button>
            </div>
            <label>
              Name
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="homepage"
              />
            </label>
            <label>
              URL
              <input
                value={editing.url}
                onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                placeholder="https://example.com"
              />
            </label>
            <label>
              Threshold % (optional — overrides global)
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={editing.threshold ?? ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    threshold: e.target.value ? parseFloat(e.target.value) : undefined,
                  })
                }
                placeholder="e.g. 5"
              />
            </label>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={handleSave}>
                {isNew ? 'Add' : 'Save'}
              </button>
              <button className="btn btn-secondary" onClick={() => { setEditing(null); setOriginalName(null); setIsNew(false); setError('') }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="wrapper">
      <table className="table pages-table">
        <thead>
          <tr>
            <th>Preview</th>
            <th>Name</th>
            <th>URL</th>
            <th>Threshold</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pages.length === 0 && (
            <tr>
                <td colSpan={5} className="empty">
                No pages configured yet. Click "Add Page" to get started.
              </td>
            </tr>
          )}
          {pages.map((p) => {
            const loading = loadingPages[p.name]
            const result = pageResults[p.name]
            const rowClass = result
              ? result.error
                ? 'row-error'
                : result.passed
                  ? 'row-pass'
                  : 'row-fail'
              : ''
            return (
              <tr key={p.name} className={rowClass}>
                <td>
                  <img
                    className="page-thumbnail"
                    src={`${getImageUrl('baseline', p.name)}?t=${refreshKey}`}
                    alt={p.name}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setPreviewImage(getImageUrl('baseline', p.name))}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none'
                    }}
                  />
                </td>
                <td>
                  <strong>{p.name}</strong>
                  {result && !result.error && (
                    <span className={`page-status ${result.passed ? 'status-pass' : 'status-fail'}`}>
                      {result.passed ? ' ✓' : ` ✗ ${result.diffPercent}%`}
                    </span>
                  )}
                  {result?.error && (
                    <span className="page-status status-error"> ⚠</span>
                  )}
                </td>
                <td className="url-cell">
                  <span className="url-tooltip" data-url={p.url}>
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {p.url}
                    </a>
                  </span>
                </td>
                <td>{p.threshold != null ? `${p.threshold}%` : '—'}</td>
                <td className="actions-cell">
                  <div className="actions-flex">
                    <button
                    className="btn btn-sm btn-accent"
                    disabled={loading != null}
                    onClick={() => handlePageBaseline(p.name)}
                  >
                    {loading === 'baseline' ? <span className="btn-spinner" /> : null}
                    {loading === 'baseline' ? 'Capturing...' : 'Capture Baseline'}
                  </button>
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={loading != null}
                    onClick={() => handlePageTest(p.name)}
                  >
                    {loading === 'test' ? <span className="btn-spinner" /> : null}
                    {loading === 'test' ? 'Running...' : 'Run Test'}
                  </button>
                  <button className="btn btn-sm" onClick={() => startEdit(p)}>
                    Edit
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.name)}>
                    Delete
                  </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>

      {Object.values(pageResults).some((r) => r && !r.error && !r.passed) && (
        <div className="section">
          <h2>Failed Pages Detail</h2>
          {Object.entries(pageResults)
            .filter(([, r]) => r && !r.error && !r.passed)
            .map(([name, r]) => (
              <div key={name} className="result-card result-card-fail">
                <strong>{name}</strong> — Diff: {r!.diffPercent}% ({r!.diffPixels} px)
              </div>
            ))}
        </div>
      )}

      {previewImage && (
        <div className="modal-overlay" onClick={() => setPreviewImage(null)}>
          <div className="lightbox" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setPreviewImage(null)}>&times;</button>
            <img src={previewImage} alt="Preview" className="lightbox-image" />
          </div>
        </div>
      )}
    </div>
  )
}