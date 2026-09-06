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
  captureMode?: 'viewport' | 'fullPage'
  fullPageScrollable?: string
  fullPageKeepVisible?: string[]
}

export interface FullPageConfig {
  defaultMode: 'viewport' | 'fullPage'
  maxHeight: number
}

export interface IgnoreZone {
  id: string
  name: string
  type: 'bounding-box' | 'selector'
  x?: number
  y?: number
  width?: number
  height?: number
  selector?: string
  enabled: boolean
}

export interface ProjectConfig {
  id: string
  name: string
  baseUrl: string
  viewport: { width: number; height: number }
  threshold: number
  waitFor: string
  pages: PageConfig[]
  globalIgnoreZones: IgnoreZone[]
  fullPage?: FullPageConfig
}

export interface Config {
  version?: number
  activeProjectId: string
  projects: ProjectConfig[]
  ai?: { provider: string; model: string } & Record<string, unknown>
  browsers?: string[]
  performance?: Record<string, unknown>
}

export function activeProject(config: Config): ProjectConfig | undefined {
  return config.projects.find((p) => p.id === config.activeProjectId) ?? config.projects[0]
}

function projectParam(projectId?: string): string {
  return projectId ? `?project=${encodeURIComponent(projectId)}` : ''
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

export interface ConfigUpdate {
  viewport?: { width: number; height: number }
  threshold?: number
  waitFor?: string
  ai?: Config['ai']
  browsers?: string[]
  performance?: Config['performance']
  activeProjectId?: string
}

export async function updateConfig(updates: ConfigUpdate, projectId?: string): Promise<Config> {
  return request<Config>(`/api/config${projectParam(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

// Projects
export async function getProjects(): Promise<{ activeProjectId: string; projects: ProjectConfig[] }> {
  return request('/api/projects')
}

export async function addProject(p: { name: string; baseUrl: string; pages?: PageConfig[] }): Promise<ProjectConfig> {
  return request<ProjectConfig>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(p),
  })
}

export async function updateProject(id: string, updates: Partial<ProjectConfig>): Promise<ProjectConfig> {
  return request<ProjectConfig>(`/api/projects?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function deleteProject(id: string): Promise<void> {
  await request(`/api/projects?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function activateProject(id: string): Promise<{ activeProjectId: string }> {
  return request(`/api/projects?id=${encodeURIComponent(id)}&confirm=true`, { method: 'POST' })
}

export async function getPages(projectId?: string): Promise<PageConfig[]> {
  return request<PageConfig[]>(`/api/pages${projectParam(projectId)}`)
}

export async function addPage(page: PageConfig, projectId?: string): Promise<PageConfig> {
  return request<PageConfig>(`/api/pages${projectParam(projectId)}`, {
    method: 'POST',
    body: JSON.stringify(page),
  })
}

export async function updatePage(name: string, page: Partial<PageConfig>, projectId?: string): Promise<PageConfig> {
  return request<PageConfig>(`/api/pages?name=${encodeURIComponent(name)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ''}`, {
    method: 'PUT',
    body: JSON.stringify(page),
  })
}

export async function deletePage(name: string, projectId?: string): Promise<void> {
  await request(`/api/pages?name=${encodeURIComponent(name)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ''}`, { method: 'DELETE' })
}

export type RunMode = 'test' | 'baseline' | 'crawl'

export async function dispatchRun(
  mode: RunMode,
  options: {
    pages?: string[]
    url?: string
    crawlConfig?: Record<string, unknown>
    fullPageMode?: 'page-default' | 'viewport' | 'fullPage'
    projectId?: string
  } = {}
): Promise<{ success: boolean; message: string }> {
  return request('/api/dispatch', {
    method: 'POST',
    body: JSON.stringify({
      mode,
      pages: options.pages,
      url: options.url,
      crawlConfig: options.crawlConfig,
      fullPageMode: options.fullPageMode,
      project: options.projectId,
    }),
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

export async function getReports(projectId?: string): Promise<ReportFile[]> {
  return request<ReportFile[]>(`/api/reports${projectParam(projectId)}`)
}

export function getReportUrl(filename: string, projectId?: string): string {
  return `/api/files?type=report&name=${encodeURIComponent(filename)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ''}`
}

export function getImageUrl(type: 'baseline' | 'current' | 'diff', name: string, projectId?: string): string {
  return `/api/files?type=${type}&name=${encodeURIComponent(name)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ''}`
}

export interface DiffRegion {
  y: number
  height: number
}

export interface DiffRegionsFile {
  pageName: string
  regions: DiffRegion[]
}

export async function getDiffRegions(pageName: string, projectId?: string): Promise<DiffRegionsFile | null> {
  try {
    return await request<DiffRegionsFile>(
      `/api/files?type=regions&name=${encodeURIComponent(pageName)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ''}`
    )
  } catch {
    return null
  }
}

export async function fetchReportHtml(filename: string, projectId?: string): Promise<string> {
  return requestText(getReportUrl(filename, projectId))
}

export interface Schedule {
  id: string
  name: string
  cronExpression: string
  mode: 'baseline' | 'test'
  enabled: boolean
  projectId?: string
  createdAt: number
  lastRun: number | null
}

export async function getSchedules(): Promise<Schedule[]> {
  return request<Schedule[]>('/api/schedules')
}

export async function addSchedule(s: { name: string; cronExpression: string; mode: string; enabled: boolean; projectId?: string }): Promise<Schedule> {
  return request<Schedule>('/api/schedules', {
    method: 'POST',
    body: JSON.stringify(s),
  })
}

export async function updateSchedule(id: string, updates: Partial<Schedule>, projectId?: string): Promise<Schedule> {
  return request<Schedule>(`/api/schedules?id=${encodeURIComponent(id)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ''}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function deleteSchedule(id: string, projectId?: string): Promise<void> {
  await request(`/api/schedules?id=${encodeURIComponent(id)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ''}`, { method: 'DELETE' })
}

export function validateCron(cronExpression: string): { valid: boolean; nextRun: string | null } {
  const valid = /^(\*|[0-9]+)(\s+(\*|[0-9]+)){4}$/.test(cronExpression.trim())
  return { valid, nextRun: valid ? 'Pending (runs via GitHub Actions schedule)' : null }
}

// Ignore Zones
export async function getIgnoreZones(pageName?: string, projectId?: string): Promise<IgnoreZone[]> {
  const params = []
  if (pageName) params.push(`page=${encodeURIComponent(pageName)}`)
  if (projectId) params.push(`project=${encodeURIComponent(projectId)}`)
  return request<IgnoreZone[]>(`/api/ignore-zones${params.length ? `?${params.join('&')}` : ''}`)
}

export async function getIgnoreZonesAll(projectId?: string): Promise<{ global: IgnoreZone[]; pages: Record<string, IgnoreZone[]> }> {
  return request(`/api/ignore-zones${projectId ? `?project=${encodeURIComponent(projectId)}` : ''}`)
}

export async function createIgnoreZone(zone: Omit<IgnoreZone, 'id'> & { pageName?: string; projectId?: string }): Promise<IgnoreZone> {
  const { projectId, ...rest } = zone
  return request<IgnoreZone>(`/api/ignore-zones${projectId ? `?project=${encodeURIComponent(projectId)}` : ''}`, {
    method: 'POST',
    body: JSON.stringify(rest),
  })
}

export async function updateIgnoreZone(id: string, updates: Partial<IgnoreZone>, pageName?: string, projectId?: string): Promise<void> {
  const params = []
  if (pageName) params.push(`page=${encodeURIComponent(pageName)}`)
  if (projectId) params.push(`project=${encodeURIComponent(projectId)}`)
  await request(`/api/ignore-zones/${id}${params.length ? `?${params.join('&')}` : ''}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function deleteIgnoreZone(id: string, pageName?: string, projectId?: string): Promise<void> {
  const params = []
  if (pageName) params.push(`page=${encodeURIComponent(pageName)}`)
  if (projectId) params.push(`project=${encodeURIComponent(projectId)}`)
  await request(`/api/ignore-zones/${id}${params.length ? `?${params.join('&')}` : ''}`, { method: 'DELETE' })
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
  projectId?: string
  error?: string
  createdAt: string
  updatedAt: string
}

export async function startCrawl(url: string, crawlConfig: Record<string, unknown> = {}, projectId?: string): Promise<{ jobId: string }> {
  return request<{ jobId: string }>('/api/crawl', {
    method: 'POST',
    body: JSON.stringify({ url, config: crawlConfig, projectId }),
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
