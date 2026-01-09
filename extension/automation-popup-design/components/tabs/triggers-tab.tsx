"use client"

import type React from "react"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { useAutomation } from "@/components/automation-provider"
import {
  type TriggerType,
  type Trigger,
  type WebhookWsConfig,
  type BrowserEventConfig,
  type DomConditionConfig,
  type ScheduleConfig,
  getDefaultConfig,
  defaultTriggerRunPolicy,
} from "@/lib/automation-types"
import {
  Plus,
  Webhook,
  Globe,
  Eye,
  Clock,
  Wifi,
  CheckCircle2,
  Play,
  Copy,
  Trash2,
  RefreshCw,
  MousePointer2,
  AlertTriangle,
  Zap,
  Pencil,
} from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

const triggerTypes: { type: TriggerType; label: string; icon: typeof Webhook }[] = [
  { type: "webhookWs", label: "WebSocket", icon: Webhook },
  { type: "browserEvent", label: "Browser Event", icon: Globe },
  { type: "domCondition", label: "DOM Condition", icon: Eye },
  { type: "schedule", label: "Schedule", icon: Clock },
]

function generateId() {
  return `tr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Helper component for form fields with help text
function FormField({
  label,
  help,
  required,
  children,
}: {
  label: string
  help?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Label className="text-xs">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        {help && (
          <span className="text-[9px] text-muted-foreground truncate max-w-[180px]" title={help}>
            - {help}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

export function TriggersTab() {
  const {
    selectedWorkflowId,
    getWorkflow,
    addTrigger,
    updateTrigger,
    deleteTrigger,
    updateSettings,
    restartWebsocket,
    isPicking,
    setIsPicking,
    setPickedSelector,
    setOnPickComplete,
  } = useAutomation()
  const workflow = getWorkflow(selectedWorkflowId)
  const triggersLocked = workflow ? workflow.status !== "paused" : false

  const [triggerDialogOpen, setTriggerDialogOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null)
  const [simulateOpen, setSimulateOpen] = useState(false)
  const [selectedTriggerId, setSelectedTriggerId] = useState<string | null>(null)
  const [pickingDomSelector, setPickingDomSelector] = useState(false)

  // Form state for new trigger
  const [newTriggerType, setNewTriggerType] = useState<TriggerType>("webhookWs")
  const [newTriggerName, setNewTriggerName] = useState("")
  const [newTriggerConfig, setNewTriggerConfig] = useState<any>(getDefaultConfig("webhookWs"))
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const resetForm = useCallback(() => {
    setFormMode("create")
    setEditingTriggerId(null)
    setNewTriggerType("webhookWs")
    setNewTriggerName("")
    setNewTriggerConfig(getDefaultConfig("webhookWs"))
    setValidationErrors({})
  }, [])

  const openCreateDialog = useCallback(() => {
    if (triggersLocked) return
    resetForm()
    setTriggerDialogOpen(true)
  }, [resetForm, triggersLocked])

  const openEditDialog = useCallback((trigger: Trigger) => {
    if (triggersLocked) return
    setFormMode("edit")
    setEditingTriggerId(trigger.id)
    setNewTriggerType(trigger.type)
    setNewTriggerName(trigger.name)
    setNewTriggerConfig({ ...trigger.config })
    setValidationErrors({})
    setTriggerDialogOpen(true)
  }, [triggersLocked])

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      resetForm()
    }
    setTriggerDialogOpen(open)
  }

  const triggers = workflow?.triggers || []
  const triggerPolicy = workflow?.settings?.triggerPolicy || defaultTriggerRunPolicy
  const wsConnected = workflow?.settings?.wsConnected ?? false
  const connectionStatus = {
    websocket: wsConnected,
  }

  const handlePolicyChange = (updates: Partial<typeof triggerPolicy>) => {
    updateSettings(selectedWorkflowId, { triggerPolicy: { ...triggerPolicy, ...updates } })
  }

  const getTypeIcon = (type: TriggerType) => {
    const found = triggerTypes.find((t) => t.type === type)
    return found ? found.icon : Webhook
  }

  const getTypeLabel = (type: TriggerType) => {
    const found = triggerTypes.find((t) => t.type === type)
    return found ? found.label : type
  }

  const getTypeDescription = (type: TriggerType) => {
    switch (type) {
      case "webhookWs":
        return "Configure how this workflow listens to WebSocket events."
      case "browserEvent":
        return "React to browser lifecycle events on matched tabs."
      case "domCondition":
        return "Wait for DOM conditions to be met before firing."
      case "schedule":
        return "Run this workflow on a time-based schedule."
      default:
        return "Configure when this workflow should start."
    }
  }

  const updateConfig = (key: string, value: any) => {
    setNewTriggerConfig((prev: any) => ({ ...prev, [key]: value }))
    // Clear validation error for this field
    if (validationErrors[key]) {
      setValidationErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const handleScheduleModeChange = (mode: ScheduleConfig["mode"]) => {
    setNewTriggerConfig((prev: any) => ({
      ...prev,
      mode,
      ...(mode === "everyMinutes" ? { everyMinutes: prev.everyMinutes || 1 } : {}),
      ...(mode === "everyMs" ? { everyMs: prev.everyMs || 1000 } : {}),
    }))
    setValidationErrors((prev) => {
      const next = { ...prev }
      delete next.everyMinutes
      delete next.everyMs
      delete next.dailyTime
      delete next.cronExpression
      return next
    })
  }

  const cancelPickingSelector = useCallback(() => {
    setIsPicking(false)
    setPickedSelector(null)
    setOnPickComplete(null)
    setPickingDomSelector(false)
  }, [setIsPicking, setOnPickComplete, setPickedSelector, setPickingDomSelector])

  const applyPickedSelector = useCallback(
    (selector: string) => {
      setNewTriggerConfig((prev: any) => ({ ...prev, selector }))
      setValidationErrors((prev) => {
        if (!prev.selector) return prev
        const next = { ...prev }
        delete next.selector
        return next
      })
      setPickingDomSelector(false)
    },
    [setNewTriggerConfig, setPickingDomSelector, setValidationErrors],
  )

  const handlePickTriggerSelector = useCallback(() => {
    if (triggersLocked) return
    if (isPicking) {
      cancelPickingSelector()
      return
    }

    setPickedSelector(null)
    setOnPickComplete(() => (selector: string) => {
      applyPickedSelector(selector)
    })
    setPickingDomSelector(true)
    setIsPicking(true)
  }, [
    applyPickedSelector,
    cancelPickingSelector,
    isPicking,
    setIsPicking,
    setOnPickComplete,
    setPickedSelector,
    setPickingDomSelector,
    triggersLocked,
  ])

  useEffect(() => {
    if (!triggerDialogOpen && pickingDomSelector) {
      cancelPickingSelector()
    }
  }, [cancelPickingSelector, pickingDomSelector, triggerDialogOpen])

  useEffect(() => {
    if (pickingDomSelector && newTriggerType !== "domCondition") {
      cancelPickingSelector()
    }
  }, [cancelPickingSelector, newTriggerType, pickingDomSelector])

  useEffect(() => {
    if (!isPicking) {
      setPickingDomSelector(false)
    }
  }, [isPicking, setPickingDomSelector])

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}

    if (!newTriggerName.trim()) {
      errors.name = "Name is required"
    } else if (!/^[a-z0-9_-]+$/i.test(newTriggerName)) {
      errors.name = "Use only letters, numbers, _ or -"
    }

    switch (newTriggerType) {
      case "webhookWs":
        if (!newTriggerConfig.eventName?.trim()) {
          errors.eventName = "Event name is required"
        }
        break
      case "browserEvent":
        if (!newTriggerConfig.urlValue?.trim()) {
          errors.urlValue = "URL value is required"
        }
        if (newTriggerConfig.urlMatchType === "regex") {
          try {
            new RegExp(newTriggerConfig.urlValue)
          } catch {
            errors.urlValue = "Invalid regex pattern"
          }
        }
        break
      case "domCondition":
        if (!newTriggerConfig.selector?.trim()) {
          errors.selector = "Selector is required"
        }
        if (newTriggerConfig.condition === "textContains" && !newTriggerConfig.text?.trim()) {
          errors.text = "Text is required"
        }
        if (newTriggerConfig.condition === "attributeEquals") {
          if (!newTriggerConfig.attributeName?.trim()) {
            errors.attributeName = "Attribute name is required"
          }
          if (!newTriggerConfig.attributeValue?.trim()) {
            errors.attributeValue = "Attribute value is required"
          }
        }
        break
      case "schedule":
        if (
          newTriggerConfig.mode === "everyMinutes" &&
          (newTriggerConfig.everyMinutes < 1 || isNaN(newTriggerConfig.everyMinutes))
        ) {
          errors.everyMinutes = "Must be at least 1 minute"
        }
        if (newTriggerConfig.mode === "everyMs" && (newTriggerConfig.everyMs < 10 || isNaN(newTriggerConfig.everyMs))) {
          errors.everyMs = "Must be at least 10 ms"
        }
        if (newTriggerConfig.mode === "dailyAt" && !/^\d{2}:\d{2}$/.test(newTriggerConfig.dailyTime)) {
          errors.dailyTime = "Format must be HH:MM"
        }
        break
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSaveTrigger = () => {
    if (triggersLocked) return
    if (!validateForm()) return

    const hasAllowedSites = (workflow?.settings?.allowedSites?.length || 0) > 0

    if (formMode === "edit" && editingTriggerId) {
      updateTrigger(selectedWorkflowId, editingTriggerId, {
        name: newTriggerName,
        type: newTriggerType,
        config: newTriggerConfig,
      })
    } else {
      const newTrigger: Trigger = {
        id: generateId(),
        name: newTriggerName,
        type: newTriggerType,
        enabled: true,
        config: newTriggerConfig,
        createdAt: Date.now(),
      }

      addTrigger(selectedWorkflowId, newTrigger)

      if (!hasAllowedSites) {
        alert("Configure pelo menos um Allowed Site antes de ativar um trigger.")
      }
    }

    resetForm()
    setTriggerDialogOpen(false)
  }

  const handleToggleTrigger = (triggerId: string, enabled: boolean) => {
    if (triggersLocked) return
    const hasAllowedSites = (workflow?.settings?.allowedSites?.length || 0) > 0
    if (enabled && !hasAllowedSites) {
      alert("Configure Allowed Sites antes de ativar um trigger.")
      return
    }
    updateTrigger(selectedWorkflowId, triggerId, { enabled })
  }

  const handleDeleteTrigger = (triggerId: string) => {
    if (triggersLocked) return
    deleteTrigger(selectedWorkflowId, triggerId)
  }

  const isFormValid = newTriggerName.trim() && Object.keys(validationErrors).length === 0

  // Render config fields based on trigger type
  const renderConfigFields = () => {
    switch (newTriggerType) {
      case "webhookWs":
        return (
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Wifi className={`h-3.5 w-3.5 ${connectionStatus.websocket ? "text-green-500" : "text-destructive"}`} />
              WebSocket: {connectionStatus.websocket ? "Connected" : "Disconnected"}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] ml-auto"
                onClick={() => restartWebsocket(selectedWorkflowId)}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Reconnect
              </Button>
            </div>

            <FormField label="Event name" required help="Event name that triggers the workflow">
              <Input
                className={`h-8 text-xs font-mono ${validationErrors.eventName ? "border-destructive" : ""}`}
                placeholder="run_booking"
                value={newTriggerConfig.eventName || ""}
                onChange={(e) => updateConfig("eventName", e.target.value)}
              />
              {validationErrors.eventName && (
                <p className="text-[10px] text-destructive">{validationErrors.eventName}</p>
              )}
            </FormField>

            <FormField label="Channel" help="Optional channel for event routing">
              <Input
                className="h-8 text-xs font-mono"
                placeholder="default"
                value={newTriggerConfig.channel || ""}
                onChange={(e) => updateConfig("channel", e.target.value)}
              />
            </FormField>

            <FormField label="Auth token" help="Simple token for event validation">
              <Input
                className="h-8 text-xs font-mono"
                type="password"
                placeholder="optional"
                value={newTriggerConfig.authToken || ""}
                onChange={(e) => updateConfig("authToken", e.target.value)}
              />
            </FormField>

            <FormField label="Dedupe window (ms)" help="Prevents duplicate triggers (0 = disabled)">
              <Input
                className="h-8 text-xs"
                type="number"
                placeholder="0"
                value={newTriggerConfig.dedupeWindowMs || 0}
                onChange={(e) => updateConfig("dedupeWindowMs", Number(e.target.value))}
              />
            </FormField>
          </div>
        )

      case "browserEvent":
        return (
          <div className="space-y-3 pt-2 border-t border-border">
            <FormField label="Browser event" required>
              <Select
                value={newTriggerConfig.event || "navigation:completed"}
                onValueChange={(v) => updateConfig("event", v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="navigation:completed" className="text-xs">
                    Navigation Completed
                  </SelectItem>
                  <SelectItem value="tabs:updated" className="text-xs">
                    Tab Updated
                  </SelectItem>
                  <SelectItem value="tabs:activated" className="text-xs">
                    Tab Activated
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="URL match type" required>
              <Select
                value={newTriggerConfig.urlMatchType || "hostEquals"}
                onValueChange={(v) => updateConfig("urlMatchType", v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hostEquals" className="text-xs">
                    Host Equals
                  </SelectItem>
                  <SelectItem value="contains" className="text-xs">
                    URL Contains
                  </SelectItem>
                  <SelectItem value="regex" className="text-xs">
                    Regex
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="URL value" required help="The URL pattern to match">
              <Input
                className={`h-8 text-xs font-mono ${validationErrors.urlValue ? "border-destructive" : ""}`}
                placeholder={
                  newTriggerConfig.urlMatchType === "hostEquals"
                    ? "portal.site.com"
                    : newTriggerConfig.urlMatchType === "contains"
                      ? "/dashboard"
                      : "/.*dashboard.*/"
                }
                value={newTriggerConfig.urlValue || ""}
                onChange={(e) => updateConfig("urlValue", e.target.value)}
              />
              {validationErrors.urlValue && <p className="text-[10px] text-destructive">{validationErrors.urlValue}</p>}
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="runOnce"
                  checked={newTriggerConfig.runOncePerSession ?? true}
                  onCheckedChange={(checked) => updateConfig("runOncePerSession", checked)}
                />
                <label htmlFor="runOnce" className="text-[10px] text-muted-foreground cursor-pointer">
                  Run once per session
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="tabActive"
                  checked={newTriggerConfig.onlyIfTabActive ?? false}
                  onCheckedChange={(checked) => updateConfig("onlyIfTabActive", checked)}
                />
                <label htmlFor="tabActive" className="text-[10px] text-muted-foreground cursor-pointer">
                  Only if tab is active
                </label>
              </div>
            </div>

            <FormField label="Debounce (ms)" help="Prevents rapid multiple triggers">
              <Input
                className="h-8 text-xs"
                type="number"
                value={newTriggerConfig.debounceMs || 300}
                onChange={(e) => updateConfig("debounceMs", Number(e.target.value))}
              />
            </FormField>
          </div>
        )

      case "domCondition":
        return (
          <div className="space-y-3 pt-2 border-t border-border">
            <FormField label="Condition" required>
              <Select
                value={newTriggerConfig.condition || "selectorAppears"}
                onValueChange={(v) => updateConfig("condition", v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="selectorAppears" className="text-xs">
                    Selector Appears
                  </SelectItem>
                  <SelectItem value="selectorDisappears" className="text-xs">
                    Selector Disappears
                  </SelectItem>
                  <SelectItem value="textContains" className="text-xs">
                    Text Contains
                  </SelectItem>
                  <SelectItem value="attributeEquals" className="text-xs">
                    Attribute Equals
                  </SelectItem>
                  <SelectItem value="elementEnabled" className="text-xs">
                    Element Enabled
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="CSS Selector" required>
              <div className="flex gap-1.5">
                <Input
                  className={`h-8 text-xs font-mono flex-1 ${validationErrors.selector ? "border-destructive" : ""}`}
                  placeholder="#continueBtn"
                  value={newTriggerConfig.selector || ""}
                  onChange={(e) => updateConfig("selector", e.target.value)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 bg-transparent"
                  onClick={handlePickTriggerSelector}
                  disabled={triggersLocked && !isPicking}
                >
                  {isPicking && pickingDomSelector ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MousePointer2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              {validationErrors.selector && <p className="text-[10px] text-destructive">{validationErrors.selector}</p>}
            </FormField>

            {newTriggerConfig.condition === "textContains" && (
              <FormField label="Text" required>
                <Input
                  className={`h-8 text-xs ${validationErrors.text ? "border-destructive" : ""}`}
                  placeholder="Continue"
                  value={newTriggerConfig.text || ""}
                  onChange={(e) => updateConfig("text", e.target.value)}
                />
                {validationErrors.text && <p className="text-[10px] text-destructive">{validationErrors.text}</p>}
              </FormField>
            )}

            {newTriggerConfig.condition === "attributeEquals" && (
              <>
                <FormField label="Attribute name" required>
                  <Input
                    className={`h-8 text-xs font-mono ${validationErrors.attributeName ? "border-destructive" : ""}`}
                    placeholder="aria-disabled"
                    value={newTriggerConfig.attributeName || ""}
                    onChange={(e) => updateConfig("attributeName", e.target.value)}
                  />
                  {validationErrors.attributeName && (
                    <p className="text-[10px] text-destructive">{validationErrors.attributeName}</p>
                  )}
                </FormField>
                <FormField label="Attribute value" required>
                  <Input
                    className={`h-8 text-xs font-mono ${validationErrors.attributeValue ? "border-destructive" : ""}`}
                    placeholder="false"
                    value={newTriggerConfig.attributeValue || ""}
                    onChange={(e) => updateConfig("attributeValue", e.target.value)}
                  />
                  {validationErrors.attributeValue && (
                    <p className="text-[10px] text-destructive">{validationErrors.attributeValue}</p>
                  )}
                </FormField>
              </>
            )}

            <div className="grid grid-cols-2 gap-2">
              <FormField label="Timeout (ms)">
                <Input
                  className="h-8 text-xs"
                  type="number"
                  value={newTriggerConfig.timeoutMs || 10000}
                  onChange={(e) => updateConfig("timeoutMs", Number(e.target.value))}
                />
              </FormField>
              <FormField label="Cooldown (ms)">
                <Input
                  className="h-8 text-xs"
                  type="number"
                  value={newTriggerConfig.cooldownMs || 1000}
                  onChange={(e) => updateConfig("cooldownMs", Number(e.target.value))}
                />
              </FormField>
            </div>

            <FormField label="Fire mode">
              <Select value={newTriggerConfig.fireMode || "once"} onValueChange={(v) => updateConfig("fireMode", v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once" className="text-xs">
                    Once
                  </SelectItem>
                  <SelectItem value="everyTime" className="text-xs">
                    Every Time
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Scope">
              <Select
                value={newTriggerConfig.targetTabScope || "currentTab"}
                onValueChange={(v) => updateConfig("targetTabScope", v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="currentTab" className="text-xs">
                    Current Tab
                  </SelectItem>
                  <SelectItem value="anyTabMatchingScope" className="text-xs">
                    Any Tab Matching Scope
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            {newTriggerConfig.targetTabScope === "anyTabMatchingScope" && (
              <FormField label="Scope URL regex" help="Which tabs to observe">
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder=".*example\.com.*"
                  value={newTriggerConfig.scopeUrlRegex || ""}
                  onChange={(e) => updateConfig("scopeUrlRegex", e.target.value)}
                />
              </FormField>
            )}
          </div>
        )

      case "schedule":
        return (
          <div className="space-y-3 pt-2 border-t border-border">
            <FormField label="Schedule mode" required>
              <Select
                value={newTriggerConfig.mode || "everyMinutes"}
                onValueChange={(v) => handleScheduleModeChange(v as ScheduleConfig["mode"])}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyMinutes" className="text-xs">
                    Every X Minutes
                  </SelectItem>
                  <SelectItem value="everyMs" className="text-xs">
                    Every X ms
                  </SelectItem>
                  <SelectItem value="dailyAt" className="text-xs">
                    Daily At
                  </SelectItem>
                  <SelectItem value="cronLike" className="text-xs">
                    Cron-like
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            {newTriggerConfig.mode === "everyMinutes" && (
              <FormField label="Every (minutes)" required help="Minimum 1 minute">
                <Input
                  className={`h-8 text-xs ${validationErrors.everyMinutes ? "border-destructive" : ""}`}
                  type="number"
                  min={1}
                  value={newTriggerConfig.everyMinutes || 30}
                  onChange={(e) => updateConfig("everyMinutes", Number(e.target.value))}
                />
                {validationErrors.everyMinutes && (
                  <p className="text-[10px] text-destructive">{validationErrors.everyMinutes}</p>
                )}
              </FormField>
            )}

            {newTriggerConfig.mode === "everyMs" && (
              <FormField label="Every (ms)" required help="Minimum 10 ms">
                <Input
                  className={`h-8 text-xs ${validationErrors.everyMs ? "border-destructive" : ""}`}
                  type="number"
                  min={10}
                  value={newTriggerConfig.everyMs ?? 1000}
                  onChange={(e) => updateConfig("everyMs", Number(e.target.value))}
                />
                {validationErrors.everyMs && <p className="text-[10px] text-destructive">{validationErrors.everyMs}</p>}
              </FormField>
            )}

            {newTriggerConfig.mode === "dailyAt" && (
              <FormField label="Time (HH:MM)" required>
                <Input
                  className={`h-8 text-xs font-mono ${validationErrors.dailyTime ? "border-destructive" : ""}`}
                  placeholder="09:00"
                  value={newTriggerConfig.dailyTime || ""}
                  onChange={(e) => updateConfig("dailyTime", e.target.value)}
                />
                {validationErrors.dailyTime && (
                  <p className="text-[10px] text-destructive">{validationErrors.dailyTime}</p>
                )}
              </FormField>
            )}

            {newTriggerConfig.mode === "cronLike" && (
              <FormField label="Cron expression" help="e.g., */15 * * * *">
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="*/15 * * * *"
                  value={newTriggerConfig.cronExpression || ""}
                  onChange={(e) => updateConfig("cronExpression", e.target.value)}
                />
              </FormField>
            )}

            <FormField label="Timezone">
              <Select value={newTriggerConfig.timezone || "local"} onValueChange={(v) => updateConfig("timezone", v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local" className="text-xs">
                    Local
                  </SelectItem>
                  <SelectItem value="UTC" className="text-xs">
                    UTC
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Jitter (ms)" help="Randomize timing to avoid patterns">
              <Input
                className="h-8 text-xs"
                type="number"
                value={newTriggerConfig.jitterMs || 0}
                onChange={(e) => updateConfig("jitterMs", Number(e.target.value))}
              />
            </FormField>

            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
              <Checkbox
                id="runIfClosed"
                checked={newTriggerConfig.runIfBrowserClosed ?? false}
                onCheckedChange={(checked) => updateConfig("runIfBrowserClosed", checked)}
                disabled
              />
              <label htmlFor="runIfClosed" className="text-[10px] text-muted-foreground">
                Run if browser closed (not guaranteed)
              </label>
              <AlertTriangle className="h-3 w-3 text-amber-500 ml-auto" />
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const getTriggerSummary = (trigger: Trigger) => {
    switch (trigger.type) {
      case "webhookWs":
        return `event: ${(trigger.config as WebhookWsConfig).eventName}`
      case "browserEvent":
        const bConfig = trigger.config as BrowserEventConfig
        return `${bConfig.event} @ ${bConfig.urlValue}`
      case "domCondition":
        const dConfig = trigger.config as DomConditionConfig
        return `${dConfig.condition}: ${dConfig.selector}`
      case "schedule":
        const sConfig = trigger.config as ScheduleConfig
        if (sConfig.mode === "everyMinutes") return `every ${sConfig.everyMinutes}m`
        if (sConfig.mode === "everyMs") return `every ${sConfig.everyMs}ms`
        if (sConfig.mode === "dailyAt") return `daily @ ${sConfig.dailyTime}`
        return sConfig.mode
      default:
        return ""
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <Wifi className={`h-3.5 w-3.5 ${connectionStatus.websocket ? "text-green-500" : "text-destructive"}`} />
            <span className="text-muted-foreground">WebSocket:</span>
            <span
              className={connectionStatus.websocket ? "text-green-500 font-medium" : "text-destructive font-medium"}
            >
              {connectionStatus.websocket ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
          <RefreshCw className="h-3 w-3" />
          Reconnect
        </Button>
      </div>

      {/* Add Trigger Button */}
      <div className="p-3 border-b border-border">
        <Dialog open={triggerDialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              className="w-full h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={openCreateDialog}
              disabled={triggersLocked}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Trigger
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>{formMode === "edit" ? "Edit Trigger" : "Add Trigger"}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {getTypeDescription(newTriggerType)}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-1 min-h-0 pr-4 overflow-y-auto">
              <div className="space-y-3 py-2">
                {/* Trigger Type */}
                <FormField label="Trigger Type" required>
                  <Select
                    value={newTriggerType}
                    onValueChange={(v) => {
                      const nextType = v as TriggerType
                      setNewTriggerType(nextType)
                      setNewTriggerConfig(getDefaultConfig(nextType))
                      setValidationErrors({})
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {triggerTypes.map((t) => (
                        <SelectItem key={t.type} value={t.type} className="text-xs">
                          <div className="flex items-center gap-2">
                            <t.icon className="h-3.5 w-3.5" />
                            {t.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                {/* Name */}
                <FormField label="Name" required help="Unique identifier (letters, numbers, _, -)">
                  <Input
                    className={`h-8 text-xs font-mono ${validationErrors.name ? "border-destructive" : ""}`}
                    placeholder="my_trigger"
                    value={newTriggerName}
                    onChange={(e) => {
                      setNewTriggerName(e.target.value)
                      if (validationErrors.name) {
                        setValidationErrors((prev) => {
                          const next = { ...prev }
                          delete next.name
                          return next
                        })
                      }
                    }}
                  />
                  {validationErrors.name && <p className="text-[10px] text-destructive">{validationErrors.name}</p>}
                </FormField>

                {/* Dynamic Config Fields */}
                {renderConfigFields()}
              </div>
            </ScrollArea>

            <div className="pt-3 border-t border-border">
              <Button
                className="w-full h-8 text-xs"
                onClick={handleSaveTrigger}
                disabled={!newTriggerName.trim() || triggersLocked}
              >
                {formMode === "edit" ? "Save Changes" : "Create Trigger"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {triggersLocked && (
        <div className="mx-3 mb-2 p-2 rounded border border-amber-500/30 bg-amber-500/10 text-amber-900 text-[11px]">
          Trigger is ON. Set it to OFF in the header to edit, create, or delete triggers.
        </div>
      )}

      {/* Trigger handling behavior */}
      <div className="p-3 border-b border-border bg-muted/30">
        <Accordion type="single" collapsible>
          <AccordionItem value="policy" className="border border-border rounded-md px-2">
            <AccordionTrigger className="text-xs font-medium py-2 hover:no-underline">
              <div className="flex w-full items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  <span>Trigger handling</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>
                    {triggerPolicy.mode === "single"
                      ? "One event at a time"
                      : triggerPolicy.mode === "restart"
                        ? "Restart on new trigger"
                        : `Parallel x${triggerPolicy.parallelLimit}`}
                  </span>
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                    Workflow-level
                  </Badge>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3 pt-1">
              <p className="text-[10px] text-muted-foreground mb-2">
                Choose what happens when a new trigger fires while a run is in progress.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <FormField label="When a trigger fires">
                  <Select value={triggerPolicy.mode} onValueChange={(v) => handlePolicyChange({ mode: v as any })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single" className="text-xs">
                        One event at a time (ignore while running)
                      </SelectItem>
                      <SelectItem value="restart" className="text-xs">
                        Cancel current run and restart
                      </SelectItem>
                      <SelectItem value="parallel" className="text-xs">
                        Run in parallel (limit)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Parallel limit" help="How many runs can overlap">
                  <Input
                    className="h-8 text-xs"
                    type="number"
                    min={1}
                    value={triggerPolicy.parallelLimit}
                    onChange={(e) =>
                      handlePolicyChange({
                        parallelLimit: Math.max(
                          1,
                          Number(e.target.value) || defaultTriggerRunPolicy.parallelLimit,
                        ),
                      })
                    }
                    disabled={triggerPolicy.mode !== "parallel"}
                  />
                </FormField>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Triggers List */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-2 space-y-2">
            {triggers.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No triggers yet. Click "Add Trigger" to create one.
              </div>
            ) : (
              triggers.map((trigger) => {
                const Icon = getTypeIcon(trigger.type)
                return (
                  <div key={trigger.id} className="p-2.5 rounded-lg border border-border bg-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 p-1.5 rounded bg-secondary">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-medium">{trigger.name}</h4>
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                              {getTypeLabel(trigger.type)}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                            {getTriggerSummary(trigger)}
                          </p>
                          {trigger.lastEvent && (
                            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                              <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
                              Last event: {trigger.lastEvent}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={trigger.enabled}
                          onCheckedChange={(checked) => handleToggleTrigger(trigger.id, checked)}
                          className="scale-75 border border-muted-foreground/25 data-[state=unchecked]:bg-muted/80"
                          disabled={triggersLocked}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => openEditDialog(trigger)}
                          disabled={triggersLocked}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Dialog
                          open={simulateOpen && selectedTriggerId === trigger.id}
                          onOpenChange={(open) => {
                            setSimulateOpen(open)
                            if (open) setSelectedTriggerId(trigger.id)
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <Play className="h-3 w-3" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-sm">
                            <DialogHeader>
                              <DialogTitle className="text-sm">Simulate Trigger</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3 py-2">
                              <div className="space-y-2">
                                <Label className="text-xs">Payload (JSON)</Label>
                                <Textarea
                                  className="h-32 text-xs font-mono"
                                  defaultValue={`{\n  "userId": "123",\n  "action": "test"\n}`}
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 h-8 text-xs gap-1.5 bg-transparent"
                                >
                                  <Copy className="h-3 w-3" />
                                  Copy Example
                                </Button>
                                <Button
                                  size="sm"
                                  className="flex-1 h-8 text-xs gap-1.5 bg-primary text-primary-foreground"
                                >
                                  <Play className="h-3 w-3" />
                                  Fire Trigger
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() => handleDeleteTrigger(trigger.id)}
                          disabled={triggersLocked}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
