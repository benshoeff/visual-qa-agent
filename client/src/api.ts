const BASE = ''

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Request failed')
  }
  return res.json()
}

async function requestText(url: string): Promise<string> {
  const res = await fetch(`${BASE}${url}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Request failed')
  }
  return res.text()
}

export interface PageConfig {
  name: string
  url: string
  threshold?: number
}

export interface Config {
  viewport: { width: number; height: number }
  threshold: number
  pages: PageConfig[]
}

export interface CompareResult {
  pageName: string
  passed: boolean
  diffPixels: number
  totalPixels: number
  diffPercent: number
  baselinePath: string
  currentPath: string
  diffPath: string | null
  error?: string
}

export interface ReportFile {
  filename: string
  timestamp: number
  size: number
}

export async function getConfig(): Promise<Config> {
  return request<Config>('/api/config')
}

export async function updateConfig(updates: Partial<Config>): Promise<Config> {
  return request<Config>('/api/config', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function getPages(): Promise<PageConfig[]> {
  return request<PageConfig[]>('/api/pages')
}

export async function addPage(page: PageConfig): Promise<PageConfig> {
  return request<PageConfig>('/api/pages', {
    method: 'POST',
    body: JSON.stringify(page),
  })
}

export async function updatePage(name: string, page: Partial<PageConfig>): Promise<PageConfig> {
  return request<PageConfig>(`/api/pages?name=${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify(page),
  })
}

export async function deletePage(name: string): Promise<void> {
  await request(`/api/pages?name=${encodeURIComponent(name)}`, { method: 'DELETE' })
}

export type RunMode = 'test' | 'baseline' | 'crawl'

export async function dispatchRun(
  mode: RunMode,
  options: { pages?: string[]; url?: string; crawlConfig?: Record<string, unknown> } = {}
): Promise<{ success: boolean; message: string }> {
  return request('/api/dispatch', {
    method: 'POST',
    body: JSON.stringify({ mode, pages: options.pages, url: options.url, crawlConfig: options.crawlConfig }),
  })
}

export interface RunStatus {
  id: number
  runNumber: number
  status: string
  conclusion: string | null
  createdAt: string
  updatedAt: string
  htmlUrl: string
}

export async function getRunStatus(): Promise<RunStatus[]> {
  const data = await request<{ runs: RunStatus[] }>('/api/status')
  return data.runs
}

const WAIT_FOR_STATES = ['queued', 'in_progress', 'pending', 'requested', 'waiting']

export function isRunPending(r: RunStatus | undefined | null): boolean {
  return !!r && WAIT_FOR_STATES.includes(r.status)
}

export function isRunDone(r: RunStatus | undefined | null): boolean {
  return !!r && !WAIT_FOR_STATES.includes(r.status)
}

export function runConclusion(r: RunStatus | undefined | null): 'success' | 'neutral' | 'skipped' | 'cancelled' | 'timed_out' | 'action_required' | 'failure' | 'startup_failure' | 'stale' | null {
  return r?.status === 'completed' && r.conclusion ? (r.conclusion as never) : null
}

export async function getReports(): Promise<ReportFile[]> {
  return request<ReportFile[]>('/api/reports')
}

export function getReportUrl(filename: string): string {
  return `/api/files?type=report&name=${encodeURIComponent(filename)}`
}

export function getImageUrl(type: 'baseline' | 'current' | 'diff', name: string): string {
  return `/api/files?type=${type}&name=${encodeURIComponent(name)}`
}

export async function fetchReportHtml(filename: string): Promise<string> {
  return requestText(getReportUrl(filename))
}

export interface Schedule {
  id: string
  name: string
  cronExpression: string
  mode: 'baseline' | 'test'
  enabled: boolean
  createdAt: number
  lastRun: number | null
}

export async function getSchedules(): Promise<Schedule[]> {
  return request<Schedule[]>('/api/schedules')
}

export async function addSchedule(s: { name: string; cronExpression: string; mode: string; enabled: boolean }): Promise<Schedule> {
  return request<Schedule>('/api/schedules', {
    method: 'POST',
    body: JSON.stringify(s),
  })
}

export async function updateSchedule(id: string, updates: Partial<Schedule>): Promise<Schedule> {
  return request<Schedule>(`/api/schedules?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function deleteSchedule(id: string): Promise<void> {
  await request(`/api/schedules?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function validateCron(cronExpression: string): { valid: boolean; nextRun: string | null } {
  const valid = /^(\*|[0-9]+)(\s+(\*|[0-9]+)){4}$/.test(cronExpression.trim())
  return { valid, nextRun: valid ? 'Pending (runs via GitHub Actions schedule)' : null }
}

// Crawl
export interface DiscoveredPage {
  url: string
  name: string
  depth: number
  parentUrl?: string
}

export interface CrawlJob {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startUrl: string
  discoveredPages: DiscoveredPage[]
  error?: string
  createdAt: string
  updatedAt: string
}

export async function startCrawl(url: string, crawlConfig: Record<string, unknown> = {}): Promise<{ jobId: string }> {
  return request<{ jobId: string }>('/api/crawl', {
    method: 'POST',
    body: JSON.stringify({ url, config: crawlConfig }),
  })
}

export async function getCrawlJob(jobId: string): Promise<CrawlJob | null> {
  try {
    return await request<CrawlJob>(`/api/crawl?id=${encodeURIComponent(jobId)}`)
  } catch {
    return null
  }
}

export async function confirmBaselines(jobId: string, pageNames: string[]): Promise<{ added: number; skipped: number }> {
  return request(`/api/crawl?id=${encodeURIComponent(jobId)}&confirm=true`, {
    method: 'POST',
    body: JSON.stringify({ pageNames }),
  })
}
