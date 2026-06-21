import { useEffect, useRef, useState } from 'react'
import { getConfig, getReports, updateConfig } from '../api'
import type { Config } from '../api'

export default function Dashboard() {
  const [config, setConfig] = useState<Config | null>(null)
  const [reportCount, setReportCount] = useState(0)
  const [editingThreshold, setEditingThreshold] = useState(false)
  const [thresholdInput, setThresholdInput] = useState('')
  const sliderRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getConfig().then(setConfig)
    getReports().then((r) => setReportCount(r.length))
  }, [])

  useEffect(() => {
    if (editingThreshold && sliderRef.current) {
      sliderRef.current.focus()
    }
  }, [editingThreshold])

  const startEditThreshold = () => {
    if (!config) return
    setThresholdInput(String(config.threshold))
    setEditingThreshold(true)
  }

  const saveThreshold = async () => {
    const val = parseFloat(thresholdInput)
    if (!isNaN(val) && val >= 0 && val <= 100) {
      try {
        const updated = await updateConfig({ threshold: val })
        setConfig(updated)
      } catch {
        // revert on failure
      }
    }
    setEditingThreshold(false)
  }

  const cancelEdit = () => {
    setEditingThreshold(false)
  }

  const lastReport = reportCount > 0 ? `${reportCount} reports` : 'No reports yet'

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="cards">
        <div className="card">
          <div className="card-icon">📄</div>
          <div className="card-body">
            <div className="card-value">{config?.pages.length ?? '...'}</div>
            <div className="card-label">Pages to test</div>
          </div>
        </div>
        <div className="card">
          <div className="card-icon">📐</div>
          <div className="card-body">
            <div className="card-value">
              {config ? `${config.viewport.width}×${config.viewport.height}` : '...'}
            </div>
            <div className="card-label">Viewport</div>
          </div>
        </div>
        <div
          className="card card-editable"
          onClick={editingThreshold ? undefined : startEditThreshold}
          onKeyDown={e => { if (!editingThreshold && (e.key === 'Enter' || e.key === ' ')) startEditThreshold() }}
          tabIndex={0}
          role="button"
          aria-label="Edit threshold"
        >
          <div className="card-icon">🎯</div>
          <div className="card-body">
            {editingThreshold ? (
              <div className="threshold-edit" onClick={e => e.stopPropagation()}>
                <input
                  ref={sliderRef}
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={thresholdInput}
                  onChange={e => setThresholdInput(e.target.value)}
                  onMouseUp={saveThreshold}
                  onTouchEnd={saveThreshold}
                  onKeyDown={e => {
                    if (e.key === 'Escape') cancelEdit()
                    if (e.key === 'Enter') saveThreshold()
                  }}
                  className="threshold-slider"
                />
                <div className="threshold-value">{thresholdInput}%</div>
              </div>
            ) : (
              <>
                <div className="card-value">{config?.threshold ?? '...'}%</div>
                <div className="card-label">Threshold</div>
              </>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-icon">📋</div>
          <div className="card-body">
            <div className="card-value">{reportCount}</div>
            <div className="card-label">{lastReport}</div>
          </div>
        </div>
      </div>

      <div className="section">
        <h2>Quick Actions</h2>
        <div className="action-buttons">
          <a href="/runner" className="btn btn-primary">
            ▶️ Run Tests
          </a>
          <a href="/pages" className="btn btn-secondary">
            📄 Manage Pages
          </a>
          <a href="/reports" className="btn btn-secondary">
            📋 View Reports
          </a>
        </div>
      </div>
    </div>
  )
}
