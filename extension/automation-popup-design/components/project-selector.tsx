"use client"

import { useState, useEffect, useRef } from "react"
import { useProject } from "./project-provider"
import { useAutomation } from "./automation-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { FolderOpen, Plus, Workflow, ChevronRight, Upload, Download, FileJson } from "lucide-react"
import type { Workflow } from "@/lib/automation-types"
import { mergeSettingsWithDefaults } from "@/lib/automation-types"

function isSandboxed() {
  return typeof window !== "undefined" && window.parent && window.parent !== window
}

function sandboxRpc(payload: any): Promise<any> {
  if (!isSandboxed()) return Promise.reject(new Error("Not in sandbox"))

  const requestId = crypto.randomUUID()
  window.parent.postMessage({ __fromSandbox: true, requestId, payload }, "*")

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", handler)
      reject(new Error("Sandbox RPC timeout"))
    }, 3000)

    const handler = (event: MessageEvent) => {
      const msg = event.data
      if (!msg?.__fromExtension) return
      if (msg.requestId !== requestId) return
      clearTimeout(timeout)
      window.removeEventListener("message", handler)
      if (msg.error) reject(new Error(msg.error))
      else resolve(msg.response)
    }

    window.addEventListener("message", handler)
  })
}

export function ProjectSelector() {
  const { projects, setSelectedProjectId, addProject } = useProject()
  const { setWorkflowsForProject, getWorkflowsForProject } = useAutomation()
  const [isCreating, setIsCreating] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [newProjectDescription, setNewProjectDescription] = useState("")
  const [isImporting, setIsImporting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<{ project: any; workflows: Workflow[] } | null>(null)
  const [selectedExportProjectId, setSelectedExportProjectId] = useState<string>("")
  const importInputRef = useRef<HTMLInputElement>(null)

  const [showTitle, setShowTitle] = useState(false)
  const [showSubtitle, setShowSubtitle] = useState(false)
  const [showProjects, setShowProjects] = useState(false)

  useEffect(() => {
    // Staggered animation sequence
    const titleTimer = setTimeout(() => setShowTitle(true), 100)
    const subtitleTimer = setTimeout(() => setShowSubtitle(true), 300)
    const projectsTimer = setTimeout(() => setShowProjects(true), 500)

    return () => {
      clearTimeout(titleTimer)
      clearTimeout(subtitleTimer)
      clearTimeout(projectsTimer)
    }
  }, [])

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId)
  }

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return

    const newProject = {
      id: `proj-${crypto.randomUUID()}`,
      name: newProjectName.trim(),
      description: newProjectDescription.trim(),
      workflowIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    addProject(newProject)
    setSelectedProjectId(newProject.id)
    setIsCreating(false)
    setNewProjectName("")
    setNewProjectDescription("")
  }

  return (
    <div className="h-screen w-screen bg-background flex flex-col items-center justify-center p-6">
      {/* Header with Logo */}
      <div className="flex flex-col items-center mb-10">
        <div
          className={`flex items-center gap-3 mb-2 transition-all duration-500 ease-out ${
            showTitle ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Workflow className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-4xl font-bold text-foreground tracking-tight">Runyx</h1>
        </div>
        <p
          className={`text-muted-foreground text-sm transition-all duration-500 ease-out ${
            showSubtitle ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          Browser automation for developers
        </p>
      </div>

      <div
        className={`w-full max-w-md transition-all duration-500 ease-out ${
          showProjects ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <h2 className="text-sm font-medium text-muted-foreground mb-3 px-1">Your Projects</h2>
        <div className="space-y-2 mb-6">
          {projects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No projects yet</p>
              <p className="text-xs">Create your first project to get started</p>
            </div>
          ) : (
            projects.map((project, index) => (
              <button
                key={project.id}
                onClick={() => handleSelectProject(project.id)}
                className="w-full p-4 rounded-lg border border-border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all group text-left"
                style={{
                  animationDelay: `${index * 100}ms`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <FolderOpen className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-foreground">{project.name}</h3>
                      <p className="text-xs text-muted-foreground">{project.description || "No description"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                      {project.workflowIds.length} workflow{project.workflowIds.length !== 1 ? "s" : ""}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Create New Project Button */}
        <Button onClick={() => setIsCreating(true)} className="w-full" variant="outline">
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Button>
        <div className="flex flex-col gap-2 mt-3">
          <Button variant="outline" className="w-full" onClick={() => setIsImporting(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import Project
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              if (projects.length > 0 && !selectedExportProjectId) {
                setSelectedExportProjectId(projects[0].id)
              }
              setIsExporting(true)
            }}
            disabled={projects.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export Project
          </Button>
        </div>
      </div>

      {/* Create Project Dialog */}
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="project-name" className="text-sm font-medium text-foreground">
                Project Name
              </label>
              <Input
                id="project-name"
                placeholder="My Awesome Project"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="project-description" className="text-sm font-medium text-foreground">
                Description
              </label>
              <Textarea
                id="project-description"
                placeholder="Describe what this project is for..."
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Project Dialog */}
      <Dialog
        open={isImporting}
        onOpenChange={(open) => {
          setIsImporting(open)
          if (!open) {
            setImportPreview(null)
            setImportError(null)
            if (importInputRef.current) importInputRef.current.value = ""
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
              <input
                ref={importInputRef}
                type="file"
                accept=".json"
                className="hidden"
                id="project-file"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setImportError(null)
                  setImportPreview(null)
                  const reader = new FileReader()
                  reader.onload = (event) => {
                    try {
                      const content = event.target?.result as string
                      const data = JSON.parse(content)
                      if (!data?.project || !data?.workflows || !Array.isArray(data.workflows)) {
                        setImportError("Invalid project file. Expected { project, workflows }")
                        return
                      }
                      setImportPreview({ project: data.project, workflows: data.workflows })
                    } catch {
                      setImportError("Failed to parse JSON file. Please ensure it's valid JSON.")
                    }
                  }
                  reader.readAsText(file)
                }}
              />
              <label htmlFor="project-file" className="cursor-pointer flex flex-col items-center gap-2">
                <FileJson className="h-10 w-10 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Click to select a .json project file</span>
              </label>
            </div>

            {importError && <p className="text-xs text-destructive">{importError}</p>}

            {importPreview && (
              <div className="p-3 rounded-lg border border-border bg-secondary/50">
                <h4 className="text-sm font-medium text-foreground mb-2">Preview</h4>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="text-foreground font-medium">
                      {importPreview.project?.name || "Imported Project"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Description:</span>
                    <span className="text-foreground">{importPreview.project?.description || "No description"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Workflows:</span>
                    <span className="text-foreground font-medium">{importPreview.workflows.length}</span>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsImporting(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!importPreview) return
                  const incomingWorkflows = importPreview.workflows
                  const incomingProject = importPreview.project || {}
                  const baseId =
                    typeof incomingProject.id === "string" && incomingProject.id.trim()
                      ? incomingProject.id.trim()
                      : `proj-${crypto.randomUUID()}`
                  const finalId = projects.some((p) => p.id === baseId) ? `proj-${crypto.randomUUID()}` : baseId
                  const normalizedWorkflows: Workflow[] = incomingWorkflows.map((wf: any, idx: number) => {
                    const id =
                      typeof wf.id === "string" && wf.id.trim() ? wf.id.trim() : `wf-${Date.now()}-${idx}-${crypto.randomUUID()}`
                    return {
                      id,
                      name: typeof wf.name === "string" && wf.name.trim() ? wf.name.trim() : "Imported Workflow",
                      description: typeof wf.description === "string" ? wf.description : "",
                      status: wf.status === "paused" || wf.status === "error" ? wf.status : "idle",
                      steps: Array.isArray(wf.steps) ? wf.steps : [],
                      triggers: Array.isArray(wf.triggers) ? wf.triggers : [],
                      variables: wf.variables && typeof wf.variables === "object" ? wf.variables : {},
                      runs: [],
                      settings: mergeSettingsWithDefaults(wf.settings as any),
                      createdAt: typeof wf.createdAt === "number" ? wf.createdAt : Date.now(),
                      updatedAt: Date.now(),
                      runCount: typeof wf.runCount === "number" ? wf.runCount : 0,
                      lastRun: wf.lastRun,
                    }
                  })

                  const normalizedProject = {
                    id: finalId,
                    name: typeof incomingProject.name === "string" && incomingProject.name.trim()
                      ? incomingProject.name.trim()
                      : "Imported Project",
                    description: typeof incomingProject.description === "string" ? incomingProject.description : "",
                    workflowIds: normalizedWorkflows.map((w) => w.id),
                    createdAt: typeof incomingProject.createdAt === "number" ? incomingProject.createdAt : Date.now(),
                    updatedAt: Date.now(),
                  }

                  addProject(normalizedProject)
                  setWorkflowsForProject(finalId, normalizedWorkflows)
                  setSelectedProjectId(finalId)
                  setIsImporting(false)
                  setImportPreview(null)
                  if (importInputRef.current) importInputRef.current.value = ""
                }}
                disabled={!importPreview}
              >
                Import Project
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export Project Dialog */}
      <Dialog
        open={isExporting}
        onOpenChange={(open) => {
          setIsExporting(open)
          if (open && projects.length > 0) {
            setSelectedExportProjectId((current) => current || projects[0].id)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Choose project</label>
              <select
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={selectedExportProjectId}
                onChange={(e) => setSelectedExportProjectId(e.target.value)}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsExporting(false)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const project = projects.find((p) => p.id === selectedExportProjectId) || projects[0]
                  if (!project) return
                  const payload = {
                    version: "1.0.0",
                    exportedAt: Date.now(),
                    project,
                    workflows: getWorkflowsForProject(project.id),
                  }
                  const json = JSON.stringify(payload, null, 2)
                  const fileName = `${project.name.toLowerCase().replace(/\s+/g, "-")}-project.json`
                  try {
                    if (isSandboxed()) {
                      await sandboxRpc({ type: "download.workflow", fileName, content: json })
                    } else {
                      const blob = new Blob([json], { type: "application/json" })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement("a")
                      a.href = url
                      a.download = fileName
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                      URL.revokeObjectURL(url)
                    }
                  } catch (err) {
                    console.warn("[export project] failed", err)
                  } finally {
                    setIsExporting(false)
                  }
                }}
                disabled={projects.length === 0}
              >
                Export Project
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
