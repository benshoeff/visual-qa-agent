import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getConfig, activateProject as apiActivateProject, type Config, type ProjectConfig } from '../api'

interface ProjectContextValue {
  config: Config | null
  project: ProjectConfig | null
  loading: boolean
  switchProject: (projectId: string) => Promise<void>
  reload: () => Promise<void>
}

const ProjectContext = createContext<ProjectContextValue>({
  config: null,
  project: null,
  loading: true,
  switchProject: async () => {},
  reload: async () => {},
})

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)

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
    await apiActivateProject(projectId)
    await load()
  }, [load])

  const project = config?.projects.find((p) => p.id === config.activeProjectId) ?? config?.projects[0] ?? null

  return (
    <ProjectContext.Provider value={{ config, project, loading, switchProject, reload: load }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject(): ProjectContextValue {
  return useContext(ProjectContext)
}
