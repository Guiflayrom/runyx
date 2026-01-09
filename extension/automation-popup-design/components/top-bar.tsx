"use client"

import type React from "react"
import { Plus, FolderOpen } from "lucide-react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Play,
  Square,
  MousePointer2,
  RefreshCw,
  Globe,
  CheckCircle2,
  XCircle,
  Loader2,
  Wifi,
  Zap,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useAutomation } from "@/components/automation-provider"
import { useProject } from "@/components/project-provider"
import { createDefaultSettings } from "@/lib/automation-types"

interface TopBarProps {
  selectedWorkflowId: string
  onWorkflowChange: (id: string) => void
  onOpenAddStep?: (selector: string) => void
}

export function TopBar({ selectedWorkflowId, onWorkflowChange, onOpenAddStep }: TopBarProps) {
  const {
    workflows,
    addWorkflow,
    isRunnerActive,
    runWorkflow,
    requestStopRunner,
    addRun,
    getWorkflow,
    updateWorkflow,
    isPicking,
    setIsPicking,
    setPickedSelector,
    setOnPickComplete,
  } = useAutomation()
  const { setSelectedProjectId } = useProject()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const siteAllowed = true

  const currentWorkflow = workflows.find((w) => w.id === selectedWorkflowId)
  const wsConnected = currentWorkflow?.settings?.wsConnected ?? false
  const workflowStatus = currentWorkflow?.status === "paused" ? "paused" : "active"

  const handleCreateNewWorkflow = () => {
    const newId = "wf-" + Date.now()
    const newWorkflow = {
      id: newId,
      name: "New Workflow",
      description: "New automation workflow",
      status: "paused" as const,
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
    onWorkflowChange(newId)
  }

  const handleSelectChange = (value: string) => {
    if (value === "__new__") {
      handleCreateNewWorkflow()
    } else {
      onWorkflowChange(value)
    }
  }

  const handleRun = () => {
    const hasAllowedSites = (currentWorkflow?.settings?.allowedSites?.length || 0) > 0
    if (!hasAllowedSites) {
      alert("Configure Allowed Sites antes de rodar o workflow.")
      return
    }
    runWorkflow(selectedWorkflowId)
  }

  const handleStop = () => {
    requestStopRunner()
  }

  const handleToggleActive = () => {
    if (!currentWorkflow) return
    const nextStatus = currentWorkflow.status === "paused" ? "idle" : "paused"
    updateWorkflow(currentWorkflow.id, { status: nextStatus })
  }

  const handlePick = () => {
    if (isPicking) {
      setIsPicking(false)
      setPickedSelector(null)
      setOnPickComplete(null)
      return
    }

    setPickedSelector(null)
    setOnPickComplete(() => (selector: string) => {
      if (onOpenAddStep) {
        onOpenAddStep(selector)
      }
    })
    setIsPicking(true)
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      // Simulate refreshing data from storage/backend
      await new Promise((resolve) => setTimeout(resolve, 800))
      // In a real extension, this would reload data from chrome.storage
      console.log("[v0] Refreshed workflow data")
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleBackToProjects = () => {
    setSelectedProjectId(null)
  }

  return (
    <TooltipProvider>
      <div className="bg-card border-b border-border p-2.5 space-y-2">
        {/* Top Row: Workflow Selector + Site Info */}
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-border bg-transparent shrink-0"
                onClick={handleBackToProjects}
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Back to Projects</p>
            </TooltipContent>
          </Tooltip>

          <Select value={selectedWorkflowId} onValueChange={handleSelectChange}>
            <SelectTrigger className="flex-1 h-8 text-xs bg-secondary border-border">
              <SelectValue placeholder="Select workflow" />
            </SelectTrigger>
            <SelectContent>
              {workflows.map((wf) => (
                <SelectItem key={wf.id} value={wf.id} className="text-xs">
                  {wf.name}
                </SelectItem>
              ))}
              <SelectItem
                value="__new__"
                className="text-xs bg-green-500/20 text-green-500 hover:bg-green-500/30 hover:text-green-400 focus:bg-green-500/30 focus:text-green-400 font-medium mt-1"
              >
                <div className="flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Workflow</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5 px-2 py-1 bg-secondary rounded-md text-xs">
            <Globe className="h-3 w-3 text-muted-foreground" />
            <span className="text-foreground font-mono text-[10px]">{currentWorkflow?.name || "No workflow"}</span>
            <span className={`w-1.5 h-1.5 rounded-full ${siteAllowed ? "bg-green-500" : "bg-destructive"}`} />
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-border bg-transparent"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Refresh</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Bottom Row: Actions + Status (stacked) */}
        <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1 flex-wrap">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={workflowStatus === "active" ? "default" : "outline"}
                size="sm"
                className={`h-7 px-2.5 gap-1.5 text-xs ${workflowStatus === "active" ? "" : "bg-transparent"}`}
                onClick={handleToggleActive}
              >
                <Zap className="h-3 w-3" />
                {workflowStatus === "active" ? "ON" : "OFF"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Toggle triggers for this workflow</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                className="h-7 px-2.5 gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={handleRun}
                disabled={isRunnerActive}
              >
                  {isRunnerActive ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                Run
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Execute workflow on current tab</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 gap-1.5 text-xs border-border bg-transparent"
                onClick={handleStop}
                disabled={!isRunnerActive}
              >
                <Square className="h-3 w-3" />
                Stop
              </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Cancel running execution</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isPicking ? "default" : "outline"}
                  size="sm"
                  className={`h-7 px-2.5 gap-1.5 text-xs border-border ${isPicking ? "" : "bg-transparent"}`}
                  onClick={handlePick}
                >
                  {isPicking ? <Loader2 className="h-3 w-3 animate-spin" /> : <MousePointer2 className="h-3 w-3" />}
                  {isPicking ? "Picking..." : "Pick"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isPicking ? "Click on element to select" : "Select element on page"}</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Status Chips */}
          <div className="flex items-center gap-1.5 flex-wrap pl-0.5">
            {isPicking && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-500 animate-pulse">
                <MousePointer2 className="h-2.5 w-2.5" />
                <span>Picking</span>
              </div>
            )}
            <StatusChip label="Runner" status={isRunnerActive ? "active" : "idle"} activeLabel="Running" idleLabel="Idle" />
            <StatusChip
              label="Workflow"
              status={workflowStatus === "active" ? "active" : "idle"}
              activeLabel="Active"
              idleLabel="Paused"
              icon={<Zap className="h-2.5 w-2.5" />}
            />
            <StatusChip
              label="WS"
              status={wsConnected ? "connected" : "disconnected"}
              activeLabel="OK"
              idleLabel="Off"
              icon={<Wifi className="h-2.5 w-2.5" />}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

function StatusChip({
  label,
  status,
  activeLabel,
  idleLabel,
  icon,
}: {
  label: string
  status: "idle" | "active" | "connected" | "disconnected"
  activeLabel: string
  idleLabel: string
  icon?: React.ReactNode
}) {
  const isGood = status === "active" || status === "connected"

  return (
    <div
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
        isGood ? "bg-green-500/15 text-green-500" : "bg-muted text-muted-foreground"
      }`}
    >
      {icon || (isGood ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />)}
      <span>{isGood ? activeLabel : idleLabel}</span>
    </div>
  )
}
