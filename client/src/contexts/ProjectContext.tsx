import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getConfig, activateProject as apiActivateProject, type Config, type ProjectConfig } from '../api'

interface ProjectContextValue {
  config: Config | null
  project: ProjectConfig | null
  loading: boolean
  switching: boolean
  switchProject: (projectId: string) => Promise<void>
  reload: () => Promise<void>
}

const ProjectContext = createContext<ProjectContextValue>({
  config: null,
  project: null,
  loading: true,
  switching: false,
  switchProject: async () => {},
  reload: async () => {},
})

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const c = await getConfig()
      setConfig(c)
    } catch {
      // keep stale config
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const switchProject = useCallback(async (projectId: string) => {
    if (!config) return
    if (config.activeProjectId === projectId) return
    if (!config.projects.some((p) => p.id === projectId)) return

    // Apply the switch optimistically so the UI reacts immediately and every
    // project-scoped component refetches for the new project.
    setConfig((prev) => (prev ? { ...prev, activeProjectId: projectId } : prev))
    setSwitching(true)
    try {
      // The activation endpoint returns the authoritative config, avoiding a
      // read-after-write that could observe stale GitHub/edge-cached data.
      const next = await apiActivateProject(projectId)
      setConfig(next)
    } catch {
      // Roll back to the server's truth on failure.
      try {
        setConfig(await getConfig())
      } catch {
        // keep the optimistic switch
      }
    } finally {
      setSwitching(false)
    }
  }, [config])

  const project = config?.projects.find((p) => p.id === config.activeProjectId) ?? config?.projects[0] ?? null

  return (
    <ProjectContext.Provider value={{ config, project, loading, switching, switchProject, reload: load }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject(): ProjectContextValue {
  return useContext(ProjectContext)
}
