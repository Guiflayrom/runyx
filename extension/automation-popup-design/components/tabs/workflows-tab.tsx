"use client"

import type React from "react"
import { Label } from "@/components/ui/label"
import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Search,
  Plus,
  Upload,
  Download,
  Play,
  Pencil,
  Copy,
  Trash2,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  FileJson,
  AlertCircle,
} from "lucide-react"
import { useAutomation } from "@/components/automation-provider"
import {
  serializeWorkflow,
  deserializeWorkflow,
  validateWorkflowImport,
  createDefaultSettings,
  type Workflow,
} from "@/lib/automation-types"

interface WorkflowsTabProps {
  onEditWorkflow: () => void
}

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

export function WorkflowsTab({ onEditWorkflow }: WorkflowsTabProps) {
  const { workflows, selectedWorkflowId, setSelectedWorkflowId, updateWorkflow, addWorkflow, deleteWorkflow } =
    useAutomation()
  const [searchQuery, setSearchQuery] = useState("")
  const [showExportModal, setShowExportModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<Workflow | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newWorkflowName, setNewWorkflowName] = useState("")
  const [newWorkflowDescription, setNewWorkflowDescription] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredWorkflows = workflows.filter((wf) => wf.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const toggleWorkflow = (id: string, enabled: boolean) => {
    updateWorkflow(id, { status: enabled ? "idle" : "paused" })
  }

  const handleExport = async (workflowId: string) => {
    const workflow = workflows.find((w) => w.id === workflowId)
    if (!workflow) return

    const exportData = serializeWorkflow(workflow)
    const json = JSON.stringify(exportData, null, 2)
    const fileName = `${workflow.name.toLowerCase().replace(/\s+/g, "-")}-workflow.json`

    // Tenta baixar via service worker (necessário na extensão/sandbox)
    if (isSandboxed()) {
      try {
        await sandboxRpc({ type: "download.workflow", fileName, content: json })
        setShowExportModal(false)
        return
      } catch (err) {
        console.warn("[export] sandbox download failed, falling back", err)
      }
    }

    // Fallback para ambiente local (sem sandbox)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setShowExportModal(false)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportError(null)
    setImportPreview(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string
        const data = JSON.parse(content)

        if (!validateWorkflowImport(data)) {
          setImportError("Invalid workflow file format. Please check the file structure.")
          return
        }

        const workflow = deserializeWorkflow(data)
        setImportPreview(workflow)
      } catch {
        setImportError("Failed to parse JSON file. Please ensure it's a valid JSON.")
      }
    }
    reader.readAsText(file)
  }

  const handleConfirmImport = () => {
    if (!importPreview) return
    addWorkflow(importPreview)
    setSelectedWorkflowId(importPreview.id)
    setShowImportModal(false)
    setImportPreview(null)
    setImportError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleDuplicate = (workflowId: string) => {
    const workflow = workflows.find((w) => w.id === workflowId)
    if (!workflow) return

    const duplicated: Workflow = {
      ...workflow,
      id: `wf-${Date.now()}`,
      name: `${workflow.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      runs: [],
      runCount: 0,
      lastRun: undefined,
      status: "paused",
    }
    addWorkflow(duplicated)
    setSelectedWorkflowId(duplicated.id)
  }

  const handleDelete = (workflowId: string) => {
    if (workflows.length <= 1) return
    deleteWorkflow(workflowId)
  }

  const handleCreateWorkflow = () => {
    if (!newWorkflowName.trim()) return

    const newWorkflow: Workflow = {
      id: `wf-${Date.now()}`,
      name: newWorkflowName.trim(),
      description: newWorkflowDescription.trim() || "New automation workflow",
      status: "paused",
      steps: [],
      triggers: [],
      runs: [],
      settings: createDefaultSettings(),
      variables: {},
      runCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    addWorkflow(newWorkflow)
    setSelectedWorkflowId(newWorkflow.id)
    setShowNewModal(false)
    setNewWorkflowName("")
    setNewWorkflowDescription("")
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Search and Actions */}
      <div className="p-3 space-y-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-secondary border-border"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-7 text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => setShowNewModal(true)}
          >
            <Plus className="h-3 w-3" />
            New
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 border-border bg-transparent"
            onClick={() => setShowImportModal(true)}
          >
            <Upload className="h-3 w-3" />
            Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 border-border bg-transparent"
            onClick={() => setShowExportModal(true)}
          >
            <Download className="h-3 w-3" />
            Export
          </Button>
        </div>
      </div>

      {/* Workflow List */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-2 space-y-2">
            {filteredWorkflows.map((workflow) => {
              const isEnabled = workflow.status !== "paused" && workflow.status !== "error"
              return (
                <div
                  key={workflow.id}
                  className={`p-2.5 rounded-lg border transition-colors cursor-pointer ${
                    selectedWorkflowId === workflow.id
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-card hover:border-border/80"
                  }`}
                  onClick={() => setSelectedWorkflowId(workflow.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium truncate">{workflow.name}</h3>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) => toggleWorkflow(workflow.id, checked)}
                          className="scale-75"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Globe className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground font-mono">{workflow.description}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                          {workflow.steps.length} steps
                        </Badge>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                          {workflow.triggers.length} triggers
                        </Badge>
                        <Badge
                          variant={workflow.status === "error" ? "destructive" : "outline"}
                          className="text-[9px] px-1.5 py-0 h-4"
                        >
                          {workflow.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem className="text-xs gap-2">
                            <Play className="h-3 w-3" /> Run
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-xs gap-2" onClick={onEditWorkflow}>
                            <Pencil className="h-3 w-3" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-xs gap-2"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDuplicate(workflow.id)
                            }}
                          >
                            <Copy className="h-3 w-3" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-xs gap-2"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleExport(workflow.id)
                            }}
                          >
                            <Download className="h-3 w-3" /> Export
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-xs gap-2 text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(workflow.id)
                            }}
                            disabled={workflows.length <= 1}
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {workflow.lastRun && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          {workflow.status !== "error" ? (
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                          ) : (
                            <XCircle className="h-3 w-3 text-destructive" />
                          )}
                          <Clock className="h-2.5 w-2.5" />
                          <span>{workflow.lastRun}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Export Modal */}
      <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
        <DialogContent className="sm:max-w-md bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export Workflow
            </DialogTitle>
            <DialogDescription>Select which workflow you want to export as JSON</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {workflows.map((workflow) => (
              <button
                key={workflow.id}
                onClick={() => handleExport(workflow.id)}
                className="w-full p-3 rounded-lg border border-border bg-secondary/50 hover:bg-secondary transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-foreground">{workflow.name}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">{workflow.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {workflow.steps.length} steps
                    </Badge>
                    <FileJson className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <Dialog
        open={showImportModal}
        onOpenChange={(open) => {
          setShowImportModal(open)
          if (!open) {
            setImportPreview(null)
            setImportError(null)
            if (fileInputRef.current) fileInputRef.current.value = ""
          }
        }}
      >
        <DialogContent className="sm:max-w-md bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import Workflow
            </DialogTitle>
            <DialogDescription>Upload a workflow JSON file to import</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* File Input */}
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
                id="workflow-file"
              />
              <label htmlFor="workflow-file" className="cursor-pointer flex flex-col items-center gap-2">
                <FileJson className="h-10 w-10 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Click to select a .json file</span>
              </label>
            </div>

            {/* Error Message */}
            {importError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                <p className="text-xs text-destructive">{importError}</p>
              </div>
            )}

            {/* Preview */}
            {importPreview && (
              <div className="p-3 rounded-lg border border-border bg-secondary/50">
                <h4 className="text-sm font-medium text-foreground mb-2">Preview</h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="text-foreground font-medium">{importPreview.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Description:</span>
                    <span className="text-foreground">{importPreview.description}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Steps:</span>
                    <Badge variant="secondary">{importPreview.steps.length}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Triggers:</span>
                    <Badge variant="secondary">{importPreview.triggers.length}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Allowed Sites:</span>
                    <Badge variant="secondary">{importPreview.settings?.allowedSites?.length || 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Variables:</span>
                    <Badge variant="secondary">{Object.keys(importPreview.variables || {}).length}</Badge>
                  </div>
                  {importPreview.settings?.wsEndpoint && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">WebSocket:</span>
                      <span className="text-foreground font-mono text-[10px] truncate max-w-[180px]">
                        {importPreview.settings.wsEndpoint}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowImportModal(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!importPreview} onClick={handleConfirmImport}>
                Import Workflow
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Workflow Modal */}
      <Dialog open={showNewModal} onOpenChange={setShowNewModal}>
        <DialogContent className="sm:max-w-md bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Workflow
            </DialogTitle>
            <DialogDescription>Create a new automation workflow</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Workflow Name</Label>
              <Input
                className="h-8 text-xs"
                placeholder="My Workflow"
                value={newWorkflowName}
                onChange={(e) => setNewWorkflowName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateWorkflow()}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Description (optional)</Label>
              <Input
                className="h-8 text-xs"
                placeholder="What does this workflow do?"
                value={newWorkflowDescription}
                onChange={(e) => setNewWorkflowDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNewModal(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreateWorkflow} disabled={!newWorkflowName.trim()}>
                Create Workflow
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
