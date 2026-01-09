"use client"

import { useState, useCallback } from "react"
import { TopBar } from "./top-bar"
import { WorkflowsTab } from "./tabs/workflows-tab"
import { TriggersTab } from "./tabs/triggers-tab"
import { StepsTab } from "./tabs/steps-tab"
import { RunsTab } from "./tabs/runs-tab"
import { SettingsTab } from "./tabs/settings-tab"
import { useAutomation } from "@/components/automation-provider"
import { Workflow, Play, Zap, History, Settings, type LucideIcon } from "lucide-react"

type TabId = "workflows" | "triggers" | "steps" | "runs" | "settings"

interface Tab {
  id: TabId
  label: string
  icon: LucideIcon
}

const tabs: Tab[] = [
  { id: "workflows", label: "Workflows", icon: Workflow },
  { id: "triggers", label: "Triggers", icon: Zap },
  { id: "steps", label: "Steps", icon: Play },
  { id: "runs", label: "Runs", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
]

export function AutomationStudio() {
  const [activeTab, setActiveTab] = useState<TabId>("workflows")
  const { selectedWorkflowId, setSelectedWorkflowId } = useAutomation()
  const [pendingSelector, setPendingSelector] = useState<string | null>(null)

  const handleOpenAddStep = useCallback((selector: string) => {
    setPendingSelector(selector)
    setActiveTab("steps")
  }, [])

  const handleClearPendingSelector = useCallback(() => {
    setPendingSelector(null)
  }, [])

  return (
    <div className="automation-studio-container w-full h-full bg-background border-b border-border flex flex-col overflow-hidden">
      <TopBar
        selectedWorkflowId={selectedWorkflowId}
        onWorkflowChange={setSelectedWorkflowId}
        onOpenAddStep={handleOpenAddStep}
      />

      {/* Tab Navigation */}
      <div className="flex border-b border-border bg-card/50">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors relative ${
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
              {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "workflows" && <WorkflowsTab onEditWorkflow={() => setActiveTab("steps")} />}
        {activeTab === "triggers" && <TriggersTab />}
        {activeTab === "steps" && (
          <StepsTab
            workflowId={selectedWorkflowId}
            initialSelector={pendingSelector}
            onSelectorConsumed={handleClearPendingSelector}
          />
        )}
        {activeTab === "runs" && <RunsTab workflowId={selectedWorkflowId} />}
        {activeTab === "settings" && <SettingsTab workflowId={selectedWorkflowId} />}
      </div>
    </div>
  )
}
