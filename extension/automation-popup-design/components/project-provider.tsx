"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import type { Project, ProjectContextType } from "@/lib/project-types"

const PROJECT_STORAGE_KEY = "runyx:projects"

const ProjectContext = createContext<ProjectContextType | null>(null)

export const DEFAULT_PROJECT_ID = "proj-1"

/**
 * RPC helper: sandbox (iframe) -> ui-bridge -> service worker
 */
function sandboxRpc(payload: any): Promise<any> {
  const requestId = crypto.randomUUID()
  window.parent.postMessage({ __fromSandbox: true, requestId, payload }, "*")

  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data
      if (!msg?.__fromExtension) return
      if (msg.requestId !== requestId) return

      window.removeEventListener("message", handler)
      if (msg.error) reject(new Error(msg.error))
      else resolve(msg.response)
    }
    window.addEventListener("message", handler)
  })
}

export function useProject() {
  const context = useContext(ProjectContext)
  if (!context) {
    throw new Error("useProject must be used within ProjectProvider")
  }
  return context
}

const initialProjects: Project[] = []

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from storage
  useEffect(() => {
    ;(async () => {
      try {
        const res = await sandboxRpc({ type: "storage.get", keys: [PROJECT_STORAGE_KEY] })
        const saved = res?.data?.[PROJECT_STORAGE_KEY]
        if (saved?.projects && Array.isArray(saved.projects)) {
          setProjects(saved.projects)
        }
        if (saved && "selectedProjectId" in saved) {
          setSelectedProjectId(saved.selectedProjectId ?? null)
        }
      } catch (err) {
        console.warn("[storage] failed to load projects", err)
      } finally {
        setHydrated(true)
      }
    })()
  }, [])

  // Persist to storage
  useEffect(() => {
    if (!hydrated) return
    const payload = {
      [PROJECT_STORAGE_KEY]: {
        projects,
        selectedProjectId,
      },
    }
    sandboxRpc({ type: "storage.set", data: payload }).catch((err) =>
      console.warn("[storage] failed to persist projects", err),
    )
  }, [hydrated, projects, selectedProjectId])

  const getProject = useCallback((id: string) => projects.find((p) => p.id === id), [projects])

  const addProject = useCallback((project: Project) => {
    setProjects((prev) => [...prev, project])
  }, [])

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p)))
  }, [])

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id))
    setSelectedProjectId((currentId) => (currentId === id ? null : currentId))
  }, [])

  const addWorkflowToProject = useCallback((projectId: string, workflowId: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? p.workflowIds.includes(workflowId)
            ? p
            : { ...p, workflowIds: [...p.workflowIds, workflowId], updatedAt: Date.now() }
          : p,
      ),
    )
  }, [])

  const removeWorkflowFromProject = useCallback((projectId: string, workflowId: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, workflowIds: p.workflowIds.filter((id) => id !== workflowId), updatedAt: Date.now() }
          : p,
      ),
    )
  }, [])

  return (
    <ProjectContext.Provider
      value={{
        projects,
        selectedProjectId,
        hydrated,
        setSelectedProjectId,
        getProject,
        addProject,
        updateProject,
        deleteProject,
        addWorkflowToProject,
        removeWorkflowFromProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  )
}
