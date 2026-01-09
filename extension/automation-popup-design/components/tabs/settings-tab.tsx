"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { useAutomation } from "@/components/automation-provider"
import { useProject } from "@/components/project-provider"
import { createDefaultSettings } from "@/lib/automation-types"
import {
  Globe,
  Trash2,
  Wifi,
  Database,
  Shield,
  Code,
  CheckCircle2,
  Download,
  RefreshCw,
  AlertTriangle,
  XCircle,
  Settings2,
  Cookie,
  HardDrive,
  Loader2,
} from "lucide-react"

// Declare chrome as global type
declare const chrome:
  | {
      permissions?: {
        request: (permissions: { permissions: string[] }) => Promise<boolean>
        remove: (permissions: { permissions: string[] }) => Promise<boolean>
        contains: (permissions: { permissions: string[] }, callback: (result: boolean) => void) => void
      }
    }
  | undefined

interface SettingsTabProps {
  workflowId: string
}

// Minimal sandbox RPC helper (sandbox iframe -> ui-bridge -> service worker)
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

export function SettingsTab({ workflowId }: SettingsTabProps) {
  const {
    getWorkflow,
    lastKnownTab,
    setLastKnownTab,
    updateWorkflow,
    updateSettings,
    addAllowedSite,
    removeAllowedSite,
    workflows,
    selectedWorkflowId,
    restartWebsocket,
  } = useAutomation()
  const { selectedProjectId, deleteProject, setSelectedProjectId, getProject } = useProject()
  const workflow = getWorkflow(workflowId)
  const settings = workflow?.settings || createDefaultSettings()
  const project = selectedProjectId ? getProject(selectedProjectId) : null

  const [newSite, setNewSite] = useState("")
  const [wsTesting, setWsTesting] = useState(false)
  const [requestingCookies, setRequestingCookies] = useState(false)
  const [requestingStorage, setRequestingStorage] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [workflowName, setWorkflowName] = useState(workflow?.name || "")
  const [workflowDescription, setWorkflowDescription] = useState(workflow?.description || "")

  const isChromeExtension = typeof chrome !== "undefined" && chrome.permissions

  const handleRequestCookiePermission = async () => {
    setRequestingCookies(true)
    try {
      if (isChromeExtension) {
        if (settings.allowCookies) {
          // Revoke permission
          const removed = await chrome.permissions.remove({ permissions: ["cookies"] })
          if (removed) {
            updateSettings(workflowId, { allowCookies: false })
            console.log("[v0] Cookie permission revoked")
          }
        } else {
          // Request permission
          const granted = await chrome.permissions.request({ permissions: ["cookies"] })
          updateSettings(workflowId, { allowCookies: granted })
          console.log("[v0] Cookie permission:", granted ? "granted" : "denied")
        }
      } else {
        console.warn("[v0] Chrome permissions API not available - running in preview mode")
        // Toggle for demo purposes
        const newValue = !settings.allowCookies
        updateSettings(workflowId, { allowCookies: newValue })
        alert(
          newValue
            ? "Cookie permission would be requested in a real Chrome extension"
            : "Cookie permission would be revoked in a real Chrome extension",
        )
      }
    } catch (error) {
      console.error("[v0] Failed to request cookie permission:", error)
      alert("Failed to request permission: " + (error as Error).message)
    } finally {
      setRequestingCookies(false)
    }
  }

  const handleRequestStoragePermission = async () => {
    setRequestingStorage(true)
    try {
      if (isChromeExtension) {
        // Note: For localStorage access, we need "scripting" permission to inject scripts
        // and optionally "activeTab" for the current tab
        if (settings.allowStorage) {
          // Revoke permission
          const removed = await chrome.permissions.remove({ permissions: ["storage"] })
          if (removed) {
            updateSettings(workflowId, { allowStorage: false })
            console.log("[v0] Storage permission revoked")
          }
        } else {
          // Request permission
          const granted = await chrome.permissions.request({ permissions: ["storage"] })
          updateSettings(workflowId, { allowStorage: granted })
          console.log("[v0] Storage permission:", granted ? "granted" : "denied")
        }
      } else {
        console.warn("[v0] Chrome permissions API not available - running in preview mode")
        // Toggle for demo purposes
        const newValue = !settings.allowStorage
        updateSettings(workflowId, { allowStorage: newValue })
        alert(
          newValue
            ? "Storage permission would be requested in a real Chrome extension"
            : "Storage permission would be revoked in a real Chrome extension",
        )
      }
    } catch (error) {
      console.error("[v0] Failed to request storage permission:", error)
      alert("Failed to request permission: " + (error as Error).message)
    } finally {
      setRequestingStorage(false)
    }
  }

  useEffect(() => {
    if (isChromeExtension) {
      chrome.permissions.contains({ permissions: ["cookies"] }, (hasCookies) => {
        if (hasCookies !== settings.allowCookies) {
          updateSettings(workflowId, { allowCookies: hasCookies })
        }
      })
      chrome.permissions.contains({ permissions: ["storage"] }, (hasStorage) => {
        if (hasStorage !== settings.allowStorage) {
          updateSettings(workflowId, { allowStorage: hasStorage })
        }
      })
    }
  }, [isChromeExtension, workflowId])

  // Keep workflow details in sync when selection changes
  useEffect(() => {
    setWorkflowName(workflow?.name || "")
    setWorkflowDescription(workflow?.description || "")
  }, [workflow?.name, workflow?.description])

  useEffect(() => {
    if (settings.wsConnected) {
      setWsTesting(false)
    }
  }, [settings.wsConnected])

  const handleSaveWorkflowDetails = () => {
    if (!workflow) return
    updateWorkflow(workflow.id, { name: workflowName.trim(), description: workflowDescription.trim() })
  }

  if (!settings) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p className="text-sm">No settings available</p>
      </div>
    )
  }

  const handleAddSite = () => {
    if (newSite.trim()) {
      addAllowedSite(workflowId, { host: newSite.trim(), favicon: "🌐" })
      setNewSite("")
    }
  }

  const handleAllowCurrentSite = async () => {
    try {
      const q = await sandboxRpc({
        type: "tabs.query",
        query: { active: true, lastFocusedWindow: true },
      })

      if (q?.ok === false && q?.error) {
        console.warn("[settings] tabs.query failed", q.error)
      }

      const tabInfo = Array.isArray(q?.tabs) ? q.tabs[0] : undefined
      if (tabInfo?.id || tabInfo?.url) {
        setLastKnownTab({ id: tabInfo.id, url: tabInfo.url })
      }

      const urlStr = tabInfo?.url || lastKnownTab.url || (typeof window !== "undefined" ? window.location.href : "")
      if (!urlStr) {
        console.warn("[settings] No active tab url found")
        return
      }

      const parsed = new URL(urlStr)
      if (parsed.protocol === "chrome-extension:") {
        console.warn("[settings] Ignoring extension URL when allowing site", urlStr)
        return
      }
      const fullPath = `${parsed.origin}${parsed.pathname}${parsed.search || ""}`
      addAllowedSite(workflowId, { host: fullPath, favicon: "🌐" })
    } catch (err) {
      console.error("[settings] Failed to allow current site", err)
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-3">
            <Accordion type="multiple" defaultValue={["permissions", "connections"]} className="space-y-2">
              {/* Permissions */}
              <AccordionItem value="permissions" className="border border-border rounded-lg px-3">
                <AccordionTrigger className="text-xs font-medium py-2 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5" />
                    Allowed Sites
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                      {settings.allowedSites.length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  {settings.allowedSites.length === 0 && (
                    <div className="p-2 rounded border border-warning/30 bg-warning/5 mb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs">
                          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                          <span>No sites allowed</span>
                        </div>
                        <Button
                          size="sm"
                          className="h-6 text-[10px] px-2 bg-primary text-primary-foreground"
                          onClick={handleAllowCurrentSite}
                        >
                          Allow current site
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {settings.allowedSites.map((site, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 rounded border border-border bg-card"
                      >
                        <div className="flex items-center gap-2">
                          <span>{site.favicon}</span>
                          <span className="text-xs font-mono">{site.host}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() => removeAllowedSite(workflowId, site.host)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-1.5 mt-2">
                    <Input
                      className="h-7 text-xs flex-1"
                      placeholder="e.g. *.example.com"
                      value={newSite}
                      onChange={(e) => setNewSite(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddSite()}
                    />
                    <Button size="sm" className="h-7 px-2" onClick={handleAddSite}>
                      Add
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Connections */}
              <AccordionItem value="connections" className="border border-border rounded-lg px-3">
                <AccordionTrigger className="text-xs font-medium py-2 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-3.5 w-3.5" />
                    Connections
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3 space-y-3">
                  {/* WebSocket */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs flex items-center gap-1.5">
                        <Wifi className="h-3 w-3" />
                        WebSocket
                      </Label>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        {settings.wsConnected ? (
                          <>
                            <CheckCircle2 className="h-3 w-3 text-success" />
                            <span className="text-success">Connected</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3 text-destructive" />
                            <span className="text-destructive">Disconnected</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Input
                        className="h-7 text-[10px] font-mono flex-1"
                        value={settings.wsEndpoint}
                        onChange={(e) => updateSettings(workflowId, { wsEndpoint: e.target.value, wsConnectRequested: true })}
                        placeholder="ws://localhost:8765"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 bg-transparent"
                        onClick={() => {
                          setWsTesting(true)
                          restartWebsocket(workflowId)
                          setTimeout(() => setWsTesting(false), 5000)
                        }}
                      >
                        {wsTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      </Button>
                    </div>
                  <div className="text-[10px] text-muted-foreground">
                    {wsTesting
                      ? "Connecting..."
                      : settings.wsConnected
                        ? "Connected"
                        : "Disconnected"}
                  </div>
                </div>
                </AccordionContent>
              </AccordionItem>

              {/* Defaults */}
              <AccordionItem value="defaults" className="border border-border rounded-lg px-3">
                <AccordionTrigger className="text-xs font-medium py-2 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-3.5 w-3.5" />
                    Defaults
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3 space-y-2">
                  <div className="flex items-center justify-between p-2 rounded border border-border bg-card">
                    <div className="text-xs">
                      <span className="text-muted-foreground">Default Timeout:</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        className="h-6 w-20 text-xs text-right"
                        value={settings.defaultTimeout}
                        onChange={(e) =>
                          updateSettings(workflowId, { defaultTimeout: Number.parseInt(e.target.value) || 5000 })
                        }
                      />
                      <span className="text-[10px] text-muted-foreground">ms</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded border border-border bg-card">
                    <div className="text-xs">
                      <span className="text-muted-foreground">Max Retries:</span>
                    </div>
                    <Input
                      type="number"
                      className="h-6 w-16 text-xs text-right"
                      value={settings.maxRetries}
                      onChange={(e) => updateSettings(workflowId, { maxRetries: Number.parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1 p-2 rounded border border-border bg-card">
                    <Label className="text-xs">Workflow Name</Label>
                    <Input
                      className="h-7 text-xs"
                      placeholder="Workflow name"
                      value={workflowName}
                      onChange={(e) => setWorkflowName(e.target.value)}
                      onBlur={handleSaveWorkflowDetails}
                    />
                    <Label className="text-xs">Workflow Description</Label>
                    <Textarea
                      className="text-xs"
                      rows={3}
                      placeholder="Describe this workflow..."
                      value={workflowDescription}
                      onChange={(e) => setWorkflowDescription(e.target.value)}
                      onBlur={handleSaveWorkflowDetails}
                    />
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSaveWorkflowDetails}>
                        Save
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Storage */}
              <AccordionItem value="storage" className="border border-border rounded-lg px-3">
                <AccordionTrigger className="text-xs font-medium py-2 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Database className="h-3.5 w-3.5" />
                    Storage
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3 space-y-2">
                  <div className="flex items-center justify-between p-2 rounded border border-border bg-card">
                    <div className="text-xs">
                      <span className="text-muted-foreground">Storage type:</span>
                      <span className="ml-1.5 font-medium">chrome.storage.local</span>
                    </div>
                    <Badge variant="secondary" className="text-[9px]">
                      {workflow?.steps.length || 0} steps
                    </Badge>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-7 text-xs gap-1.5 border-border bg-transparent"
                    >
                      <Download className="h-3 w-3" />
                      Backup
                    </Button>
                    <Button variant="destructive" size="sm" className="h-7 text-xs gap-1.5">
                      <Trash2 className="h-3 w-3" />
                      Clear
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Security */}
              <AccordionItem value="security" className="border border-border rounded-lg px-3">
                <AccordionTrigger className="text-xs font-medium py-2 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5" />
                    Security
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3 space-y-2">
                  {/* Cookie Permission */}
                  <div className="flex items-center justify-between p-2 rounded border border-border bg-card">
                    <div className="flex items-center gap-2">
                      <Cookie className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <span className="text-xs">Allow reading cookies</span>
                        <p className="text-[10px] text-muted-foreground">Required for cookie-based steps</p>
                      </div>
                    </div>
                    <Button
                      variant={settings.allowCookies ? "destructive" : "default"}
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={handleRequestCookiePermission}
                      disabled={requestingCookies}
                    >
                      {requestingCookies ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : settings.allowCookies ? (
                        <XCircle className="h-3 w-3" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      {settings.allowCookies ? "Revoke" : "Grant"}
                    </Button>
                  </div>

                  {/* LocalStorage Permission */}
                  <div className="flex items-center justify-between p-2 rounded border border-border bg-card">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <span className="text-xs">Allow reading localStorage</span>
                        <p className="text-[10px] text-muted-foreground">Required for storage-based steps</p>
                      </div>
                    </div>
                    <Button
                      variant={settings.allowStorage ? "destructive" : "default"}
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={handleRequestStoragePermission}
                      disabled={requestingStorage}
                    >
                      {requestingStorage ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : settings.allowStorage ? (
                        <XCircle className="h-3 w-3" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      {settings.allowStorage ? "Revoke" : "Grant"}
                    </Button>
                  </div>

                  {/* Permission Status */}
                  <div className="p-2 rounded border border-border bg-secondary/50">
                    <div className="flex items-center gap-2 text-xs">
                      <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Permission Status:</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant={settings.allowCookies ? "default" : "secondary"} className="text-[9px]">
                        {settings.allowCookies ? "✓ Cookies" : "✗ Cookies"}
                      </Badge>
                      <Badge variant={settings.allowStorage ? "default" : "secondary"} className="text-[9px]">
                        {settings.allowStorage ? "✓ Storage" : "✗ Storage"}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground">
                    These permissions allow workflows to access sensitive data. Grant only if needed for your
                    automation.
                  </p>
                </AccordionContent>
              </AccordionItem>

              {/* Developer */}
              <AccordionItem value="developer" className="border border-border rounded-lg px-3">
                <AccordionTrigger className="text-xs font-medium py-2 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Code className="h-3.5 w-3.5" />
                    Developer
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3 space-y-2">
                  <div className="flex items-center justify-between p-2 rounded border border-border bg-card">
                    <span className="text-xs">Verbose logging</span>
                    <Switch
                      checked={settings.verboseLogging}
                      onCheckedChange={(checked) => updateSettings(workflowId, { verboseLogging: checked })}
                      className="scale-75"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-7 text-xs gap-1.5 border-border bg-transparent"
                      onClick={async () => {
                        const state = {
                          projectId: selectedProjectId,
                          project,
                          workflows,
                          selectedWorkflowId,
                        }
                        const json = JSON.stringify(state, null, 2)
                        const fileName = `developer-state-${Date.now()}.json`
                        try {
                          // Try sandbox-aware download first
                          await sandboxRpc({ type: "download.workflow", fileName, content: json })
                        } catch (err) {
                          console.warn("[developer] sandbox download failed, falling back", err)
                          try {
                            const blob = new Blob([json], { type: "application/json" })
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement("a")
                            a.href = url
                            a.download = fileName
                            document.body.appendChild(a)
                            a.click()
                            document.body.removeChild(a)
                            URL.revokeObjectURL(url)
                          } catch (fallbackErr) {
                            console.error("[developer] export failed", fallbackErr)
                          }
                        }
                      }}
                    >
                      <Download className="h-3 w-3" />
                      Export State
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-7 text-xs gap-1.5 border-border bg-transparent"
                      onClick={() => {
                        console.log("[developer] current state", {
                          projectId: selectedProjectId,
                          project,
                          workflows,
                          selectedWorkflowId,
                        })
                      }}
                    >
                      <Code className="h-3 w-3" />
                      Console
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Danger Zone */}
              <AccordionItem value="danger" className="border border-border rounded-lg px-3">
                <AccordionTrigger className="text-xs font-medium py-2 hover:no-underline">
                  <div className="flex items-center gap-2 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                    Danger Zone
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <div className="p-2 rounded border border-destructive/40 bg-background flex items-center justify-between">
                    <div className="text-xs">
                      <p className="text-foreground font-medium">Delete this project</p>
                      <p className="text-[10px] text-muted-foreground">This removes the project from the list.</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-destructive text-destructive hover:bg-destructive/10"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={!selectedProjectId}
                    >
                      Delete project
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </ScrollArea>
      </div>
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete project?</DialogTitle>
            <DialogDescription>This will remove the project from your list.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!selectedProjectId) return
                deleteProject(selectedProjectId)
                setSelectedProjectId(null)
                setShowDeleteConfirm(false)
              }}
            >
              Yes, delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
