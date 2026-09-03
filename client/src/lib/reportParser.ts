export interface PageResult {
  pageName: string
  passed: boolean
  diffPercent: number
  diffPixels: number
  errored?: boolean
}

export interface ReportSummary {
  total: number
  passed: number
  failed: number
}

export interface ParsedReport {
  summary: ReportSummary | null
  pages: PageResult[]
}

export function parseReport(html: string): ParsedReport {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const nums = Array.from(doc.querySelectorAll('.summary .stat .num')).map((el) =>
    parseInt(el.textContent ?? '', 10)
  )
  let summary: ReportSummary | null = null
  if (nums.length >= 3) {
    summary = {
      total: nums[0] || 0,
      passed: nums[1] || 0,
      failed: nums[2] || 0,
    }
  }

  const pages: PageResult[] = []
  doc.querySelectorAll('tbody tr').forEach((row) => {
    const nameEl = row.querySelector('td strong')
    if (!nameEl) return
    const cells = row.querySelectorAll('td')
    const statusCell = cells[1]
    const diffCell = cells[2]
    const pixelsCell = cells[3]
    const isErrorRow = row.classList.contains('error-msg')
    if (!statusCell || !diffCell || !pixelsCell) return
    const text = statusCell.textContent ?? ''
    const passed = isErrorRow ? false : text.includes('✅') || text.toLowerCase().includes('pass')
    pages.push({
      pageName: nameEl.textContent || '',
      passed,
      errored: isErrorRow || text.toLowerCase().includes('error'),
      diffPercent: parseFloat(diffCell.textContent?.replace('%', '') || '0'),
      diffPixels: parseInt(pixelsCell.textContent?.replace(/[^0-9]/g, '') || '0'),
    })
  })

  return { summary, pages }
}
