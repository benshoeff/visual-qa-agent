import { useState, useEffect, useRef } from 'react'
import { getPages, dispatchRun, getRunStatus, isRunPending, runConclusion } from '../api'
import type { PageConfig, RunStatus } from '../api'

export default function TestRunner() {
  const [loading, setLoading] = useState<'baseline' | 'test' | null>(null)
  const [error, setError] = useState('')
  const [pages, setPages] = useState<PageConfig[]>([])
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set())
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null)
  const polling = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    getPages().then(setPages)
    getRunStatus().then((runs) => setRunStatus(runs[0] ?? null)).catch(() => {})
  }, [])

  useEffect(() => {
    return () => {
      if (polling.current) clearInterval(polling.current)
    }
  }, [])

  const stopPolling = () => {
    if (polling.current) {
      clearInterval(polling.current)
      polling.current = null
    }
  }

  const startPolling = () => {
    stopPolling()
    polling.current = setInterval(async () => {
      try {
        const runs = await getRunStatus()
        const latest = runs[0] ?? null
        setRunStatus(latest)
        if (latest && !isRunPending(latest)) {
          stopPolling()
          setLoading(null)
          getPages().then(setPages).catch(() => {})
        }
      } catch {
        stopPolling()
        setLoading(null)
      }
    }, 15000)
  }

  const allSelected = pages.length > 0 && selectedPages.size === pages.length

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedPages(new Set())
    } else {
      setSelectedPages(new Set(pages.map((p) => p.name)))
    }
  }

  const togglePage = (name: string) => {
    const next = new Set(selectedPages)
    if (next.has(name)) {
      next.delete(name)
    } else {
      next.add(name)
    }
    setSelectedPages(next)
  }

  const getSelectedNames = () => {
    const names = [...selectedPages]
    if (names.length === 0) return undefined
    return names
  }

  const handleRun = async (mode: 'baseline' | 'test') => {
    const names = getSelectedNames()
    if (!names || names.length === 0) {
      setError('Select at least one page to run')
      return
    }
    setError('')
    setLoading(mode)
    setRunStatus(null)
    try {
      await dispatchRun(mode, { pages: names })
      startPolling()
    } catch (e) {
      setError((e as Error).message)
      setLoading(null)
    }
  }

  const conclusion = runConclusion(runStatus)

  return (
    <div>
      <h1>Test Runner</h1>
      <div className="card-header-note">
        Runs are executed in GitHub Actions and will appear below once started.
      </div>

      <div className="section">
        <h2>Select Pages</h2>
        <div className="page-checklist">
          <label className="page-checkbox page-checkbox-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
            />
            <span>Select All ({pages.length})</span>
          </label>
          {pages.map((p) => (
            <label key={p.name} className="page-checkbox">
              <input
                type="checkbox"
                checked={selectedPages.has(p.name)}
                onChange={() => togglePage(p.name)}
              />
              <span className="page-checkbox-name">{p.name}</span>
              <span className="page-checkbox-url">{p.url}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="action-buttons">
          <button
            className="btn btn-primary"
            onClick={() => handleRun('baseline')}
            disabled={loading !== null || selectedPages.size === 0}
          >
            {loading === 'baseline' ? '⏳ Capturing...' : '📸 Capture Baseline'}
          </button>
          <button
            className="btn btn-accent"
            onClick={() => handleRun('test')}
            disabled={loading !== null || selectedPages.size === 0}
          >
            {loading === 'test' ? '⏳ Running...' : '🔍 Run Tests'}
          </button>
        </div>
        {selectedPages.size === 0 && (
          <div className="hint">Select at least one page to run</div>
        )}
        {loading && (
          <div className="loader">
            <div className="spinner" />
            <span>
              {loading === 'baseline' ? 'Capturing baseline screenshots...' : 'Running visual tests...'} This can take a few minutes.
            </span>
          </div>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {runStatus && (
        <div className="section">
          <h2>Latest Run</h2>
          <div className="result-card">
            <div>
              <strong>Run #{runStatus.runNumber}</strong> —{' '}
              {isRunPending(runStatus) ? (
                <span className="status-pending">⏳ Running…</span>
              ) : (
                <span className={conclusion === 'success' ? 'status-pass' : 'status-fail'}>
                  {conclusion === 'success' ? '✅ Completed successfully' : `❌ ${runStatus.conclusion ?? 'failed'}`}
                </span>
              )}
            </div>
            <div>
              <a href={runStatus.htmlUrl} target="_blank" rel="noreferrer" className="btn btn-sm">
                View Run Logs ↗
              </a>
              &nbsp;
              <a href="/reports" className="btn btn-sm">
                📋 View Reports
              </a>
            </div>
            {isRunPending(runStatus) && (
              <div className="hint">Polling for completion every 15s...</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
