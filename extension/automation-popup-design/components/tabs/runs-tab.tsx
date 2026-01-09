"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAutomation } from "@/components/automation-provider"
import {
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  ChevronRight,
  Loader2,
  Globe,
  AlertTriangle,
  RotateCcw,
  Trash2,
} from "lucide-react"

interface RunsTabProps {
  workflowId: string
}

const triggerLabels: Record<string, string> = {
  manual: "Manual",
  websocket: "WebSocket",
  schedule: "Schedule",
  browser: "Browser",
  dom: "DOM",
}

function formatTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  if (diff < 60000) return "Just now"
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hour${Math.floor(diff / 3600000) > 1 ? "s" : ""} ago`
  return "Yesterday"
}

export function RunsTab({ workflowId }: RunsTabProps) {
  const { getWorkflow, deleteRun, clearRuns } = useAutomation()
  const workflow = getWorkflow(workflowId)
  const runs = workflow?.runs || []

  const [selectedRun, setSelectedRun] = useState<string | null>(null)
  const selectedRunData = runs.find((r) => r.id === selectedRun)

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-3.5 w-3.5 text-success" />
      case "failed":
        return <XCircle className="h-3.5 w-3.5 text-destructive" />
      case "running":
        return <Loader2 className="h-3.5 w-3.5 text-info animate-spin" />
      default:
        return <Clock className="h-3.5 w-3.5 text-muted-foreground" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-success/15 text-success border-0 text-[9px] px-1.5 py-0">Success</Badge>
      case "failed":
        return <Badge className="bg-destructive/15 text-destructive border-0 text-[9px] px-1.5 py-0">Failed</Badge>
      case "running":
        return <Badge className="bg-info/15 text-info border-0 text-[9px] px-1.5 py-0">Running</Badge>
      default:
        return (
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
            {status}
          </Badge>
        )
    }
  }

  if (runs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6">
        <Clock className="h-10 w-10 mb-3 opacity-50" />
        <p className="text-sm font-medium">No runs yet</p>
        <p className="text-xs text-center mt-1">Run this workflow to see execution history here.</p>
      </div>
    )
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Runs List */}
      <div
        className={`${selectedRun ? "w-[180px]" : "w-full"} border-r border-border flex flex-col transition-all overflow-hidden`}
      >
        <div className="p-2 border-b border-border flex items-center justify-between shrink-0">
          <span className="text-xs text-muted-foreground">{runs.length} runs</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-destructive hover:text-destructive"
            onClick={() => clearRuns(workflowId)}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-1.5">
              {runs.map((run) => (
                <div
                  key={run.id}
                  onClick={() => setSelectedRun(run.id)}
                  className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                    selectedRun === run.id
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-card hover:border-border/80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      {getStatusIcon(run.status)}
                      <div className="min-w-0">
                        <h4 className="text-xs font-medium truncate">{workflow?.name}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5">
                            {triggerLabels[run.trigger]}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{formatTime(run.startTime)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground font-mono">{run.duration || "-"}</span>
                    </div>
                  </div>
                  {run.error && (
                    <div className="mt-1.5 flex items-start gap-1 text-[10px] text-destructive">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="truncate">{run.error}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Run Details */}
      {selectedRun && selectedRunData && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b border-border shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">{workflow?.name}</h3>
                  {getStatusBadge(selectedRunData.status)}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                  <span>{formatTime(selectedRunData.startTime)}</span>
                  <span>•</span>
                  <span>{selectedRunData.duration || "-"}</span>
                  <span>•</span>
                  <span>{triggerLabels[selectedRunData.trigger]}</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setSelectedRun(null)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Timeline */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground">Steps Timeline</h4>
                <div className="space-y-1">
                  {selectedRunData.steps.map((step, index) => (
                    <div
                      key={index}
                      className={`flex items-center gap-2 p-2 rounded border ${
                        step.status === "failed" ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"
                      }`}
                    >
                      {step.status === "success" && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                      {step.status === "failed" && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                      {step.status === "running" && <Loader2 className="h-3.5 w-3.5 text-info animate-spin" />}
                      {step.status === "pending" && <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                      {step.status === "skipped" && <Clock className="h-3.5 w-3.5 text-muted-foreground opacity-50" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs">{step.name}</div>
                        {step.error && (
                          <div className="text-[10px] text-destructive/80 font-mono truncate" title={step.error}>
                            {step.error}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">{step.duration || "-"}</span>
                    </div>
                  ))}
                </div>

                {selectedRunData.error && (
                  <div className="mt-3 p-2 rounded border border-destructive/30 bg-destructive/5">
                    <div className="flex items-center gap-1.5 text-xs text-destructive font-medium">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Error Details
                    </div>
                    <p className="text-[10px] text-destructive/80 mt-1 font-mono">{selectedRunData.error}</p>
                  </div>
                )}

                {/* Context */}
                <div className="mt-3 p-2 rounded border border-border bg-secondary/30">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Context</h4>
                  <div className="space-y-1 text-[10px]">
                    {selectedRunData.context.url && (
                      <div className="flex items-center gap-2">
                        <Globe className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">URL:</span>
                        <span className="font-mono">{selectedRunData.context.url}</span>
                      </div>
                    )}
                    {selectedRunData.context.tabId && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Tab ID:</span>
                        <span className="font-mono">{selectedRunData.context.tabId}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Actions */}
          <div className="p-2 border-t border-border flex gap-1.5 shrink-0">
            <Button
              size="sm"
              className="flex-1 h-7 text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <RotateCcw className="h-3 w-3" />
              Replay
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-border bg-transparent">
              <Download className="h-3 w-3" />
              Export
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => {
                deleteRun(workflowId, selectedRunData.id)
                setSelectedRun(null)
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
