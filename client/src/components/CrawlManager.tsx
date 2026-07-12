import { useState, useEffect, useCallback } from 'react'

interface CrawlConfig {
  maxPages: number
  maxDepth: number
  sameDomainOnly: boolean
  waitFor: 'networkidle' | 'domcontentloaded' | 'load'
}

interface DiscoveredPage {
  url: string
  name: string
  depth: number
  parentUrl?: string
}

interface CrawlResult {
  pageName: string
  url: string
  success: boolean
  baselinePath?: string
  error?: string
}

interface CrawlJob {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startUrl: string
  config: CrawlConfig
  progress: {
    current: number
    total: number
    currentUrl: string
  }
  discoveredPages: DiscoveredPage[]
  results: CrawlResult[]
  error?: string
  createdAt: string
  updatedAt: string
}

const API_BASE = '/api'

export default function CrawlManager() {
  const [url, setUrl] = useState('')
  const [config, setConfig] = useState<CrawlConfig>({
    maxPages: 50,
    maxDepth: 3,
    sameDomainOnly: true,
    waitFor: 'networkidle',
  })
  const [autoCapture, setAutoCapture] = useState(true)
  const [jobs, setJobs] = useState<CrawlJob[]>([])
  const [activeJob, setActiveJob] = useState<CrawlJob | null>(null)
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null)
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set())
  const [showAdvanced, setShowAdvanced] = useState(false)

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/crawl`)
      if (res.ok) {
        const data = await res.json()
        setJobs(data)
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err)
    }
  }, [])

  const fetchJob = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`${API_BASE}/crawl/${jobId}`)
      if (res.ok) {
        const job = await res.json()
        setActiveJob(job)
        return job
      }
    } catch (err) {
      console.error('Failed to fetch job:', err)
    }
    return null
  }, [])

  const startPolling = useCallback((jobId: string) => {
    if (pollInterval) clearInterval(pollInterval)
    const interval = setInterval(() => {
      fetchJob(jobId).then((job) => {
        if (job && ['completed', 'failed'].includes(job.status)) {
          if (pollInterval) clearInterval(pollInterval)
          setPollInterval(null)
          fetchJobs()
        }
      })
    }, 2000)
    setPollInterval(interval)
  }, [pollInterval, fetchJob, fetchJobs])

  const handleStartCrawl = async () => {
    if (!url.trim()) return
    try {
      const res = await fetch(`${API_BASE}/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), config, autoCaptureBaseline: autoCapture }),
      })
      if (res.ok) {
        const { jobId } = await res.json()
        setUrl('')
        await fetchJob(jobId)
        startPolling(jobId)
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to start crawl')
      }
    } catch (err) {
      alert('Failed to start crawl')
    }
  }

  const handleConfirmBaselines = async () => {
    if (!activeJob || selectedPages.size === 0) return
    try {
      const res = await fetch(`${API_BASE}/crawl/${activeJob.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageNames: Array.from(selectedPages) }),
      })
      if (res.ok) {
        const result = await res.json()
        alert(`Added ${result.added} pages, skipped ${result.skipped}`)
        setSelectedPages(new Set())
        fetchJobs()
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to confirm baselines')
      }
    } catch (err) {
      alert('Failed to confirm baselines')
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
      const allNames = activeJob.discoveredPages.map(p => p.name)
      if (selectedPages.size === allNames.length) {
        setSelectedPages(new Set())
      } else {
        setSelectedPages(new Set(allNames))
      }
    }
  }

  useEffect(() => {
    fetchJobs()
    return () => {
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [fetchJobs, pollInterval])

  const currentJob = activeJob || jobs[0]

  return (
    <div className="crawl-manager">
      <header className="page-header">
        <h1>🔍 Site Crawler</h1>
        <p>Discover pages and capture baselines automatically</p>
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

        <button className="btn btn-primary" onClick={handleStartCrawl} disabled={!url.trim()}>
          {autoCapture ? '🔍 Crawl & Capture Baselines' : '🔍 Crawl Only'}
        </button>
      </section>

      {currentJob && (
        <section className="card crawl-progress">
          <h2>Crawl Progress</h2>
          <div className="job-info">
            <span><strong>URL:</strong> {currentJob.startUrl}</span>
            <span className={`status-badge ${currentJob.status}`}>{currentJob.status.toUpperCase()}</span>
          </div>

          {currentJob.status === 'running' && (
            <div className="progress-bar-container">
              <div
                className="progress-bar"
                style={{ width: `${currentJob.progress.total > 0 ? (currentJob.progress.current / currentJob.progress.total) * 100 : 0}%` }}
              ></div>
            </div>
          )}
          {currentJob.status === 'running' && (
            <p className="progress-text">
              {currentJob.progress.phase === 'discovering' ? '🔍 Discovering pages...' : '📸 Capturing baselines...'}
              {currentJob.progress.currentUrl && (
                <>
                  <br />Current: {currentJob.progress.currentUrl}
                </>
              )}
            </p>
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
                {currentJob.discoveredPages.map((page) => {
                  const result = currentJob.results.find(r => r.pageName === page.name)
                  const isSuccess = result?.success
                  const isError = result?.success === false
                  const alreadyExists = result?.error?.includes('Already exists')
                  return (
                    <div key={page.name} className={`page-card ${isSuccess ? 'success' : ''} ${isError ? 'error' : ''} ${alreadyExists ? 'exists' : ''}`}>
                      <label className="page-checkbox-card">
                        <input
                          type="checkbox"
                          checked={selectedPages.has(page.name)}
                          onChange={() => togglePage(page.name)}
                          disabled={alreadyExists}
                        />
                        <span className="page-name">{page.name}</span>
                        {page.depth > 0 && <span className="depth-badge">Depth {page.depth}</span>}
                      </label>
                      <p className="page-url">{page.url}</p>
                      {isSuccess && <span className="result-badge success">✅ Baseline captured</span>}
                      {alreadyExists && <span className="result-badge exists">⚠️ Already in config</span>}
                      {isError && <span className="result-badge error">❌ {result.error}</span>}
                      {currentJob.status === 'running' && currentJob.progress.currentUrl === page.url && (
                        <span className="result-badge processing">⏳ Processing...</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {currentJob.status === 'failed' && (
            <div className="error-message">
              <strong>Error:</strong> {currentJob.error || 'Unknown error'}
            </div>
          )}

          {currentJob.status === 'completed' && currentJob.discoveredPages.length === 0 && (
            <p className="no-results">No pages discovered. Try adjusting crawl settings.</p>
          )}
        </section>
      )}

      <section className="card job-history">
        <h2>Recent Crawl Jobs</h2>
        {jobs.length === 0 ? (
          <p className="no-jobs">No crawl jobs yet</p>
        ) : (
          <table className="jobs-table">
            <thead>
              <tr>
                <th>URL</th>
                <th>Status</th>
                <th>Pages Found</th>
                <th>Baselines Captured</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {jobs.slice(0, 10).map((job) => (
                <tr key={job.id} onClick={() => { fetchJob(job.id); startPolling(job.id); }}>
                  <td title={job.startUrl}>{job.startUrl}</td>
                  <td><span className={`status-badge ${job.status}`}>{job.status}</span></td>
                  <td>{job.discoveredPages.length}</td>
                  <td>{job.results.filter(r => r.success).length}</td>
                  <td>{new Date(job.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}