import { useEffect, useState } from 'react'
import { getReports, getReportUrl, getImageUrl } from '../api'
import type { ReportFile } from '../api'
import DiffSlider from './DiffSlider'

const PER_PAGE = 10

interface PageResult {
  pageName: string
  passed: boolean
  diffPercent: number
  diffPixels: number
}

export default function ReportViewer() {
  const [reports, setReports] = useState<ReportFile[]>([])
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [reportContent, setReportContent] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const totalPages = Math.max(1, Math.ceil(reports.length / PER_PAGE))
  const paginated = reports.slice(page * PER_PAGE, (page + 1) * PER_PAGE)

  useEffect(() => {
    getReports().then((data) => {
      setReports(data)
      setPage(0)
    })
  }, [])

  const viewReport = async (filename: string) => {
    setSelectedReport(filename)
    try {
      const res = await fetch(getReportUrl(filename))
      const html = await res.text()
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')

      const summary = doc.querySelector('.summary')
      const table = doc.querySelector('table')

      if (table) {
        const rows = table.querySelectorAll('tbody tr')
        const pages: PageResult[] = []
        rows.forEach((row) => {
          const nameEl = row.querySelector('td strong')
          if (!nameEl) return
          const cells = row.querySelectorAll('td')
          const statusCell = cells[1]
          const diffCell = cells[2]
          const pixelsCell = cells[3]
          if (!statusCell || !diffCell || !pixelsCell) return
          pages.push({
            pageName: nameEl.textContent || '',
            passed: statusCell.textContent?.includes('עבר') || statusCell.textContent?.includes('Pass') || false,
            diffPercent: parseFloat(diffCell.textContent?.replace('%', '') || '0'),
            diffPixels: parseInt(pixelsCell.textContent?.replace(/[^0-9]/g, '') || '0'),
          })
        })

        let htmlOutput = ''
        if (summary) {
          htmlOutput += summary.outerHTML
        }

        htmlOutput += '<table class="table"><thead><tr><th>Page</th><th>Status</th><th>Diff %</th><th>Diff Pixels</th><th>Visual</th></tr></thead><tbody>'
        pages.forEach((p) => {
          htmlOutput += `<tr class="${p.passed ? 'row-pass' : 'row-fail'}">
            <td><strong>${p.pageName}</strong></td>
            <td>${p.passed ? '<span class="status-pass">✅ Pass</span>' : '<span class="status-fail">❌ Fail</span>'}</td>
            <td>${p.diffPercent}%</td>
            <td>${p.diffPixels.toLocaleString()}</td>
            <td><a href="#view-${p.pageName}" class="btn btn-sm view-diff-btn" data-page="${p.pageName}">Compare</a></td>
          </tr>`
        })
        htmlOutput += '</tbody></table>'
        setReportContent(htmlOutput)
      } else {
        setReportContent('<p>Could not parse report.</p>')
      }
    } catch {
      setReportContent('<p>Error loading report.</p>')
    }
  }

  const [diffView, setDiffView] = useState<string | null>(null)

  useEffect(() => {
    if (!reportContent) return
    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement
      if (target.classList.contains('view-diff-btn')) {
        e.preventDefault()
        const page = target.getAttribute('data-page')
        if (page) setDiffView(page)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [reportContent])

  return (
    <div>
      <h1>Reports</h1>

      <div className="section">
        {reports.length === 0 ? (
          <p className="empty-text">No reports yet. Run a test first.</p>
        ) : (
          <>
            <div className="report-list">
              {paginated.map((r) => (
                <div
                  key={r.filename}
                  className={`report-item ${selectedReport === r.filename ? 'active' : ''}`}
                  onClick={() => viewReport(r.filename)}
                >
                  <div className="report-item-name">{r.filename}</div>
                  <div className="report-item-date">
                    {new Date(r.timestamp).toLocaleString('en-US')}
                  </div>
                  <div className="report-item-size">
                    {(r.size / 1024).toFixed(0)} KB
                  </div>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="btn btn-sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  ← Previous
                </button>
                <span className="pagination-info">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  className="btn btn-sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {reportContent && (
        <div className="section">
          <div className="section-header">
            <h2>Report: {selectedReport}</h2>
            <a className="btn btn-secondary" href={getReportUrl(selectedReport!)} target="_blank" rel="noreferrer">
              Open Full Report ↗
            </a>
          </div>
          <div dangerouslySetInnerHTML={{ __html: reportContent }} />
        </div>
      )}

      {diffView && (
        <div className="modal-overlay" onClick={() => setDiffView(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="section-header">
              <h2>{diffView}</h2>
              <button className="btn btn-secondary" onClick={() => setDiffView(null)}>
                Close
              </button>
            </div>
            <DiffSlider
              baselineUrl={getImageUrl('baseline', diffView)}
              currentUrl={getImageUrl('current', diffView)}
              label="Drag slider to compare Baseline vs Current"
            />
          </div>
        </div>
      )}
    </div>
  )
}
