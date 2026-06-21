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

export interface PageConfig {
  name: string
  url: string
  waitForSelector?: string
  mask?: string[]
  threshold?: number
}

export interface Config {
  viewport: { width: number; height: number }
  threshold: number
  waitFor: 'networkidle' | 'domcontentloaded' | 'load'
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
  return request<PageConfig>(`/api/pages/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify(page),
  })
}

export async function deletePage(name: string): Promise<void> {
  await request(`/api/pages/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

export async function runBaseline(pages?: string[]): Promise<{ success: boolean; message: string }> {
  return request('/api/run/baseline', {
    method: 'POST',
    ...(pages ? { body: JSON.stringify({ pages }) } : {}),
  })
}

export async function runTest(pages?: string[]): Promise<{ results: CompareResult[] }> {
  return request<{ results: CompareResult[] }>('/api/run/test', {
    method: 'POST',
    ...(pages ? { body: JSON.stringify({ pages }) } : {}),
  })
}

export async function runPageBaseline(name: string): Promise<{ success: boolean; message: string }> {
  return request(`/api/pages/${encodeURIComponent(name)}/baseline`, { method: 'POST' })
}

export async function runPageTest(name: string): Promise<{ result: CompareResult }> {
  return request<{ result: CompareResult }>(`/api/pages/${encodeURIComponent(name)}/test`, { method: 'POST' })
}

export async function getReports(): Promise<ReportFile[]> {
  return request<ReportFile[]>('/api/reports')
}

export function getReportUrl(filename: string): string {
  return `/api/reports/${filename}`
}

export function getImageUrl(type: 'baseline' | 'current' | 'diff', name: string): string {
  return `/images/${type}/${name}.png`
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
  return request<Schedule>(`/api/schedules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function deleteSchedule(id: string): Promise<void> {
  await request(`/api/schedules/${id}`, { method: 'DELETE' })
}

export async function validateCron(cronExpression: string): Promise<{ valid: boolean; nextRun: string | null }> {
  return request('/api/schedules/validate', {
    method: 'POST',
    body: JSON.stringify({ cronExpression }),
  })
}
