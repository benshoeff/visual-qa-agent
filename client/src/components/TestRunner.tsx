import { useState, useEffect } from 'react'
import { runBaseline, runTest, getPages } from '../api'
import type { CompareResult, PageConfig } from '../api'

export default function TestRunner() {
  const [loading, setLoading] = useState<'baseline' | 'test' | null>(null)
  const [results, setResults] = useState<CompareResult[] | null>(null)
  const [error, setError] = useState('')
  const [pages, setPages] = useState<PageConfig[]>([])
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set())

  useEffect(() => {
    getPages().then(setPages)
  }, [])

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

  const handleBaseline = async () => {
    setLoading('baseline')
    setResults(null)
    setError('')
    try {
      await runBaseline(getSelectedNames())
      setResults(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(null)
    }
  }

  const handleTest = async () => {
    setLoading('test')
    setResults(null)
    setError('')
    try {
      const data = await runTest(getSelectedNames())
      setResults(data.results)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(null)
    }
  }

  const passed = results ? results.filter((r) => r.passed).length : 0
  const failed = results ? results.filter((r) => !r.passed).length : 0

  return (
    <div>
      <h1>Test Runner</h1>

      <div className="cards">
        <div className="card">
          <div className="card-body">
            <div className="card-value">{pages.length}</div>
            <div className="card-label">Pages configured</div>
          </div>
        </div>
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
            onClick={handleBaseline}
            disabled={loading !== null || selectedPages.size === 0}
          >
            {loading === 'baseline' ? '⏳ Capturing...' : '📸 Capture Baseline'}
          </button>
          <button
            className="btn btn-accent"
            onClick={handleTest}
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
              {loading === 'baseline' ? 'Capturing baseline screenshots...' : 'Running visual tests...'}
            </span>
          </div>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {results && (
        <div className="section">
          <div className="summary-bar">
            <span className="summary-pass">✅ Passed: {passed}</span>
            <span className="summary-fail">❌ Failed: {failed}</span>
            <span className="summary-total">📄 Total: {results.length}</span>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Page</th>
                <th>Status</th>
                <th>Diff %</th>
                <th>Diff Pixels</th>
                <th>Screenshots</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.pageName} className={r.passed ? 'row-pass' : 'row-fail'}>
                  <td>
                    <strong>{r.pageName}</strong>
                  </td>
                  <td>
                    {r.error ? (
                      <span className="status-error">⚠️ {r.error}</span>
                    ) : r.passed ? (
                      <span className="status-pass">✅ Pass</span>
                    ) : (
                      <span className="status-fail">❌ Fail</span>
                    )}
                  </td>
                  <td>{r.diffPercent}%</td>
                  <td>{r.diffPixels.toLocaleString()}</td>
                  <td>
                    <a
                      className="btn btn-sm"
                      href={`/reports?view=${r.pageName}`}
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
