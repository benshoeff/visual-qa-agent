import { useState, useEffect, useRef } from 'react'
import { startCrawl, getCrawlJob, confirmBaselines } from '../api'
import type { CrawlJob } from '../api'

interface CrawlConfigInput {
  maxPages: number
  maxDepth: number
  sameDomainOnly: boolean
  waitFor: 'networkidle' | 'domcontentloaded' | 'load'
}

export default function CrawlManager() {
  const [url, setUrl] = useState('')
  const [config, setConfig] = useState<CrawlConfigInput>({
    maxPages: 50,
    maxDepth: 3,
    sameDomainOnly: true,
    waitFor: 'networkidle',
  })
  const [autoCapture, setAutoCapture] = useState(true)
  const [starting, setStarting] = useState(false)
  const [activeJob, setActiveJob] = useState<CrawlJob | null>(null)
  const [polling, setPolling] = useState(false)
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set())
  const [showAdvanced, setShowAdvanced] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
      setPolling(false)
    }
  }

  const startPolling = (jobId: string, alreadyDone = false) => {
    if (alreadyDone) return
    setPolling(true)
    pollRef.current = setInterval(async () => {
      try {
        const job = await getCrawlJob(jobId)
        if (job) {
          setActiveJob(job)
          if (job.status === 'completed' || job.status === 'failed') {
            stopPolling()
          }
        }
      } catch {
        stopPolling()
      }
    }, 15000)
  }

  const handleStartCrawl = async () => {
    if (!url.trim()) return
    setStarting(true)
    try {
      const { jobId } = await startCrawl(url.trim(), {
        maxPages: config.maxPages,
        maxDepth: config.maxDepth,
        sameDomainOnly: config.sameDomainOnly,
        waitFor: config.waitFor,
      })
      setUrl('')
      // Initial optimistic job entry while Actions starts
      setActiveJob({
        id: jobId,
        status: 'pending',
        startUrl: url.trim(),
        discoveredPages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      setSelectedPages(new Set())
      startPolling(jobId)
    } catch (err) {
      alert((err as Error).message || 'Failed to start crawl')
    } finally {
      setStarting(false)
    }
  }

  const handleConfirmBaselines = async () => {
    if (!activeJob || selectedPages.size === 0) return
    try {
      const result = await confirmBaselines(activeJob.id, Array.from(selectedPages))
      alert(`Added ${result.added} pages, skipped ${result.skipped}`)
      setSelectedPages(new Set())
    } catch (err) {
      alert((err as Error).message || 'Failed to confirm baselines')
    }
  }

  const togglePage = (name: string) => {
    const newSet = new Set(selectedPages)
    if (newSet.has(name)) newSet.delete(name)
    else newSet.add(name)
    setSelectedPages(newSet)
  }

  const toggleAllPages = () => {
    if (activeJob) {
      const allNames = activeJob.discoveredPages.map((p) => p.name)
      if (selectedPages.size === allNames.length) {
        setSelectedPages(new Set())
      } else {
        setSelectedPages(new Set(allNames))
      }
    }
  }

  const currentJob = activeJob

  return (
    <div className="crawl-manager">
      <header className="page-header">
        <h1>🔍 Site Crawler</h1>
        <p>Discover pages and capture baselines automatically (runs in GitHub Actions)</p>
      </header>

      <section className="card crawl-form">
        <h2>Start New Crawl</h2>
        <div className="form-group">
          <label>Website URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            required
          />
        </div>

        {showAdvanced && (
          <div className="advanced-config">
            <div className="form-row">
              <div className="form-group">
                <label>Max Pages</label>
                <input
                  type="number"
                  value={config.maxPages}
                  onChange={(e) => setConfig({ ...config, maxPages: parseInt(e.target.value) })}
                  min={1}
                  max={500}
                />
              </div>
              <div className="form-group">
                <label>Max Depth</label>
                <input
                  type="number"
                  value={config.maxDepth}
                  onChange={(e) => setConfig({ ...config, maxDepth: parseInt(e.target.value) })}
                  min={1}
                  max={10}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Wait Strategy</label>
                <select
                  value={config.waitFor}
                  onChange={(e) => setConfig({ ...config, waitFor: e.target.value as any })}
                >
                  <option value="networkidle">Network Idle</option>
                  <option value="domcontentloaded">DOM Content Loaded</option>
                  <option value="load">Load</option>
                </select>
              </div>
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={config.sameDomainOnly}
                    onChange={(e) => setConfig({ ...config, sameDomainOnly: e.target.checked })}
                  />
                  Same domain only
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="form-row checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={autoCapture}
              onChange={(e) => setAutoCapture(e.target.checked)}
            />
            Auto-capture baselines after crawl
          </label>
          <label>
            <input
              type="checkbox"
              checked={showAdvanced}
              onChange={(e) => setShowAdvanced(e.target.checked)}
            />
            Advanced settings
          </label>
        </div>

        <button className="btn btn-primary" onClick={handleStartCrawl} disabled={!url.trim() || starting || polling}>
          {starting || polling
            ? '⏳ Crawl running in GitHub Actions...'
            : autoCapture
              ? '🔍 Crawl & Capture Baselines'
              : '🔍 Crawl Only'}
        </button>
      </section>

      {currentJob && (
        <section className="card crawl-progress">
          <h2>Crawl Progress</h2>
          <div className="job-info">
            <span><strong>URL:</strong> {currentJob.startUrl}</span>
            <span className={`status-badge ${currentJob.status}`}>{currentJob.status.toUpperCase()}</span>
          </div>

          {(currentJob.status === 'pending' || currentJob.status === 'running') && (
            <div className="loader">
              <div className="spinner" />
              <span>Crawling and capturing... This runs in GitHub Actions and can take several minutes.</span>
            </div>
          )}

          {currentJob.status === 'failed' && currentJob.error && (
            <div className="error-message">
              <strong>Error:</strong> {currentJob.error}
            </div>
          )}

          {currentJob.status === 'completed' && currentJob.discoveredPages.length > 0 && (
            <div className="results-section">
              <h3>Discovered Pages ({currentJob.discoveredPages.length})</h3>
              <div className="results-actions">
                <button className="btn btn-secondary" onClick={toggleAllPages}>
                  {selectedPages.size === currentJob.discoveredPages.length ? 'Deselect All' : 'Select All'}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleConfirmBaselines}
                  disabled={selectedPages.size === 0}
                >
                  ✅ Add {selectedPages.size} to Config
                </button>
              </div>
              <div className="pages-grid">
                {currentJob.discoveredPages.map((page) => (
                  <div key={page.name} className="page-card">
                    <label className="page-checkbox-card">
                      <input
                        type="checkbox"
                        checked={selectedPages.has(page.name)}
                        onChange={() => togglePage(page.name)}
                      />
                      <span className="page-name">{page.name}</span>
                      {page.depth > 0 && <span className="depth-badge">Depth {page.depth}</span>}
                    </label>
                    <p className="page-url">{page.url}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentJob.status === 'completed' && currentJob.discoveredPages.length === 0 && (
            <p className="no-results">No pages discovered. Try adjusting crawl settings.</p>
          )}
        </section>
      )}
    </div>
  )
}
